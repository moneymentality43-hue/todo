"use server";

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getTasks() {
  return await prisma.task.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

export async function createTaskAction(data: any) {
  return await prisma.task.create({
    data: {
      rail: data.rail,
      title: data.title,
      deadline: new Date(data.deadline), // Save as strict Date
      importanceLevel: data.importanceLevel,
      lightColor: data.lightColor,
      microStep: data.microStep,
    }
  });
}

export async function updateTaskAction(id: string, data: any) {
  return await prisma.task.update({
    where: { id },
    data: {
      rail: data.rail,
      title: data.title,
      deadline: new Date(data.deadline), // Save as strict Date
      importanceLevel: data.importanceLevel,
      lightColor: data.lightColor,
      microStep: data.microStep,
    }
  });
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
