// Pure validity rules. A validation lasts until the Nth next "day start" boundary in the user's timezone.

import { localParts, zonedToUtc } from '../time/zoned';

export interface ValidationConfig {
  enabled: boolean;
  timezone: string;
  dayStartMin: number;
}

export const DISABLED_CONFIG: ValidationConfig = { enabled: false, timezone: 'UTC', dayStartMin: 420 };

// First day-start boundary strictly after `lastValidatedAt`, plus (periodDays - 1) local days.
// Validated Mon 22:00 with a 07:00 day start and a 1-day period -> valid until Tue 07:00.
export function validUntil(lastValidatedAt: Date, periodDays: number, dayStartMin: number, timeZone: string): Date {
  const p = localParts(lastValidatedAt, timeZone);
  const firstBoundaryDay = p.minuteOfDay < dayStartMin ? p.day : p.day + 1;
  return zonedToUtc(p.year, p.month, firstBoundaryDay + (periodDays - 1), dayStartMin, timeZone);
}

export interface ValidatableGoal {
  status: string;
  validationPeriodDays: number;
  lastValidatedAt: Date | null;
  resumedAt: Date | null;
}

export function goalValidUntil(goal: ValidatableGoal, cfg: ValidationConfig): Date | null {
  if (!goal.lastValidatedAt) return null;
  return validUntil(goal.lastValidatedAt, goal.validationPeriodDays, cfg.dayStartMin, cfg.timezone);
}

// Only in-progress goals ever need validation; paused and completed goals never do.
export function needsValidation(goal: ValidatableGoal, cfg: ValidationConfig, now: Date): boolean {
  if (!cfg.enabled || goal.status !== 'IN_PROGRESS') return false;
  if (!goal.lastValidatedAt) return true;
  if (goal.resumedAt && goal.resumedAt > goal.lastValidatedAt) return true;
  const until = goalValidUntil(goal, cfg);
  return until !== null && now >= until;
}
