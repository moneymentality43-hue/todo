import { prisma } from '../prisma';
import { NOTIFICATION_TYPES, type NotificationType } from './types';
import type { QuietWindow } from './quietHours';

export interface ResolvedSettings extends QuietWindow {
  enabled: boolean;
  typePrefs: Partial<Record<NotificationType, boolean>>;
}

export const DEFAULT_SETTINGS: ResolvedSettings = {
  enabled: true,
  timezone: 'UTC',
  quietStart: null,
  quietEnd: null,
  typePrefs: {},
};

export async function getSettings(userId: string): Promise<ResolvedSettings> {
  const row = await prisma.notificationSettings.findUnique({ where: { userId } });
  if (!row) return DEFAULT_SETTINGS;
  const prefs = row.typePrefs && typeof row.typePrefs === 'object' && !Array.isArray(row.typePrefs) ? row.typePrefs : {};
  return {
    enabled: row.enabled,
    timezone: row.timezone,
    quietStart: row.quietStart,
    quietEnd: row.quietEnd,
    typePrefs: prefs as ResolvedSettings['typePrefs'],
  };
}

export function isTypeEnabled(settings: ResolvedSettings, type: NotificationType): boolean {
  if (!settings.enabled) return false;
  return settings.typePrefs[type] ?? NOTIFICATION_TYPES[type].defaultEnabled;
}
