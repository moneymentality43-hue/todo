// Shared goal types and constants (kept out of "use server" files, which may only export async functions)

export const GOAL_STATUSES = ['IN_PROGRESS', 'PAUSED', 'COMPLETED'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const METRIC_TYPES = ['COUNT', 'PERCENT', 'DURATION', 'YESNO', 'CUSTOM'] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const WORK_TYPES = ['DEEP', 'SHALLOW'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const LIMITS = {
  goalName: 120,
  planTitle: 120,
  planBody: 6000, // roughly 1000 words
  taskTitle: 120,
  unit: 20,
  maxValue: 1_000_000_000,
  maxTimeMin: 6_000_000,
} as const;

// Business-rule failures are returned (not thrown) because Next hides thrown error messages in production
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type AttachTaskResult =
  | { ok: true; data: GoalTaskDTO }
  | { ok: false; error: string; needsConfirm?: { currentGoalId: string; currentGoalName: string } };

export interface WorkTime {
  deepMinutes: number;
  shallowMinutes: number;
}

// deepMinutes / shallowMinutes include every descendant sub-goal
export interface GoalSummary extends WorkTime {
  id: string;
  name: string;
  status: GoalStatus;
  parentId: string | null;
  parentName: string | null;
  subGoalCount: number;
  taskCount: number;
}

export interface GoalTaskDTO {
  id: string;
  title: string;
  metricType: MetricType;
  unit: string | null;
  target: number;
  current: number;
  workType: WorkType;
  timeSpentMin: number;
  goalId: string | null;
  goalName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalPlanDTO {
  id: string;
  goalId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalDetail extends WorkTime {
  id: string;
  name: string;
  status: GoalStatus;
  parentId: string | null;
  ancestors: { id: string; name: string }[]; // root first
  plans: GoalPlanDTO[];
  children: GoalSummary[];
  tasks: GoalTaskDTO[];
}

export interface TaskLogDTO {
  id: string;
  goalTaskId: string;
  delta: number;
  valueAfter: number;
  createdAt: string;
}

export interface DeleteGoalResult {
  orphanedSubGoals: number;
  unattachedTasks: number;
  deletedPlans: number;
}

export interface CreateGoalTaskInput {
  title: string;
  metricType: MetricType;
  target?: number;
  unit?: string;
  start?: number;
  goalId?: string | null;
  workType?: WorkType;
  timeSpentMin?: number;
}

export interface UpdateGoalTaskInput {
  title?: string;
  target?: number;
  unit?: string;
  workType?: WorkType;
}

export type AdjustTaskInput = { delta: number } | { set: number };
export type LogTimeInput = { deltaMin: number } | { setMin: number };

export interface GraphGoalNode extends WorkTime {
  kind: 'goal';
  id: string;
  name: string;
  status: GoalStatus;
  level: number;
  subGoalCount: number;
  taskCount: number;
}

export interface GraphTaskNode {
  kind: 'task';
  id: string;
  title: string;
  metricType: MetricType;
  unit: string | null;
  current: number;
  target: number;
  goalId: string;
  level: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface GoalTree {
  rootId: string;
  nodes: (GraphGoalNode | GraphTaskNode)[];
  edges: GraphEdge[];
}
