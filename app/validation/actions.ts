"use server";

import { prisma } from '../../lib/prisma';
import { getSession } from '../../lib/auth';
import { isValidTimezone } from '../../lib/notifications/quietHours';
import { DEFAULT_REMINDER_TIMES, findDueGoals, getValidationConfig } from '../../lib/goalValidation/settings';
import { resumeDueGoals } from '../../lib/goalValidation/resume';
import {
  MAX_REMINDER_TIMES,
  type ValidationOverview,
  type ValidationSettingsInput,
  type ValidationState,
} from '../../types/validation';

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session || typeof session.userId !== 'string') throw new Error('Unauthorized');
  return session.userId;
}

const isMinute = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1440;

export async function getValidationState(): Promise<ValidationState> {
  const userId = await requireUserId();
  const [row, pushDeviceCount] = await Promise.all([
    prisma.validationSettings.findUnique({ where: { userId } }),
    prisma.pushSubscription.count({ where: { userId } }),
  ]);
  return {
    enabled: row?.enabled ?? false,
    timezone: row?.timezone ?? 'UTC',
    dayStartMin: row?.dayStartMin ?? 420,
    reminderTimes: row?.reminderTimes ?? DEFAULT_REMINDER_TIMES,
    pushDeviceCount,
  };
}

export async function saveValidationSettings(
  input: ValidationSettingsInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();

  if (typeof input?.timezone !== 'string' || !isValidTimezone(input.timezone)) return { ok: false, error: 'Invalid timezone.' };
  if (!isMinute(input.dayStartMin)) return { ok: false, error: 'Invalid day start time.' };
  if (!Array.isArray(input.reminderTimes) || !input.reminderTimes.every(isMinute)) {
    return { ok: false, error: 'Invalid reminder times.' };
  }
  const reminderTimes = [...new Set(input.reminderTimes)].sort((a, b) => a - b);
  if (reminderTimes.length < 1 || reminderTimes.length > MAX_REMINDER_TIMES) {
    return { ok: false, error: `Choose between 1 and ${MAX_REMINDER_TIMES} different reminder times.` };
  }

  const data = { enabled: Boolean(input.enabled), timezone: input.timezone, dayStartMin: input.dayStartMin, reminderTimes };
  await prisma.validationSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return { ok: true };
}

// Goals that need validating right now (drives the header badge)
export async function getValidationOverview(): Promise<ValidationOverview> {
  const userId = await requireUserId();
  const now = new Date();
  await resumeDueGoals(now, userId);

  const cfg = await getValidationConfig(prisma, userId);
  if (!cfg.enabled) return { enabled: false, dueCount: 0, due: [] };

  const due = await findDueGoals(prisma, userId, cfg, now);
  return {
    enabled: true,
    dueCount: due.length,
    due: due.map((d) => ({ id: d.id, name: d.name, rootName: d.rootName })),
  };
}
