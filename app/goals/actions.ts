"use server";

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getSession } from '../../lib/auth';
import {
  GOAL_STATUSES,
  METRIC_TYPES,
  LIMITS,
  type ActionResult,
  type AdjustTaskInput,
  type AttachTaskResult,
  type CreateGoalTaskInput,
  type DeleteGoalResult,
  type GoalDetail,
  type GoalPlanDTO,
  type GoalStatus,
  type GoalSummary,
  type GoalTaskDTO,
  type GoalTree,
  type GraphGoalNode,
  type GraphTaskNode,
  type MetricType,
  type TaskLogDTO,
  type UpdateGoalTaskInput,
} from '../../types/goals';

// ==========================================
// HELPERS
// ==========================================

async function requireAuth() {
  const session = await getSession();
  if (!session || !session.userId) {
    throw new Error('Unauthorized');
  }
  return session.userId as string;
}

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string) => ({ ok: false as const, error });

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function isGoalStatus(v: unknown): v is GoalStatus {
  return typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v);
}

function isMetricType(v: unknown): v is MetricType {
  return typeof v === 'string' && (METRIC_TYPES as readonly string[]).includes(v);
}

// parentName is resolved by the caller (usually from data it already has) to avoid an extra relation query
const summarySelect = {
  id: true,
  name: true,
  status: true,
  parentId: true,
  _count: { select: { children: true, tasks: true } },
} satisfies Prisma.GoalSelect;

type SummaryRow = Prisma.GoalGetPayload<{ select: typeof summarySelect }>;

function toSummary(r: SummaryRow, parentName: string | null = null): GoalSummary {
  return {
    id: r.id,
    name: r.name,
    status: r.status as GoalStatus,
    parentId: r.parentId,
    parentName,
    subGoalCount: r._count.children,
    taskCount: r._count.tasks,
  };
}

function toSummaries(rows: SummaryRow[]): GoalSummary[] {
  const names = new Map(rows.map(r => [r.id, r.name]));
  return rows.map(r => toSummary(r, r.parentId ? names.get(r.parentId) ?? null : null));
}

type TaskRow = Prisma.GoalTaskGetPayload<{ include: { goal: { select: { name: true } } } }>;
const taskInclude = { goal: { select: { name: true } } } satisfies Prisma.GoalTaskInclude;

function toTaskDTO(t: TaskRow): GoalTaskDTO {
  return {
    id: t.id,
    title: t.title,
    metricType: t.metricType as MetricType,
    unit: t.unit,
    target: t.target,
    current: t.current,
    goalId: t.goalId,
    goalName: t.goal?.name ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toPlanDTO(p: Prisma.GoalPlanGetPayload<object>): GoalPlanDTO {
  return {
    id: p.id,
    goalId: p.goalId,
    title: p.title,
    body: p.body,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toLogDTO(l: Prisma.GoalTaskLogGetPayload<object>): TaskLogDTO {
  return {
    id: l.id,
    goalTaskId: l.goalTaskId,
    delta: l.delta,
    valueAfter: l.valueAfter,
    createdAt: l.createdAt.toISOString(),
  };
}

type Db = Prisma.TransactionClient | typeof prisma;

type RawTaskRow = Prisma.GoalTaskGetPayload<object> & { goalName: string | null };

const rawToDTO = (row: RawTaskRow): GoalTaskDTO => toTaskDTO({ ...row, goal: row.goalName ? { name: row.goalName } : null });

// SELECT ... FOR UPDATE serialises concurrent changes to one task; the join returns the goal name in the same trip
const lockTask = async (tx: Prisma.TransactionClient, id: string, userId: string): Promise<RawTaskRow | null> => {
  const rows = await tx.$queryRaw<RawTaskRow[]>`
    SELECT t.*, g."name" AS "goalName"
    FROM "GoalTask" t LEFT JOIN "Goal" g ON g."id" = t."goalId"
    WHERE t."id" = ${id} AND t."userId" = ${userId}
    FOR UPDATE OF t`;
  return rows[0] ?? null;
};

// Generous limits: the database sits behind a remote pooler, and row-locked transactions queue
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

async function getSummaryById(db: Db, userId: string, id: string): Promise<GoalSummary | null> {
  const row = await db.goal.findFirst({ where: { id, userId }, select: summarySelect });
  if (!row) return null;
  const parent = row.parentId
    ? await db.goal.findFirst({ where: { id: row.parentId, userId }, select: { name: true } })
    : null;
  return toSummary(row, parent?.name ?? null);
}

async function loadParentMap(db: Db, userId: string) {
  const rows = await db.goal.findMany({ where: { userId }, select: { id: true, name: true, parentId: true } });
  return new Map(rows.map(r => [r.id, r]));
}

// Walks up from `startId`; stops after a bounded number of hops so bad data can never loop forever
function collectAncestors(map: Map<string, { id: string; name: string; parentId: string | null }>, startId: string | null) {
  const chain: { id: string; name: string }[] = [];
  let cursor = startId ? map.get(startId) : undefined;
  let hops = 0;
  while (cursor && hops < 1000) {
    chain.unshift({ id: cursor.id, name: cursor.name });
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    hops++;
  }
  return chain;
}

// ---- metric rules ----

type TaskShape = { ok: true; target: number; unit: string | null } | { ok: false; error: string };

function validateTaskShape(metricType: MetricType, target: unknown, unit: unknown): TaskShape {
  switch (metricType) {
    case 'YESNO':
      return { ok: true, target: 1, unit: null };
    case 'PERCENT':
      return { ok: true, target: 100, unit: null };
    case 'COUNT': {
      if (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > LIMITS.maxValue) {
        return { ok: false, error: 'Target must be a whole number of at least 1.' };
      }
      return { ok: true, target, unit: null };
    }
    case 'DURATION': {
      if (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > LIMITS.maxValue) {
        return { ok: false, error: 'Target duration must be at least 1 minute.' };
      }
      return { ok: true, target, unit: null };
    }
    case 'CUSTOM': {
      if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || target > LIMITS.maxValue) {
        return { ok: false, error: 'Target must be greater than 0.' };
      }
      const cleanUnit = cleanText(unit, LIMITS.unit);
      if (!cleanUnit) return { ok: false, error: `Unit is required (max ${LIMITS.unit} characters).` };
      return { ok: true, target: round2(target), unit: cleanUnit };
    }
  }
}

// Never below 0. Percent caps at 100 and Yes/No is 0 or 1. Count/Custom may exceed target ("over target").
function clampValue(metricType: MetricType, value: number): number {
  const v = Math.max(0, value);
  switch (metricType) {
    case 'YESNO': return v >= 0.5 ? 1 : 0;
    case 'PERCENT': return round2(Math.min(100, v));
    case 'COUNT':
    case 'DURATION': return Math.round(v);
    case 'CUSTOM': return round2(v);
  }
}

// ==========================================
// GOALS
// ==========================================

const loadGoalSummaries = async (userId: string) =>
  toSummaries(await prisma.goal.findMany({ where: { userId }, select: summarySelect, orderBy: { createdAt: 'desc' } }));

async function loadTaskDTOs(userId: string): Promise<GoalTaskDTO[]> {
  // Goal names come from a parallel query instead of a relation include (one round trip instead of two)
  const [rows, goalRows] = await Promise.all([
    prisma.goalTask.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.goal.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(goalRows.map(g => [g.id, g.name]));
  return rows.map(t => toTaskDTO({ ...t, goal: t.goalId ? { name: names.get(t.goalId) ?? '' } : null }));
}

export async function listGoals(): Promise<GoalSummary[]> {
  const userId = await requireAuth();
  return loadGoalSummaries(userId);
}

// One call (one round trip) for everything the Goals page needs on load and after changes
export async function getGoalsOverview(): Promise<{ goals: GoalSummary[]; tasks: GoalTaskDTO[] }> {
  const userId = await requireAuth();
  const [goals, tasks] = await Promise.all([loadGoalSummaries(userId), loadTaskDTOs(userId)]);
  return { goals, tasks };
}

export async function getGoal(id: string): Promise<GoalDetail | null> {
  const userId = await requireAuth();

  // Independent queries run in parallel: against a remote database latency, not work, is the cost
  const [goal, plans, children, tasks, map] = await Promise.all([
    prisma.goal.findFirst({ where: { id, userId }, select: { id: true, name: true, status: true, parentId: true } }),
    prisma.goalPlan.findMany({ where: { goalId: id, goal: { userId } }, orderBy: { updatedAt: 'desc' } }),
    prisma.goal.findMany({ where: { parentId: id, userId }, orderBy: { createdAt: 'asc' }, select: summarySelect }),
    prisma.goalTask.findMany({ where: { goalId: id, userId }, orderBy: { createdAt: 'asc' } }),
    loadParentMap(prisma, userId),
  ]);
  if (!goal) return null;

  return {
    id: goal.id,
    name: goal.name,
    status: goal.status as GoalStatus,
    parentId: goal.parentId,
    ancestors: collectAncestors(map, goal.parentId),
    plans: plans.map(toPlanDTO),
    children: children.map(c => toSummary(c, goal.name)),
    tasks: tasks.map(t => toTaskDTO({ ...t, goal: { name: goal.name } })),
  };
}

export async function createGoal(input: { name: string; parentId?: string | null }): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  const name = cleanText(input?.name, LIMITS.goalName);
  if (!name) return fail(`Goal name is required (max ${LIMITS.goalName} characters).`);

  let parentName: string | null = null;
  if (input.parentId) {
    const parent = await prisma.goal.findFirst({ where: { id: input.parentId, userId }, select: { name: true } });
    if (!parent) return fail('Parent goal not found.');
    parentName = parent.name;
  }

  const created = await prisma.goal.create({
    data: { userId, name, parentId: input.parentId || null },
    select: summarySelect,
  });
  return ok(toSummary(created, parentName));
}

export async function renameGoal(id: string, name: string): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  const clean = cleanText(name, LIMITS.goalName);
  if (!clean) return fail(`Goal name is required (max ${LIMITS.goalName} characters).`);

  const result = await prisma.goal.updateMany({ where: { id, userId }, data: { name: clean } });
  if (result.count === 0) return fail('Goal not found.');

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok(summary) : fail('Goal not found.');
}

export async function setGoalStatus(id: string, status: GoalStatus): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  if (!isGoalStatus(status)) return fail('Invalid status.');

  const result = await prisma.goal.updateMany({ where: { id, userId }, data: { status } });
  if (result.count === 0) return fail('Goal not found.');

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok(summary) : fail('Goal not found.');
}

export async function attachSubGoal(parentId: string, childId: string): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  if (parentId === childId) return fail('A goal cannot be its own sub-goal.');

  return prisma.$transaction(async (tx) => {
    const map = await loadParentMap(tx, userId);
    const parent = map.get(parentId);
    const child = map.get(childId);
    if (!parent || !child) return fail('Goal not found.');

    if (child.parentId) return fail('This goal already has a parent. Detach it first.');

    // Attaching under one of its own descendants would create a cycle
    const parentChain = collectAncestors(map, parentId);
    if (parentChain.some(a => a.id === childId)) {
      return fail('Cannot attach a goal under one of its own sub-goals.');
    }

    await tx.goal.update({ where: { id: childId }, data: { parentId } });
    const summary = await getSummaryById(tx, userId, childId);
    return summary ? ok(summary) : fail('Goal not found.');
  }, TX_OPTIONS);
}

export async function detachSubGoal(childId: string): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  const result = await prisma.goal.updateMany({ where: { id: childId, userId }, data: { parentId: null } });
  if (result.count === 0) return fail('Goal not found.');

  const summary = await getSummaryById(prisma, userId, childId);
  return summary ? ok(summary) : fail('Goal not found.');
}

// Sub-goals become parentless and tasks become unattached via the FK rules (onDelete: SetNull); plans cascade
export async function deleteGoal(id: string): Promise<ActionResult<DeleteGoalResult>> {
  const userId = await requireAuth();

  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({
      where: { id, userId },
      select: { _count: { select: { children: true, tasks: true, plans: true } } },
    });
    if (!goal) return fail('Goal not found.');

    await tx.goal.delete({ where: { id } });

    return ok({
      orphanedSubGoals: goal._count.children,
      unattachedTasks: goal._count.tasks,
      deletedPlans: goal._count.plans,
    });
  }, TX_OPTIONS);
}

// ==========================================
// PLANS
// ==========================================

export async function createPlan(goalId: string, title?: string): Promise<ActionResult<GoalPlanDTO>> {
  const userId = await requireAuth();

  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return fail('Goal not found.');

  const cleanTitle = title === undefined ? 'Untitled plan' : cleanText(title, LIMITS.planTitle);
  if (!cleanTitle) return fail(`Plan title is required (max ${LIMITS.planTitle} characters).`);

  const plan = await prisma.goalPlan.create({ data: { goalId, title: cleanTitle } });
  return ok(toPlanDTO(plan));
}

// Called by autosave, so a partial update (only title or only body) is supported
export async function updatePlan(id: string, input: { title?: string; body?: string }): Promise<ActionResult<GoalPlanDTO>> {
  const userId = await requireAuth();

  const data: { title?: string; body?: string } = {};
  if (input.title !== undefined) {
    const t = cleanText(input.title, LIMITS.planTitle);
    if (!t) return fail(`Plan title is required (max ${LIMITS.planTitle} characters).`);
    data.title = t;
  }
  if (input.body !== undefined) {
    if (typeof input.body !== 'string' || input.body.length > LIMITS.planBody) {
      return fail(`Plan is too long (max ${LIMITS.planBody} characters).`);
    }
    data.body = input.body;
  }

  const result = await prisma.goalPlan.updateMany({ where: { id, goal: { userId } }, data });
  if (result.count === 0) return fail('Plan not found.');

  const plan = await prisma.goalPlan.findFirst({ where: { id, goal: { userId } } });
  return plan ? ok(toPlanDTO(plan)) : fail('Plan not found.');
}

export async function deletePlan(id: string): Promise<ActionResult<null>> {
  const userId = await requireAuth();

  const result = await prisma.goalPlan.deleteMany({ where: { id, goal: { userId } } });
  return result.count === 0 ? fail('Plan not found.') : ok(null);
}

// ==========================================
// TASKS
// ==========================================

export async function listGoalTasks(): Promise<GoalTaskDTO[]> {
  const userId = await requireAuth();
  return loadTaskDTOs(userId);
}

export async function createGoalTask(input: CreateGoalTaskInput): Promise<ActionResult<GoalTaskDTO>> {
  const userId = await requireAuth();

  const title = cleanText(input?.title, LIMITS.taskTitle);
  if (!title) return fail(`Task title is required (max ${LIMITS.taskTitle} characters).`);

  if (!isMetricType(input.metricType)) return fail('Invalid metric type.');

  const shape = validateTaskShape(input.metricType, input.target, input.unit);
  if (shape.ok === false) return fail(shape.error);

  const startRaw = input.start ?? 0;
  if (typeof startRaw !== 'number' || !Number.isFinite(startRaw) || startRaw < 0 || startRaw > LIMITS.maxValue) {
    return fail('Starting value must be 0 or more.');
  }
  const start = clampValue(input.metricType, startRaw);

  if (input.goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: input.goalId, userId }, select: { id: true } });
    if (!goal) return fail('Goal not found.');
  }

  const created = await prisma.goalTask.create({
    data: {
      userId,
      goalId: input.goalId || null,
      title,
      metricType: input.metricType,
      unit: shape.unit,
      target: shape.target,
      current: start,
    },
    include: taskInclude,
  });
  return ok(toTaskDTO(created));
}

// The metric type is fixed at creation so history stays meaningful
export async function updateGoalTask(id: string, input: UpdateGoalTaskInput): Promise<ActionResult<GoalTaskDTO>> {
  const userId = await requireAuth();

  const existing = await prisma.goalTask.findFirst({ where: { id, userId } });
  if (!existing) return fail('Task not found.');

  const data: { title?: string; target?: number; unit?: string | null } = {};

  if (input.title !== undefined) {
    const title = cleanText(input.title, LIMITS.taskTitle);
    if (!title) return fail(`Task title is required (max ${LIMITS.taskTitle} characters).`);
    data.title = title;
  }

  if (input.target !== undefined || input.unit !== undefined) {
    const metricType = existing.metricType as MetricType;
    const shape = validateTaskShape(
      metricType,
      input.target ?? existing.target,
      input.unit ?? existing.unit,
    );
    if (shape.ok === false) return fail(shape.error);
    data.target = shape.target;
    data.unit = shape.unit;
  }

  const updated = await prisma.goalTask.update({ where: { id }, data, include: taskInclude });
  return ok(toTaskDTO(updated));
}

export async function adjustTaskValue(
  id: string,
  input: AdjustTaskInput,
): Promise<ActionResult<{ task: GoalTaskDTO; log: TaskLogDTO | null }>> {
  const userId = await requireAuth();

  const amount = 'set' in input ? input.set : input.delta;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) > LIMITS.maxValue) {
    return fail('Invalid value.');
  }

  // Lock the row for the duration of the transaction so rapid taps queue up instead of racing.
  // The lock query also returns the full row and goal name, which saves round trips.
  return prisma.$transaction(async (tx) => {
    const row = await lockTask(tx, id, userId);
    if (!row) return fail('Task not found.');

    const next = clampValue(row.metricType as MetricType, 'set' in input ? input.set : row.current + input.delta);
    if (next === row.current) return ok({ task: rawToDTO(row), log: null });

    const log = await tx.goalTaskLog.create({
      data: { goalTaskId: id, delta: round2(next - row.current), valueAfter: next },
    });
    const updated = await tx.goalTask.update({ where: { id }, data: { current: next } });

    return ok({ task: rawToDTO({ ...row, ...updated }), log: toLogDTO(log) });
  }, TX_OPTIONS);
}

export async function undoLastChange(id: string): Promise<ActionResult<{ task: GoalTaskDTO; undoneDelta: number }>> {
  const userId = await requireAuth();

  return prisma.$transaction(async (tx) => {
    const row = await lockTask(tx, id, userId);
    if (!row) return fail('Task not found.');

    const log = await tx.goalTaskLog.findFirst({
      where: { goalTaskId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!log) return fail('Nothing to undo.');

    const next = clampValue(row.metricType as MetricType, row.current - log.delta);
    const updated = await tx.goalTask.update({ where: { id }, data: { current: next } });
    await tx.goalTaskLog.delete({ where: { id: log.id } });

    return ok({ task: rawToDTO({ ...row, ...updated }), undoneDelta: log.delta });
  }, TX_OPTIONS);
}

// A task belongs to at most one goal. Moving it from another goal needs `move: true` (the UI confirms first).
export async function attachTask(goalId: string, taskId: string, options?: { move?: boolean }): Promise<AttachTaskResult> {
  const userId = await requireAuth();

  const [goal, task] = await Promise.all([
    prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } }),
    prisma.goalTask.findFirst({ where: { id: taskId, userId }, include: taskInclude }),
  ]);
  if (!goal) return fail('Goal not found.');
  if (!task) return fail('Task not found.');

  if (task.goalId === goalId) return { ok: true, data: toTaskDTO(task) };

  if (task.goalId && !options?.move) {
    return {
      ok: false,
      error: `This task is already attached to "${task.goal?.name ?? 'another goal'}".`,
      needsConfirm: { currentGoalId: task.goalId, currentGoalName: task.goal?.name ?? 'another goal' },
    };
  }

  const updated = await prisma.goalTask.update({ where: { id: taskId }, data: { goalId }, include: taskInclude });
  return { ok: true, data: toTaskDTO(updated) };
}

export async function detachTask(taskId: string): Promise<ActionResult<GoalTaskDTO>> {
  const userId = await requireAuth();

  const result = await prisma.goalTask.updateMany({ where: { id: taskId, userId }, data: { goalId: null } });
  if (result.count === 0) return fail('Task not found.');

  const task = await prisma.goalTask.findFirst({ where: { id: taskId, userId }, include: taskInclude });
  return task ? ok(toTaskDTO(task)) : fail('Task not found.');
}

export async function deleteTask(taskId: string): Promise<ActionResult<null>> {
  const userId = await requireAuth();

  const result = await prisma.goalTask.deleteMany({ where: { id: taskId, userId } });
  return result.count === 0 ? fail('Task not found.') : ok(null);
}

// Raw log rows; sparkline and streak are computed on the client in the user's local time
export async function getTaskLogs(taskIds: string[], sinceISO: string): Promise<TaskLogDTO[]> {
  const userId = await requireAuth();

  if (!Array.isArray(taskIds) || taskIds.length === 0) return [];
  const ids = taskIds.filter(i => typeof i === 'string').slice(0, 200);

  const since = new Date(sinceISO);
  if (Number.isNaN(since.getTime())) return [];

  const rows = await prisma.goalTaskLog.findMany({
    where: { goalTaskId: { in: ids }, goalTask: { userId }, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });
  return rows.map(toLogDTO);
}

// ==========================================
// GRAPH
// ==========================================

export async function getGoalTree(rootId: string, depth: 1 | 2, includeTasks: boolean): Promise<GoalTree | null> {
  const userId = await requireAuth();

  const maxLevel = depth === 2 ? 2 : 1;

  const goals = await prisma.goal.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      status: true,
      parentId: true,
      _count: { select: { children: true, tasks: true } },
    },
  });

  const byId = new Map(goals.map(g => [g.id, g]));
  const childrenOf = new Map<string, typeof goals>();
  for (const g of goals) {
    if (!g.parentId) continue;
    const list = childrenOf.get(g.parentId) ?? [];
    list.push(g);
    childrenOf.set(g.parentId, list);
  }

  const root = byId.get(rootId);
  if (!root) return null;

  const nodes: (GraphGoalNode | GraphTaskNode)[] = [];
  const edges: GoalTree['edges'] = [];
  const goalLevels = new Map<string, number>();

  const queue: { id: string; level: number }[] = [{ id: root.id, level: 0 }];
  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    const g = byId.get(id);
    if (!g || goalLevels.has(id)) continue;
    goalLevels.set(id, level);

    nodes.push({
      kind: 'goal',
      id: g.id,
      name: g.name,
      status: g.status as GoalStatus,
      level,
      subGoalCount: g._count.children,
      taskCount: g._count.tasks,
    });

    if (level < maxLevel) {
      for (const child of childrenOf.get(id) ?? []) {
        edges.push({ id: `e-${id}-${child.id}`, source: id, target: child.id });
        queue.push({ id: child.id, level: level + 1 });
      }
    }
  }

  if (includeTasks) {
    const tasks = await prisma.goalTask.findMany({
      where: { userId, goalId: { in: [...goalLevels.keys()] } },
      orderBy: { createdAt: 'asc' },
    });
    for (const t of tasks) {
      if (!t.goalId) continue;
      nodes.push({
        kind: 'task',
        id: t.id,
        title: t.title,
        metricType: t.metricType as MetricType,
        unit: t.unit,
        current: t.current,
        target: t.target,
        goalId: t.goalId,
        level: (goalLevels.get(t.goalId) ?? 0) + 1,
      });
      edges.push({ id: `e-${t.goalId}-${t.id}`, source: t.goalId, target: t.id });
    }
  }

  return { rootId, nodes, edges };
}
