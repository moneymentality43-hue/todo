import type { GoalSummary, GoalTaskDTO, WorkTime } from '../../types/goals';
import { EMPTY_TIME, rollupTime } from './time';

// Derives rolled-up deep/shallow minutes, counts, and live parent/goal names from base goals + tasks.
// Pure and fast (< 0.1ms), so localized task/goal patches update every view without re-querying Postgres.
export function deriveGoalsAndTasks(
  rawGoals: GoalSummary[],
  rawTasks: GoalTaskDTO[],
): { goals: GoalSummary[]; tasks: GoalTaskDTO[] } {
  const ownTime = new Map<string, WorkTime>();
  const taskCounts = new Map<string, number>();

  for (const t of rawTasks) {
    if (!t.goalId) continue;
    taskCounts.set(t.goalId, (taskCounts.get(t.goalId) ?? 0) + 1);

    if (t.timeSpentMin > 0) {
      const bucket = ownTime.get(t.goalId) ?? { deepMinutes: 0, shallowMinutes: 0 };
      if (t.workType === 'DEEP') bucket.deepMinutes += t.timeSpentMin;
      else bucket.shallowMinutes += t.timeSpentMin;
      ownTime.set(t.goalId, bucket);
    }
  }

  const timeTotals = rollupTime(rawGoals, ownTime);
  const goalNames = new Map<string, string>();
  const subGoalCounts = new Map<string, number>();

  for (const g of rawGoals) {
    goalNames.set(g.id, g.name);
    if (g.parentId) {
      subGoalCounts.set(g.parentId, (subGoalCounts.get(g.parentId) ?? 0) + 1);
    }
  }

  const goals: GoalSummary[] = rawGoals.map(g => {
    const time = timeTotals.get(g.id) ?? EMPTY_TIME;
    return {
      ...g,
      parentName: g.parentId ? (goalNames.get(g.parentId) ?? g.parentName) : null,
      subGoalCount: subGoalCounts.get(g.id) ?? 0,
      taskCount: taskCounts.get(g.id) ?? 0,
      deepMinutes: time.deepMinutes,
      shallowMinutes: time.shallowMinutes,
    };
  });

  const tasks: GoalTaskDTO[] = rawTasks.map(t => ({
    ...t,
    goalName: t.goalId ? (goalNames.get(t.goalId) ?? t.goalName) : null,
  }));

  return { goals, tasks };
}
