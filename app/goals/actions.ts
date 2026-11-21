"use server";

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getSession } from '../../lib/auth';
import {
  GOAL_STATUSES,
  METRIC_TYPES,
  WORK_TYPES,
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
  type LogTimeInput,
  type MetricType,
  type TaskLogDTO,
  type UpdateGoalTaskInput,
  type WorkTime,
  type WorkType,
} from '../../types/goals';
import { EMPTY_TIME, rollupTime } from '../../lib/goals/time';
import {
  LONG_TEXT_MAX,
  MAX_PAUSE_DAYS,
  MIN_PAUSE_LEAD_MIN,
  PAUSE_MIN_WORDS,
  PERIOD_MAX,
  PERIOD_MIN,
  VALIDATION_MIN_WORDS,
  countWords,
  type GoalPauseDTO,
  type GoalValidationDTO,
} from '../../types/validation';
import { goalValidUntil, needsValidation, type ValidationConfig } from '../../lib/goalValidation/status';
import { getValidationConfig } from '../../lib/goalValidation/settings';
import { resumeDueGoals } from '../../lib/goalValidation/resume';
import {
  clearPauseFields,
  descendantsOf,
  loadTree,
  markCascadePaused,
  pauseRootFrom,
  pauseTree,
  releaseCascade,
  releaseGroup,
  resumeTree,
} from '../../lib/goalValidation/pause';

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

function isWorkType(v: unknown): v is WorkType {
  return typeof v === 'string' && (WORK_TYPES as readonly string[]).includes(v);
}

// parentName is resolved by the caller (usually from data it already has) to avoid an extra relation query
const summarySelect = {
  id: true,
  name: true,
  status: true,
  parentId: true,
  validationPeriodDays: true,
  lastValidatedAt: true,
  resumedAt: true,
  pausedUntil: true,
  pausedByGoalId: true,
  _count: { select: { children: true, tasks: true } },
} satisfies Prisma.GoalSelect;

type SummaryRow = Prisma.GoalGetPayload<{ select: typeof summarySelect }>;

// What is needed to decide a goal's validation state: the user's settings and "now"
interface ValCtx {
  cfg: ValidationConfig;
  now: Date;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function validationFields(r: SummaryRow, ctx: ValCtx) {
  const until = ctx.cfg.enabled && r.status === 'IN_PROGRESS' ? goalValidUntil(r, ctx.cfg) : null;
  return {
    validationPeriodDays: r.validationPeriodDays,
    lastValidatedAt: iso(r.lastValidatedAt),
    validUntil: iso(until),
    needsValidation: needsValidation(r, ctx.cfg, ctx.now),
  };
}

function toSummary(r: SummaryRow, ctx: ValCtx, parentName: string | null = null, time: WorkTime = EMPTY_TIME): GoalSummary {
  return {
    id: r.id,
    name: r.name,
    status: r.status as GoalStatus,
    parentId: r.parentId,
    parentName,
    subGoalCount: r._count.children,
    taskCount: r._count.tasks,
    deepMinutes: time.deepMinutes,
    shallowMinutes: time.shallowMinutes,
    ...validationFields(r, ctx),
    pausedUntil: iso(r.pausedUntil),
    pausedByGoalId: r.pausedByGoalId,
  };
}

function toSummaries(rows: SummaryRow[], totals: Map<string, WorkTime>, ctx: ValCtx): GoalSummary[] {
  const names = new Map(rows.map(r => [r.id, r.name]));
  return rows.map(r => toSummary(r, ctx, r.parentId ? names.get(r.parentId) ?? null : null, totals.get(r.id)));
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
    workType: t.workType === 'DEEP' ? 'DEEP' : 'SHALLOW',
    timeSpentMin: t.timeSpentMin,
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

// Deep/shallow minutes per goal including all descendants. One aggregate query plus the goal tree.
async function loadTimeTotals(db: Db, userId: string): Promise<Map<string, WorkTime>> {
  const [sums, goals] = await Promise.all([
    db.goalTask.groupBy({
      by: ['goalId', 'workType'],
      where: { userId, goalId: { not: null } },
      _sum: { timeSpentMin: true },
    }),
    db.goal.findMany({ where: { userId }, select: { id: true, parentId: true } }),
  ]);
  const own = new Map<string, WorkTime>();
  for (const s of sums) {
    if (!s.goalId) continue;
    const t = own.get(s.goalId) ?? { deepMinutes: 0, shallowMinutes: 0 };
    const minutes = s._sum.timeSpentMin ?? 0;
    if (s.workType === 'DEEP') t.deepMinutes += minutes;
    else t.shallowMinutes += minutes;
    own.set(s.goalId, t);
  }
  return rollupTime(goals, own);
}

async function getSummaryById(db: Db, userId: string, id: string): Promise<GoalSummary | null> {
  const [row, totals, cfg] = await Promise.all([
    db.goal.findFirst({ where: { id, userId }, select: summarySelect }),
    loadTimeTotals(db, userId),
    getValidationConfig(db, userId),
  ]);
  if (!row) return null;
  const parent = row.parentId
    ? await db.goal.findFirst({ where: { id: row.parentId, userId }, select: { name: true } })
    : null;
  return toSummary(row, { cfg, now: new Date() }, parent?.name ?? null, totals.get(id));
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

const loadGoalSummaries = async (userId: string) => {
  const [rows, totals, cfg] = await Promise.all([
    prisma.goal.findMany({ where: { userId }, select: summarySelect, orderBy: { createdAt: 'desc' } }),
    loadTimeTotals(prisma, userId),
    getValidationConfig(prisma, userId),
  ]);
  return toSummaries(rows, totals, { cfg, now: new Date() });
};

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
  await resumeDueGoals(new Date(), userId);
  return loadGoalSummaries(userId);
}

// One call (one round trip) for everything the Goals page needs on load and after changes
export async function getGoalsOverview(): Promise<{ goals: GoalSummary[]; tasks: GoalTaskDTO[] }> {
  const userId = await requireAuth();
  await resumeDueGoals(new Date(), userId);
  const [goals, tasks] = await Promise.all([loadGoalSummaries(userId), loadTaskDTOs(userId)]);
  return { goals, tasks };
}

export async function getGoal(id: string): Promise<GoalDetail | null> {
  const userId = await requireAuth();
  const now = new Date();
  await resumeDueGoals(now, userId);

  // Independent queries run in parallel: against a remote database latency, not work, is the cost
  const [goal, plans, children, tasks, map, totals, cfg, validations, pauses] = await Promise.all([
    prisma.goal.findFirst({
      where: { id, userId },
      select: { ...summarySelect, pauseReason: true },
    }),
    prisma.goalPlan.findMany({ where: { goalId: id, goal: { userId } }, orderBy: { updatedAt: 'desc' } }),
    prisma.goal.findMany({ where: { parentId: id, userId }, orderBy: { createdAt: 'asc' }, select: summarySelect }),
    prisma.goalTask.findMany({ where: { goalId: id, userId }, orderBy: { createdAt: 'asc' } }),
    loadParentMap(prisma, userId),
    loadTimeTotals(prisma, userId),
    getValidationConfig(prisma, userId),
    prisma.goalValidation.findMany({ where: { goalId: id, userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.goalPause.findMany({ where: { goalId: id, userId }, orderBy: { pausedAt: 'desc' }, take: 10 }),
  ]);
  if (!goal) return null;

  const ctx: ValCtx = { cfg, now };
  const time = totals.get(goal.id) ?? EMPTY_TIME;
  const own = toSummary(goal, ctx);
  return {
    id: goal.id,
    name: goal.name,
    status: goal.status as GoalStatus,
    parentId: goal.parentId,
    deepMinutes: time.deepMinutes,
    shallowMinutes: time.shallowMinutes,
    ancestors: collectAncestors(map, goal.parentId),
    plans: plans.map(toPlanDTO),
    children: children.map(c => toSummary(c, ctx, goal.name, totals.get(c.id))),
    tasks: tasks.map(t => toTaskDTO({ ...t, goal: { name: goal.name } })),
    validationEnabled: cfg.enabled,
    validationPeriodDays: own.validationPeriodDays,
    lastValidatedAt: own.lastValidatedAt,
    validUntil: own.validUntil,
    needsValidation: own.needsValidation,
    pausedUntil: own.pausedUntil,
    pauseReason: goal.pauseReason,
    pausedByGoalId: goal.pausedByGoalId,
    pausedByGoalName: goal.pausedByGoalId ? map.get(goal.pausedByGoalId)?.name ?? null : null,
    validations: validations.map(toValidationDTO),
    pauses: pauses.map(toPauseDTO),
  };
}

function toValidationDTO(v: Prisma.GoalValidationGetPayload<object>): GoalValidationDTO {
  return {
    id: v.id,
    direct: v.direct,
    viaGoalName: v.viaGoalName,
    text: v.text,
    wordCount: v.wordCount,
    createdAt: v.createdAt.toISOString(),
  };
}

function toPauseDTO(p: Prisma.GoalPauseGetPayload<object>): GoalPauseDTO {
  return {
    id: p.id,
    reason: p.reason,
    pausedAt: p.pausedAt.toISOString(),
    resumeAt: p.resumeAt.toISOString(),
    resumedAt: iso(p.resumedAt),
    resumeKind: p.resumeKind,
    cascadedCount: p.cascadedCount,
  };
}

export async function createGoal(input: { name: string; parentId?: string | null }): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  const name = cleanText(input?.name, LIMITS.goalName);
  if (!name) return fail(`Goal name is required (max ${LIMITS.goalName} characters).`);

  if (input.parentId) {
    const parent = await prisma.goal.findFirst({ where: { id: input.parentId, userId }, select: { id: true } });
    if (!parent) return fail('Parent goal not found.');
  }

  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.goal.create({ data: { userId, name, parentId: input.parentId || null }, select: { id: true } });
    // A goal created under a paused goal is paused together with it
    if (input.parentId) {
      const map = await loadTree(tx, userId);
      const root = pauseRootFrom(map, input.parentId);
      if (root) await markCascadePaused(tx, [created.id], root, new Date());
    }
    return created.id;
  }, TX_OPTIONS);

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok(summary) : fail('Goal not found.');
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

// Pausing is only possible through pauseGoal(), which needs a reason and a resume date
export async function setGoalStatus(id: string, status: GoalStatus): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  if (!isGoalStatus(status)) return fail('Invalid status.');
  if (status === 'PAUSED') return fail('Use Pause to pause a goal. It needs a reason and a resume date.');

  const error = await prisma.$transaction(async (tx) => {
    const map = await loadTree(tx, userId);
    const goal = map.get(id);
    if (!goal) return 'Goal not found.';
    if (goal.status === status) return null;
    const now = new Date();

    if (goal.status === 'PAUSED') {
      const isRoot = !goal.pausedByGoalId;
      if (status === 'IN_PROGRESS') {
        if (!isRoot) return `Paused together with "${map.get(goal.pausedByGoalId!)?.name ?? 'another goal'}". Resume that goal instead.`;
        await resumeTree(tx, userId, id, 'MANUAL', now);
        return null;
      }
      // COMPLETED: the goals paused with it go back to in-progress
      if (isRoot) await resumeTree(tx, userId, id, 'COMPLETED', now);
      await tx.goal.update({ where: { id }, data: { status: 'COMPLETED' } });
      await clearPauseFields(tx, id);
      return null;
    }

    if (goal.status === 'COMPLETED' && status === 'IN_PROGRESS') {
      // Reopened under a paused goal: it stays paused with that goal
      const root = pauseRootFrom(map, goal.parentId);
      if (root) {
        await markCascadePaused(tx, [id], root, now);
        return null;
      }
    }

    await tx.goal.update({ where: { id }, data: { status } });
    return null;
  }, TX_OPTIONS);
  if (error) return fail(error);

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok(summary) : fail('Goal not found.');
}

export async function attachSubGoal(parentId: string, childId: string): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  if (parentId === childId) return fail('A goal cannot be its own sub-goal.');

  return prisma.$transaction(async (tx) => {
    const map = await loadTree(tx, userId);
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

    // Joining a paused goal: the child and its in-progress descendants pause with it
    const root = pauseRootFrom(map, parentId);
    if (root) {
      const ids = [child, ...descendantsOf(map, childId)].filter(n => n.status === 'IN_PROGRESS').map(n => n.id);
      await markCascadePaused(tx, ids, root, new Date());
    }

    const summary = await getSummaryById(tx, userId, childId);
    return summary ? ok(summary) : fail('Goal not found.');
  }, TX_OPTIONS);
}

export async function detachSubGoal(childId: string): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  const found = await prisma.$transaction(async (tx) => {
    const exists = await tx.goal.updateMany({ where: { id: childId, userId }, data: { parentId: null } });
    if (exists.count === 0) return false;
    // Leaving the paused goal's tree: whatever was paused together with it resumes
    const map = await loadTree(tx, userId);
    await releaseCascade(tx, map, childId, new Date());
    return true;
  }, TX_OPTIONS);
  if (!found) return fail('Goal not found.');

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

    // Goals paused because of this goal resume; sub-goals paused under a higher goal leave that pause
    const now = new Date();
    const map = await loadTree(tx, userId);
    await releaseGroup(tx, userId, id, now);
    for (const child of map.values()) {
      if (child.parentId === id && child.pausedByGoalId && child.pausedByGoalId !== id) {
        await releaseCascade(tx, map, child.id, now);
      }
    }

    await tx.goal.delete({ where: { id } });

    return ok({
      orphanedSubGoals: goal._count.children,
      unattachedTasks: goal._count.tasks,
      deletedPlans: goal._count.plans,
    });
  }, TX_OPTIONS);
}

// ==========================================
// PAUSE
// ==========================================

type PauseInput = { reason: string; resumeAt: string };

function checkPauseInput(input: Partial<PauseInput>, reasonRequired: boolean): { error: string } | { reason: string | null; resumeAt: Date | null } {
  let reason: string | null = null;
  if (reasonRequired || input?.reason !== undefined) {
    if (typeof input?.reason !== 'string') return { error: 'A reason is required.' };
    reason = input.reason.trim();
    if (reason.length > LONG_TEXT_MAX) return { error: `The reason is too long (max ${LONG_TEXT_MAX} characters).` };
    if (countWords(reason) < PAUSE_MIN_WORDS) return { error: `Write at least ${PAUSE_MIN_WORDS} words explaining why you are pausing.` };
  }

  const resumeAt = typeof input?.resumeAt === 'string' ? new Date(input.resumeAt) : null;
  if (!resumeAt || Number.isNaN(resumeAt.getTime())) return { error: 'Choose a valid resume date and time.' };
  const now = Date.now();
  if (resumeAt.getTime() < now + MIN_PAUSE_LEAD_MIN * 60_000) return { error: `The resume time must be at least ${MIN_PAUSE_LEAD_MIN} minutes from now.` };
  if (resumeAt.getTime() > now + MAX_PAUSE_DAYS * 86_400_000) return { error: `A goal can be paused for at most ${MAX_PAUSE_DAYS} days.` };
  return { reason, resumeAt };
}

export async function pauseGoal(
  id: string,
  input: PauseInput
): Promise<ActionResult<{ summary: GoalSummary; cascadedCount: number }>> {
  const userId = await requireAuth();

  const checked = checkPauseInput(input, true);
  if ('error' in checked) return fail(checked.error);
  const { reason, resumeAt } = checked as { reason: string; resumeAt: Date };

  const outcome = await prisma.$transaction(async (tx) => {
    const map = await loadTree(tx, userId);
    const goal = map.get(id);
    if (!goal) return { error: 'Goal not found.' };
    if (goal.status !== 'IN_PROGRESS') return { error: 'Only in-progress goals can be paused.' };
    const above = pauseRootFrom(map, goal.parentId);
    if (above) return { error: `Its parent "${above.name}" is already paused. Resume that goal first.` };
    return { cascaded: await pauseTree(tx, userId, map, id, reason, resumeAt, new Date()) };
  }, TX_OPTIONS);
  if ('error' in outcome) return fail(outcome.error as string);

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok({ summary, cascadedCount: outcome.cascaded }) : fail('Goal not found.');
}

// Change the resume date (and optionally the reason) of a goal that is itself paused
export async function updatePause(id: string, input: { resumeAt: string; reason?: string }): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  const checked = checkPauseInput(input, false);
  if ('error' in checked) return fail(checked.error);
  const { reason, resumeAt } = checked as { reason: string | null; resumeAt: Date };

  const error = await prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id, userId }, select: { status: true, pausedByGoalId: true } });
    if (!goal) return 'Goal not found.';
    if (goal.status !== 'PAUSED' || goal.pausedByGoalId) return 'Only a goal that was paused directly can change its resume date.';

    await tx.goal.update({ where: { id }, data: { pausedUntil: resumeAt, ...(reason ? { pauseReason: reason } : {}) } });
    await tx.goal.updateMany({ where: { userId, pausedByGoalId: id }, data: { pausedUntil: resumeAt } });
    await tx.goalPause.updateMany({
      where: { goalId: id, resumedAt: null },
      data: { resumeAt, ...(reason ? { reason } : {}) },
    });
    return null;
  }, TX_OPTIONS);
  if (error) return fail(error);

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok(summary) : fail('Goal not found.');
}

// Early manual resume of a directly paused goal (and the goals paused with it)
export async function resumeGoal(id: string): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  const error = await prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id, userId }, select: { status: true, pausedByGoalId: true, parentId: true } });
    if (!goal) return 'Goal not found.';
    if (goal.status !== 'PAUSED') return null;
    if (goal.pausedByGoalId) return 'This goal is paused together with another goal. Resume that goal instead.';
    await resumeTree(tx, userId, id, 'MANUAL', new Date());
    return null;
  }, TX_OPTIONS);
  if (error) return fail(error);

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok(summary) : fail('Goal not found.');
}

// ==========================================
// VALIDATION
// ==========================================

export async function setValidationPeriod(id: string, days: number): Promise<ActionResult<GoalSummary>> {
  const userId = await requireAuth();

  if (!Number.isInteger(days) || days < PERIOD_MIN || days > PERIOD_MAX) {
    return fail(`The period must be a whole number of days between ${PERIOD_MIN} and ${PERIOD_MAX}.`);
  }
  const result = await prisma.goal.updateMany({ where: { id, userId }, data: { validationPeriodDays: days } });
  if (result.count === 0) return fail('Goal not found.');

  const summary = await getSummaryById(prisma, userId, id);
  return summary ? ok(summary) : fail('Goal not found.');
}

// Validates the goal and every ancestor; each gets its own history row
export async function validateGoal(id: string, text: string): Promise<ActionResult<{ validatedCount: number; validUntil: string | null }>> {
  const userId = await requireAuth();

  if (typeof text !== 'string') return fail('Write your validation first.');
  const body = text.trim();
  if (body.length > LONG_TEXT_MAX) return fail(`The text is too long (max ${LONG_TEXT_MAX} characters).`);
  const words = countWords(body);
  if (words < VALIDATION_MIN_WORDS) return fail(`Write at least ${VALIDATION_MIN_WORDS} words (you have ${words}).`);

  return prisma.$transaction(async (tx) => {
    const cfg = await getValidationConfig(tx, userId);
    if (!cfg.enabled) return fail('Validation is turned off.');

    const map = await loadParentMap(tx, userId);
    const goal = map.get(id);
    if (!goal) return fail('Goal not found.');
    const row = await tx.goal.findFirst({ where: { id, userId }, select: { status: true, validationPeriodDays: true } });
    if (!row || row.status !== 'IN_PROGRESS') return fail('Only in-progress goals can be validated.');

    const ancestors = collectAncestors(map, goal.parentId);
    const now = new Date();
    await tx.goalValidation.createMany({
      data: [
        { userId, goalId: id, direct: true, text: body, wordCount: words, createdAt: now },
        ...ancestors.map(a => ({
          userId,
          goalId: a.id,
          direct: false,
          viaGoalId: id,
          viaGoalName: goal.name,
          text: body,
          wordCount: words,
          createdAt: now,
        })),
      ],
    });
    await tx.goal.updateMany({ where: { userId, id: { in: [id, ...ancestors.map(a => a.id)] } }, data: { lastValidatedAt: now } });

    const until = goalValidUntil({ status: row.status, validationPeriodDays: row.validationPeriodDays, lastValidatedAt: now, resumedAt: null }, cfg);
    return ok({ validatedCount: 1 + ancestors.length, validUntil: iso(until) });
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

  const workType = input.workType ?? 'SHALLOW';
  if (!isWorkType(workType)) return fail('Invalid work type.');

  const timeRaw = input.timeSpentMin ?? 0;
  if (typeof timeRaw !== 'number' || !Number.isFinite(timeRaw) || timeRaw < 0 || timeRaw > LIMITS.maxTimeMin) {
    return fail('Time spent must be 0 or more.');
  }

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
      workType,
      timeSpentMin: Math.round(timeRaw),
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

  const data: { title?: string; target?: number; unit?: string | null; workType?: WorkType } = {};

  if (input.workType !== undefined) {
    if (!isWorkType(input.workType)) return fail('Invalid work type.');
    data.workType = input.workType;
  }

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

// Time spent is a plain counter; it never touches the progress value or its history
export async function logTaskTime(id: string, input: LogTimeInput): Promise<ActionResult<GoalTaskDTO>> {
  const userId = await requireAuth();

  const amount = 'setMin' in input ? input.setMin : input.deltaMin;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) > LIMITS.maxTimeMin) {
    return fail('Invalid time.');
  }

  return prisma.$transaction(async (tx) => {
    const row = await lockTask(tx, id, userId);
    if (!row) return fail('Task not found.');

    const raw = 'setMin' in input ? input.setMin : row.timeSpentMin + input.deltaMin;
    const next = Math.min(LIMITS.maxTimeMin, Math.max(0, Math.round(raw)));
    if (next === row.timeSpentMin) return ok(rawToDTO(row));

    const updated = await tx.goalTask.update({ where: { id }, data: { timeSpentMin: next } });
    return ok(rawToDTO({ ...row, ...updated }));
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
  const totals = await loadTimeTotals(prisma, userId);

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
      deepMinutes: totals.get(g.id)?.deepMinutes ?? 0,
      shallowMinutes: totals.get(g.id)?.shallowMinutes ?? 0,
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
