"use server";

import { prisma } from '../../lib/prisma';
import { getSession } from '../../lib/auth';
import { notify } from '../../lib/notifications/service';
import { getSettings, isTypeEnabled } from '../../lib/notifications/preferences';
import { isValidTimezone } from '../../lib/notifications/quietHours';
import {
  NOTIFICATION_TYPES,
  USER_TOGGLEABLE_TYPES,
  isNotificationType,
  type NotificationType,
} from '../../lib/notifications/types';

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session || typeof session.userId !== 'string') throw new Error('Unauthorized');
  return session.userId;
}

export interface NotificationState {
  enabled: boolean;
  timezone: string;
  quietStart: number | null;
  quietEnd: number | null;
  deviceCount: number;
  types: { type: NotificationType; label: string; description: string; enabled: boolean }[];
}

export async function getNotificationState(): Promise<NotificationState> {
  const userId = await requireUserId();
  const [settings, deviceCount] = await Promise.all([
    getSettings(userId),
    prisma.pushSubscription.count({ where: { userId } }),
  ]);
  return {
    enabled: settings.enabled,
    timezone: settings.timezone,
    quietStart: settings.quietStart,
    quietEnd: settings.quietEnd,
    deviceCount,
    types: USER_TOGGLEABLE_TYPES.map((type) => ({
      type,
      label: NOTIFICATION_TYPES[type].label,
      description: NOTIFICATION_TYPES[type].description,
      enabled: isTypeEnabled({ ...settings, enabled: true }, type),
    })),
  };
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribePush(sub: PushSubscriptionInput, userAgent?: string) {
  const userId = await requireUserId();

  const valid =
    typeof sub?.endpoint === 'string' &&
    sub.endpoint.length <= 2048 &&
    sub.endpoint.startsWith('https://') &&
    typeof sub.keys?.p256dh === 'string' &&
    typeof sub.keys?.auth === 'string' &&
    sub.keys.p256dh.length <= 256 &&
    sub.keys.auth.length <= 256;
  if (!valid) return { ok: false as const, error: 'Invalid subscription' };

  // An endpoint identifies one browser; if it was registered by another account, move it to this one
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 300),
    },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
  });
  return { ok: true as const };
}

export async function unsubscribePush(endpoint: string) {
  const userId = await requireUserId();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return { ok: true as const };
}

export interface NotificationSettingsInput {
  enabled: boolean;
  timezone: string;
  quietStart: number | null;
  quietEnd: number | null;
  typePrefs: Record<string, boolean>;
}

const isMinute = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1440;

export async function updateNotificationSettings(input: NotificationSettingsInput) {
  const userId = await requireUserId();

  if (!isValidTimezone(input.timezone)) return { ok: false as const, error: 'Invalid timezone' };
  const quietOn = input.quietStart !== null && input.quietEnd !== null;
  if (quietOn && (!isMinute(input.quietStart) || !isMinute(input.quietEnd))) {
    return { ok: false as const, error: 'Invalid quiet hours' };
  }

  const typePrefs: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input.typePrefs ?? {})) {
    if (isNotificationType(key) && USER_TOGGLEABLE_TYPES.includes(key) && typeof value === 'boolean') {
      typePrefs[key] = value;
    }
  }

  const data = {
    enabled: Boolean(input.enabled),
    timezone: input.timezone,
    quietStart: quietOn ? input.quietStart : null,
    quietEnd: quietOn ? input.quietEnd : null,
    typePrefs,
  };
  await prisma.notificationSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return { ok: true as const };
}

export async function sendTestNotification() {
  const userId = await requireUserId();
  const result = await notify({
    userId,
    type: 'TEST',
    dedupeKey: `test:${userId}:${Date.now()}`,
    title: 'Notifications are working',
    body: 'You will get reminders here even when the app is closed.',
    url: '/',
    expiresAt: new Date(Date.now() + 2 * 60_000),
  });

  const messages: Record<string, string> = {
    SENT: 'Test notification sent.',
    SKIPPED:
      result.reason === 'no_devices'
        ? 'No device is subscribed yet. Enable notifications on this device first.'
        : result.reason === 'disabled'
          ? 'Notifications are turned off in your settings.'
          : 'Notification was skipped.',
    RETRY: 'Could not reach the push service, will retry shortly.',
    FAILED: `Delivery failed: ${result.reason ?? 'unknown error'}`,
    DEFERRED: 'Notification is held until quiet hours end.',
    DUPLICATE: 'Notification was already handled.',
  };
  return { ok: result.status === 'SENT', message: messages[result.status] ?? 'Done.' };
}
