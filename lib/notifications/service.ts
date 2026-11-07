import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { channels } from './channels';
import { getSettings, isTypeEnabled } from './preferences';
import { isQuietNow, quietEndsAt } from './quietHours';
import {
  NOTIFICATION_TYPES,
  isNotificationType,
  type NotifyInput,
  type NotifyResult,
} from './types';

const MAX_ATTEMPTS = 4;
const LEASE_MS = 5 * 60_000;

// ==========================================================
// PUBLIC API - the only function other features need to call.
//
//   await notify({
//     userId, type: 'TASK_WARNING', dedupeKey: `task:${id}:warn`,
//     title: 'Due soon', body: '...', url: '/',
//   });
//
// It applies the user's preferences and quiet hours, makes the call idempotent via
// dedupeKey, and delivers through every registered channel.
// ==========================================================
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  if (!isNotificationType(input.type)) throw new Error(`Unknown notification type: ${input.type}`);
  const def = NOTIFICATION_TYPES[input.type];
  const now = new Date();
  const settings = await getSettings(input.userId);

  let status: 'PENDING' | 'SKIPPED' = 'PENDING';
  let reason: string | undefined;
  let sendAfter = now;

  if (!isTypeEnabled(settings, input.type)) {
    status = 'SKIPPED';
    reason = 'disabled';
  } else if (isQuietNow(now, settings) && def.quietHours !== 'ignore') {
    if (def.quietHours === 'skip') {
      status = 'SKIPPED';
      reason = 'quiet_hours';
    } else {
      sendAfter = quietEndsAt(now, settings) ?? now;
    }
  }

  let logId: string;
  try {
    const log = await prisma.notificationLog.create({
      data: {
        userId: input.userId,
        type: input.type,
        dedupeKey: input.dedupeKey,
        title: input.title,
        body: input.body,
        url: input.url,
        data: input.data as Prisma.InputJsonValue | undefined,
        status,
        error: reason,
        sendAfter,
        expiresAt: input.expiresAt,
      },
    });
    logId = log.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { status: 'DUPLICATE' };
    }
    throw e;
  }

  if (status === 'SKIPPED') return { status: 'SKIPPED', reason };
  if (sendAfter > now) return { status: 'DEFERRED', reason: 'quiet_hours' };
  return dispatch(logId);
}

// Sends one stored notification. Safe against concurrent runners: a short lease is taken first.
async function dispatch(id: string): Promise<NotifyResult> {
  const now = new Date();
  const claimed = await prisma.notificationLog.updateMany({
    where: { id, status: 'PENDING', sendAfter: { lte: now } },
    data: { sendAfter: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return { status: 'DUPLICATE', reason: 'already handled' };

  const log = await prisma.notificationLog.findUniqueOrThrow({ where: { id } });
  const finish = (status: 'SENT' | 'SKIPPED' | 'FAILED', error?: string) =>
    prisma.notificationLog.update({
      where: { id },
      data: { status, error: error ?? null, sentAt: status === 'SENT' ? new Date() : null },
    });

  if (log.expiresAt && log.expiresAt < now) {
    await finish('SKIPPED', 'expired');
    return { status: 'SKIPPED', reason: 'expired' };
  }

  // Preferences may have changed while a deferred notification was waiting
  if (isNotificationType(log.type) && !isTypeEnabled(await getSettings(log.userId), log.type)) {
    await finish('SKIPPED', 'disabled');
    return { status: 'SKIPPED', reason: 'disabled' };
  }

  const message = {
    title: log.title,
    body: log.body,
    url: log.url ?? undefined,
    data: (log.data as Record<string, unknown> | null) ?? undefined,
    tag: log.dedupeKey,
  };
  const outcomes = await Promise.all(
    channels.map((c) => c.send(log.userId, message).catch((e) => ({ status: 'failed' as const, error: String(e?.message ?? e) })))
  );

  if (outcomes.some((o) => o.status === 'sent')) {
    await finish('SENT');
    return { status: 'SENT' };
  }

  const failure = outcomes.find((o) => o.status === 'failed');
  if (failure && failure.status === 'failed') {
    if (log.attempts >= MAX_ATTEMPTS) {
      await finish('FAILED', failure.error);
      return { status: 'FAILED', reason: failure.error };
    }
    await prisma.notificationLog.update({
      where: { id },
      data: { error: failure.error, sendAfter: new Date(Date.now() + log.attempts * 2 * 60_000) },
    });
    return { status: 'RETRY', reason: failure.error };
  }

  await finish('SKIPPED', 'no_devices');
  return { status: 'SKIPPED', reason: 'no_devices' };
}

// Sends everything that is due: deferred (quiet hours) and retries. Called by the cron route.
export async function flushPending(limit = 100): Promise<{ processed: number }> {
  const due = await prisma.notificationLog.findMany({
    where: { status: 'PENDING', sendAfter: { lte: new Date() } },
    orderBy: { sendAfter: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const { id } of due) await dispatch(id);
  return { processed: due.length };
}
