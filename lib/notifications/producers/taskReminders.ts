import { prisma } from '../../prisma';
import { notify } from '../service';
import type { NotificationProducer, NotificationType } from '../types';

export interface ReminderTask {
  id: string;
  userId: string;
  title: string;
  deadline: Date;
  warningThresholdMin: number;
  notificationIntervalMin: number | null;
}

export interface PlannedReminder {
  type: NotificationType;
  dedupeKey: string;
  minutesLeft: number;
}

// Decides which reminder (if any) a task needs right now. Pure, so it is easy to test.
//  - Warning: once, as soon as now is inside [deadline - warningThreshold, deadline).
//  - Repeat: one per interval slot, only after the warning, and only the latest slot
//    (no flood after downtime). A warning issued mid-slot also covers that slot.
// `warnIssuedAt` is when the warning was first recorded (null = never).
// The deadline is part of every key, so editing a deadline re-arms the reminders.
export function planReminder(task: ReminderTask, now: Date, warnIssuedAt: Date | null): PlannedReminder | null {
  const deadlineMs = task.deadline.getTime();
  const nowMs = now.getTime();
  if (deadlineMs <= nowMs) return null;

  const windowStart = deadlineMs - task.warningThresholdMin * 60_000;
  if (nowMs < windowStart) return null;

  const minutesLeft = Math.max(1, Math.ceil((deadlineMs - nowMs) / 60_000));

  if (!warnIssuedAt) {
    return { type: 'TASK_WARNING', dedupeKey: `task:${task.id}:warn:${deadlineMs}`, minutesLeft };
  }

  const interval = task.notificationIntervalMin;
  if (interval && interval > 0) {
    const slot = Math.floor((nowMs - windowStart) / (interval * 60_000));
    const slotStart = windowStart + slot * interval * 60_000;
    if (slot >= 1 && warnIssuedAt.getTime() < slotStart) {
      return { type: 'TASK_REPEAT', dedupeKey: `task:${task.id}:repeat:${deadlineMs}:${slot}`, minutesLeft };
    }
  }
  return null;
}

export function formatTimeLeft(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export const taskReminderProducer: NotificationProducer = {
  name: 'task-reminders',

  async run(now) {
    const tasks = await prisma.task.findMany({
      where: { status: 'ACTIVE', deadline: { gt: now } },
      select: {
        id: true,
        userId: true,
        title: true,
        deadline: true,
        warningThresholdMin: true,
        notificationIntervalMin: true,
        microStep: true,
      },
      take: 2000,
    });

    // Tasks that already have their warning recorded (any status), to decide warning vs repeat
    const warnKeys = tasks.map((t) => `task:${t.id}:warn:${t.deadline.getTime()}`);
    const warned = await prisma.notificationLog.findMany({
      where: { dedupeKey: { in: warnKeys } },
      select: { dedupeKey: true, createdAt: true },
    });
    const warnIssuedAt = new Map(warned.map((w) => [w.dedupeKey, w.createdAt]));

    let created = 0;
    for (const task of tasks) {
      const plan = planReminder(task, now, warnIssuedAt.get(`task:${task.id}:warn:${task.deadline.getTime()}`) ?? null);
      if (!plan) continue;

      const left = formatTimeLeft(plan.minutesLeft);
      const result = await notify({
        userId: task.userId,
        type: plan.type,
        dedupeKey: plan.dedupeKey,
        title: plan.type === 'TASK_WARNING' ? `Due in ${left}` : `Reminder: ${left} left`,
        body: task.microStep ? `${task.title} - next: ${task.microStep}` : task.title,
        url: '/',
        data: { taskId: task.id },
        expiresAt: task.deadline,
      });
      if (result.status !== 'DUPLICATE') created++;
    }
    return { created };
  },
};
