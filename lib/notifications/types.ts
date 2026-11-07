// Central registry of notification types. To add a new kind of notification, add one entry here
// and call notify() with that type. Nothing else needs to change.

export type QuietHoursPolicy =
  | 'skip' // drop it if it falls inside quiet hours
  | 'defer' // hold it and send when quiet hours end
  | 'ignore'; // always send immediately

export interface NotificationTypeDef {
  label: string;
  description: string;
  defaultEnabled: boolean;
  quietHours: QuietHoursPolicy;
}

export const NOTIFICATION_TYPES = {
  TASK_WARNING: {
    label: 'Deadline warnings',
    description: 'One alert when a task enters its warning window before the deadline.',
    defaultEnabled: true,
    quietHours: 'defer',
  },
  TASK_REPEAT: {
    label: 'Repeating reminders',
    description: 'Follow-up reminders at the interval set on a task until it is due.',
    defaultEnabled: true,
    quietHours: 'skip',
  },
  TEST: {
    label: 'Test notification',
    description: 'Manually triggered from the settings panel.',
    defaultEnabled: true,
    quietHours: 'ignore',
  },
} as const satisfies Record<string, NotificationTypeDef>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

// Types the user can switch on/off in the UI
export const USER_TOGGLEABLE_TYPES: NotificationType[] = ['TASK_WARNING', 'TASK_REPEAT'];

export function isNotificationType(value: string): value is NotificationType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, value);
}

// What a channel actually delivers
export interface NotificationMessage {
  title: string;
  body: string;
  url?: string; // same-origin path, e.g. "/progress"
  data?: Record<string, unknown>;
}

export interface NotifyInput extends NotificationMessage {
  userId: string;
  type: NotificationType;
  // Unique per logical notification. Re-sending the same key is a no-op.
  dedupeKey: string;
  // Drop instead of sending if still unsent after this moment
  expiresAt?: Date;
}

export type NotifyStatus = 'SENT' | 'DEFERRED' | 'SKIPPED' | 'DUPLICATE' | 'RETRY' | 'FAILED';

export interface NotifyResult {
  status: NotifyStatus;
  reason?: string;
}

// A delivery mechanism (web push now; email/SMS later). Implement and register in channels/index.ts.
export type ChannelOutcome =
  | { status: 'sent' }
  | { status: 'no_target' } // the user has nowhere to receive this on this channel
  | { status: 'failed'; error: string };

export interface NotificationChannel {
  id: string;
  send(userId: string, message: NotificationMessage & { tag: string }): Promise<ChannelOutcome>;
}

// Anything that creates notifications on a schedule. Implement and register in producers/index.ts.
export interface NotificationProducer {
  name: string;
  run(now: Date): Promise<{ created: number }>;
}
