"use server";

import { PrismaClient } from '@prisma/client';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { encrypt, getSession } from '../lib/auth';

const prisma = new PrismaClient();

// ==========================================
// 1. AUTHENTICATION ACTIONS
// ==========================================

export async function loginAction(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required' };
  }

  const user = await prisma.user.findUnique({
    where: { username }
  });

  let validUser = user;
  if (!user) {
    const hashedPassword = await bcrypt.hash(password, 10);
    validUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword
      }
    });
  } else {
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return { error: 'Invalid credentials' };
    }
  }

  const session = await encrypt({ userId: validUser.id });
  
  const cookieStore = await cookies();
  cookieStore.set('gof_session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 72 * 60 * 60, // 72 hours
    path: '/',
  });

  return { success: true };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('gof_session');
}

// ==========================================
// HELPER: ENSURE AUTHENTICATION
// ==========================================

async function requireAuth() {
  const session = await getSession();
  if (!session || !session.userId) {
    throw new Error('Unauthorized');
  }
  return session.userId;
}

// ==========================================
// 2. TASK ACTIONS (SECURED)
// ==========================================

export async function getTasks() {
  noStore(); 
  const userId = await requireAuth(); 

  return await prisma.task.findMany({
    where: { userId }, 
    orderBy: { createdAt: 'desc' }
  });
}

export async function createTaskAction(data: any) {
  const userId = await requireAuth();

  const newTask = await prisma.task.create({
    data: {
      userId, 
      rail: data.rail,
      title: data.title,
      deadline: new Date(data.deadline), 
      importanceLevel: data.importanceLevel,
      lightColor: data.lightColor,
      microStep: data.microStep,
      warningThresholdMin: Number(data.warningThresholdMin) || 120,
      notificationIntervalMin: data.notificationIntervalMin ? Number(data.notificationIntervalMin) : null,
    }
  });
  revalidatePath('/');
  return newTask;
}

export async function updateTaskAction(id: string, data: any) {
  const userId = await requireAuth();

  const updatedTask = await prisma.task.update({
    where: { id, userId }, 
    data: {
      rail: data.rail,
      title: data.title,
      deadline: new Date(data.deadline), 
      importanceLevel: data.importanceLevel,
      lightColor: data.lightColor,
      microStep: data.microStep,
      warningThresholdMin: Number(data.warningThresholdMin) || 120,
      notificationIntervalMin: data.notificationIntervalMin ? Number(data.notificationIntervalMin) : null,
    }
  });
  revalidatePath('/');
  return updatedTask;
}

export async function deleteTaskAction(id: string) {
  const userId = await requireAuth();
  await prisma.task.delete({ where: { id, userId } });
  return true;
}

export async function completeTaskAction(id: string, score: string, reflection: string, completedAt: string, isFailed: boolean = false) {
  const userId = await requireAuth();
  return await prisma.task.update({
    where: { id, userId },
    data: {
      status: isFailed ? 'FAILED' : 'COMPLETED',
      score,
      reflection,
      completedAt,
    }
  });
}

export async function restoreTaskAction(id: string) {
  const userId = await requireAuth();
  return await prisma.task.update({
    where: { id, userId },
    data: {
      status: 'ACTIVE',
      score: null,
      reflection: null,
      completedAt: null,
    }
  });
}

// ==========================================
// 3. PROGRESS ENGINE ACTIONS (SECURED)
// ==========================================

export async function getMilestones() {
  noStore();
  const userId = await requireAuth();

  return await prisma.milestone.findMany({
    where: { userId },
    include: {
      metrics: { orderBy: { createdAt: 'asc' } }
    },
    orderBy: { date: 'desc' } // Chronological sorting (newest first)
  });
}

export async function createMilestoneAction(dateString: string) {
  const userId = await requireAuth();
  const dateObj = new Date(dateString);

  const newMilestone = await prisma.milestone.create({
    data: {
      userId,
      dateString,
      date: isNaN(dateObj.getTime()) ? new Date() : dateObj,
    },
    include: { metrics: true }
  });
  revalidatePath('/progress');
  return newMilestone;
}

export async function createMetricAction(milestoneId: string, name: string, val: number) {
  const userId = await requireAuth();
  
  // Verify ownership before modifying
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId, userId } });
  if (!milestone) throw new Error('Unauthorized');

  await prisma.metric.create({
    data: { milestoneId, name, val }
  });
  revalidatePath('/progress');
}

export async function updateMetricValAction(metricId: string, newVal: number) {
  const userId = await requireAuth();
  
  // Verify ownership
  const metric = await prisma.metric.findUnique({ where: { id: metricId }, include: { milestone: true } });
  if (!metric || metric.milestone.userId !== userId) throw new Error('Unauthorized');

  await prisma.metric.update({
    where: { id: metricId },
    data: { val: newVal }
  });
  revalidatePath('/progress');
}

export async function deleteMetricAction(metricId: string) {
  const userId = await requireAuth();
  
  // Verify ownership
  const metric = await prisma.metric.findUnique({ where: { id: metricId }, include: { milestone: true } });
  if (!metric || metric.milestone.userId !== userId) throw new Error('Unauthorized');

  await prisma.metric.delete({ where: { id: metricId } });
  revalidatePath('/progress');
}

export async function deleteMilestoneAction(milestoneId: string) {
  const userId = await requireAuth();
  
  // Verify ownership before deleting
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId, userId } });
  if (!milestone) throw new Error('Unauthorized');

  // Because of onDelete: Cascade in the schema, this safely deletes all attached metrics too!
  await prisma.milestone.delete({ where: { id: milestoneId } });
  revalidatePath('/progress');
}
