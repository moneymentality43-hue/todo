"use server";

import { Prisma } from '@prisma/client';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { encrypt, getSession } from '../lib/auth';
import { prisma } from '../lib/prisma';
import {
  FIELD_LIMITS,
  LIGHT_COLORS,
  TASK_RAILS,
  isPasswordWithinLimit,
  normalizeUsername,
  optionalText,
  requireDate,
  requireInt,
  requireOneOf,
  requireText,
  validateNewPassword,
  validateUsername,
} from '../lib/validation';

// ==========================================
// 1. AUTHENTICATION ACTIONS
// ==========================================

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const INVALID_CREDENTIALS = 'Invalid username or password';

// Compared against when the user does not exist so that response time does not reveal which usernames are registered
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_COST));

async function startSession(userId: string) {
  const session = await encrypt({ userId });
  const cookieStore = await cookies();
  cookieStore.set('gof_session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 72 * 60 * 60, // 72 hours
    path: '/',
  });
}

function readField(formData: FormData, name: string): string {
  const value = formData?.get(name);
  return typeof value === 'string' ? value : '';
}

export async function signInAction(formData: FormData) {
  const rawUsername = readField(formData, 'username');
  const password = readField(formData, 'password');

  if (!rawUsername || !password) {
    return { error: 'Username and password are required' };
  }
  // Oversized input is rejected before it reaches bcrypt or the database
  const username = normalizeUsername(rawUsername);
  if (username.length > FIELD_LIMITS.usernameMax || !isPasswordWithinLimit(password)) {
    return { error: INVALID_CREDENTIALS };
  }

  // Insensitive so accounts created before usernames were normalised can still sign in
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });

  if (!user) {
    await bcrypt.compare(password, await getDummyHash());
    return { error: INVALID_CREDENTIALS };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: 'Too many failed attempts. Try again in a few minutes.' };
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    const { failedLoginCount } = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount >= MAX_FAILED_LOGINS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
      });
    }
    return { error: INVALID_CREDENTIALS };
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  }

  await startSession(user.id);
  return { success: true };
}

export async function signUpAction(formData: FormData) {
  const rawUsername = readField(formData, 'username');
  const password = readField(formData, 'password');
  const confirm = readField(formData, 'confirmPassword');

  const usernameCheck = validateUsername(rawUsername);
  if (usernameCheck.ok === false) return { error: usernameCheck.error };
  const { username } = usernameCheck;

  const passwordCheck = validateNewPassword(password, username);
  if (passwordCheck.ok === false) return { error: passwordCheck.error };
  if (password !== confirm) return { error: 'Passwords do not match' };

  const taken = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true },
  });
  if (taken) return { error: 'That username is already taken' };

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
  let userId: string;
  try {
    const user = await prisma.user.create({ data: { username, password: hashedPassword }, select: { id: true } });
    userId = user.id;
  } catch (e) {
    // Two signups for the same name racing past the check above
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'That username is already taken' };
    }
    throw e;
  }

  await startSession(userId);
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

function parseTaskInput(data: Record<string, unknown> | null | undefined) {
  const rail = requireOneOf(data?.rail, TASK_RAILS, 'Rail');
  const notificationIntervalMin =
    data?.notificationIntervalMin === null || data?.notificationIntervalMin === undefined || data?.notificationIntervalMin === ''
      ? null
      : requireInt(data.notificationIntervalMin, 1, FIELD_LIMITS.maxMinutes, 'Notification interval');
  const warningRaw = Number(data?.warningThresholdMin);

  return {
    rail,
    title: requireText(data?.title, FIELD_LIMITS.title, 'Title'),
    deadline: requireDate(data?.deadline, 'Deadline'),
    importanceLevel: requireInt(data?.importanceLevel, 1, 5, 'Importance level'),
    lightColor: requireOneOf(data?.lightColor, LIGHT_COLORS, 'Light color'),
    microStep: requireText(data?.microStep, FIELD_LIMITS.microStep, 'Starter step'),
    warningThresholdMin: warningRaw ? requireInt(warningRaw, 1, FIELD_LIMITS.maxMinutes, 'Warning threshold') : 120,
    notificationIntervalMin,
  };
}

export async function createTaskAction(data: any) {
  const userId = await requireAuth();

  const newTask = await prisma.task.create({
    data: { userId, ...parseTaskInput(data) }
  });
  revalidatePath('/');
  return newTask;
}

export async function updateTaskAction(id: string, data: any) {
  const userId = await requireAuth();

  const updatedTask = await prisma.task.update({
    where: { id, userId }, 
    data: parseTaskInput(data)
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
      score: requireText(score, FIELD_LIMITS.score, 'Score'),
      reflection: optionalText(reflection, FIELD_LIMITS.longText, 'Reflection') ?? '',
      completedAt: optionalText(completedAt, FIELD_LIMITS.completedAt, 'Completion time') ?? '',
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
  const label = requireText(dateString, FIELD_LIMITS.dateString, 'Date');
  const dateObj = new Date(label);

  const newMilestone = await prisma.milestone.create({
    data: {
      userId,
      dateString: label,
      date: isNaN(dateObj.getTime()) ? new Date() : dateObj,
    },
    include: { metrics: true }
  });
  revalidatePath('/progress');
  return newMilestone;
}

export async function createMetricAction(milestoneId: string, name: string, val: number) {
  const userId = await requireAuth();
  const cleanName = requireText(name, FIELD_LIMITS.metricName, 'Metric name');
  const cleanVal = requireInt(val, -FIELD_LIMITS.maxValue, FIELD_LIMITS.maxValue, 'Metric value');
  
  // Verify ownership before modifying
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId, userId } });
  if (!milestone) throw new Error('Unauthorized');

  await prisma.metric.create({
    data: { milestoneId, name: cleanName, val: cleanVal }
  });
  revalidatePath('/progress');
}

export async function updateMetricValAction(metricId: string, newVal: number) {
  const userId = await requireAuth();
  const cleanVal = requireInt(newVal, -FIELD_LIMITS.maxValue, FIELD_LIMITS.maxValue, 'Metric value');
  
  // Verify ownership
  const metric = await prisma.metric.findUnique({ where: { id: metricId }, include: { milestone: true } });
  if (!metric || metric.milestone.userId !== userId) throw new Error('Unauthorized');

  await prisma.metric.update({
    where: { id: metricId },
    data: { val: cleanVal }
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
