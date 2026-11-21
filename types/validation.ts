// Shared goal-validation / pause constants and DTOs (client + server safe)

export const VALIDATION_MIN_WORDS = 100;
export const PAUSE_MIN_WORDS = 20;
export const LONG_TEXT_MAX = 6000;
export const MAX_PAUSE_DAYS = 30;
export const MIN_PAUSE_LEAD_MIN = 5;
export const MAX_REMINDER_TIMES = 4;
export const PERIOD_MIN = 1;
export const PERIOD_MAX = 30;
export const PERIOD_OPTIONS = [1, 2, 3, 7, 14, 30] as const;

// Window event dispatched whenever goal data changes, so the header badge can refresh
export const VALIDATION_CHANGED_EVENT = 'validation:changed';
// Dispatched after the validation settings are saved, so open goal views re-read what they show
export const VALIDATION_SETTINGS_EVENT = 'validation:settings';

export function countWords(s: string): number {
  const t = s.trim();
  return t === '' ? 0 : t.split(/\s+/u).length;
}

export interface ValidationState {
  enabled: boolean;
  timezone: string;
  dayStartMin: number;
  reminderTimes: number[];
  pushDeviceCount: number;
}

export interface ValidationSettingsInput {
  enabled: boolean;
  timezone: string;
  dayStartMin: number;
  reminderTimes: number[];
}

export interface ValidationOverview {
  enabled: boolean;
  dueCount: number;
  due: { id: string; name: string; rootName: string }[];
}

export interface GoalValidationDTO {
  id: string;
  direct: boolean;
  viaGoalName: string | null;
  text: string;
  wordCount: number;
  createdAt: string;
}

export interface GoalPauseDTO {
  id: string;
  reason: string;
  pausedAt: string;
  resumeAt: string;
  resumedAt: string | null;
  resumeKind: string | null;
  cascadedCount: number;
}
