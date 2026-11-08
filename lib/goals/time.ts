import type { WorkTime } from '../../types/goals';

export const EMPTY_TIME: WorkTime = { deepMinutes: 0, shallowMinutes: 0 };

// "10.5h", "4h", "0h". Decimal hours, at most 2 decimals.
export function formatHours(minutes: number): string {
  const h = Math.round((Math.max(0, minutes) / 60) * 100) / 100;
  return `${h}h`;
}

interface GoalNodeLite {
  id: string;
  parentId: string | null;
}

// Each goal's total is its own tasks plus all descendants. Goals with nothing logged simply contribute 0.
// `own` maps goalId -> time logged directly on that goal's tasks.
export function rollupTime(goals: GoalNodeLite[], own: Map<string, WorkTime>): Map<string, WorkTime> {
  const byId = new Map(goals.map(g => [g.id, g]));
  const totals = new Map<string, WorkTime>();
  for (const g of goals) totals.set(g.id, { ...(own.get(g.id) ?? EMPTY_TIME) });

  // Push each goal's own time up its ancestor chain; the hop cap guards against bad data forming a cycle
  for (const g of goals) {
    const mine = own.get(g.id);
    if (!mine || (mine.deepMinutes === 0 && mine.shallowMinutes === 0)) continue;
    const seen = new Set<string>([g.id]);
    let cursor = g.parentId ? byId.get(g.parentId) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      const t = totals.get(cursor.id)!;
      t.deepMinutes += mine.deepMinutes;
      t.shallowMinutes += mine.shallowMinutes;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
  return totals;
}
