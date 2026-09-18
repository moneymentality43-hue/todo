"use server";

import { PrismaClient } from '@prisma/client';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';

const prisma = new PrismaClient();

export async function getTasks() {
  noStore(); // <--- THIS is the correct, safe way to kill caching for this fetch!
  return await prisma.task.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

export async function createTaskAction(data: any) {
  const newTask = await prisma.task.create({
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
  return newTask;
}

export async function updateTaskAction(id: string, data: any) {
  const updatedTask = await prisma.task.update({
    where: { id },
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
  await prisma.task.delete({ where: { id } });
  return true;
}

export async function completeTaskAction(id: string, score: string, reflection: string, completedAt: string, isFailed: boolean = false) {
  return await prisma.task.update({
    where: { id },
    data: {
      status: isFailed ? 'FAILED' : 'COMPLETED',
      score,
      reflection,
      completedAt,
    }
  });
}

export async function restoreTaskAction(id: string) {
  return await prisma.task.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      score: null,
      reflection: null,
      completedAt: null,
    }
  });
}
