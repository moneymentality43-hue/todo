import type { TaskLogDTO } from '../../types/goals';

// All day math uses the browser's local time so "today" matches what the user sees

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function dayTotals(logs: TaskLogDTO[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const log of logs) {
    const key = dayKey(new Date(log.createdAt));
    totals.set(key, (totals.get(key) ?? 0) + log.delta);
  }
  return totals;
}

export function todayTotal(logs: TaskLogDTO[], now: Date = new Date()): number {
  return Math.round((dayTotals(logs).get(dayKey(now)) ?? 0) * 100) / 100;
}

// Consecutive local days with net-positive progress. A day that has not been logged yet today does not break the streak.
export function currentStreak(logs: TaskLogDTO[], now: Date = new Date()): number {
  const totals = dayTotals(logs);
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if ((totals.get(dayKey(cursor)) ?? 0) <= 0) cursor = addDays(cursor, -1);

  let streak = 0;
  while ((totals.get(dayKey(cursor)) ?? 0) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function dailySeries(logs: TaskLogDTO[], days = 14, now: Date = new Date()): { key: string; value: number }[] {
  const totals = dayTotals(logs);
  const series: { key: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(addDays(now, -i));
    series.push({ key, value: Math.max(0, totals.get(key) ?? 0) });
  }
  return series;
}
