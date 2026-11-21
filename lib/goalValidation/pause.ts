// Transactional pause helpers shared by the goal actions and the resume cron.
//
// Pause root:     status PAUSED, pausedByGoalId null, with pausedAt / pausedUntil / pauseReason.
// Cascade-paused: status PAUSED, pausedByGoalId = the root's id, pausedUntil copied from the root (display only).
// Not paused:     all pause fields null.

import type { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

export interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  status: string;
  pausedByGoalId: string | null;
  pausedUntil: Date | null;
}

export async function loadTree(db: Db, userId: string): Promise<Map<string, TreeNode>> {
  const rows = await db.goal.findMany({
    where: { userId },
    select: { id: true, name: true, parentId: true, status: true, pausedByGoalId: true, pausedUntil: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

export function descendantsOf(map: Map<string, TreeNode>, goalId: string): TreeNode[] {
  const children = new Map<string, TreeNode[]>();
  for (const n of map.values()) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId);
    if (list) list.push(n);
    else children.set(n.parentId, [n]);
  }
  const out: TreeNode[] = [];
  const seen = new Set<string>([goalId]);
  const queue = [goalId];
  while (queue.length) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

// Pause root of the nearest paused goal at or above `startId` (null when nothing above is paused)
export function pauseRootFrom(map: Map<string, TreeNode>, startId: string | null): TreeNode | null {
  let cursor = startId ? map.get(startId) : undefined;
  let hops = 0;
  while (cursor && hops < 1000) {
    if (cursor.status === 'PAUSED') {
      return cursor.pausedByGoalId ? map.get(cursor.pausedByGoalId) ?? cursor : cursor;
    }
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    hops++;
  }
  return null;
}

const CLEARED_PAUSE = { pausedAt: null, pausedUntil: null, pauseReason: null, pausedByGoalId: null } as const;

export async function markCascadePaused(
  tx: Db,
  ids: string[],
  root: { id: string; pausedUntil: Date | null },
  now: Date
) {
  if (ids.length === 0) return;
  await tx.goal.updateMany({
    where: { id: { in: ids } },
    data: { status: 'PAUSED', pausedByGoalId: root.id, pausedAt: now, pausedUntil: root.pausedUntil, pauseReason: null },
  });
}

// Pauses `goal` as a root and cascades to its in-progress descendants. Returns how many were cascaded.
export async function pauseTree(
  tx: Db,
  userId: string,
  map: Map<string, TreeNode>,
  goalId: string,
  reason: string,
  resumeAt: Date,
  now: Date
): Promise<number> {
  const cascadeIds = descendantsOf(map, goalId)
    .filter((d) => d.status === 'IN_PROGRESS')
    .map((d) => d.id);

  await tx.goal.update({
    where: { id: goalId },
    data: { status: 'PAUSED', pausedByGoalId: null, pausedAt: now, pausedUntil: resumeAt, pauseReason: reason },
  });
  await markCascadePaused(tx, cascadeIds, { id: goalId, pausedUntil: resumeAt }, now);
  await tx.goalPause.create({
    data: { userId, goalId, reason, pausedAt: now, resumeAt, cascadedCount: cascadeIds.length },
  });
  return cascadeIds.length;
}

export type ResumeKind = 'AUTO' | 'MANUAL' | 'COMPLETED';

// Resumes a pause root together with the goals it cascaded. Returns null if it was not (or no longer) a pause root.
// If an ancestor is itself paused, the whole group is moved under that ancestor's pause instead of resuming.
export async function resumeTree(
  tx: Db,
  userId: string,
  rootId: string,
  kind: ResumeKind,
  now: Date
): Promise<{ resumed: boolean; cascaded: number } | null> {
  const map = await loadTree(tx, userId);
  const root = map.get(rootId);
  if (!root || root.status !== 'PAUSED' || root.pausedByGoalId) return null;

  const ancestorRoot = pauseRootFrom(map, root.parentId);
  const groupIds = [...map.values()].filter((n) => n.pausedByGoalId === rootId).map((n) => n.id);

  const data = ancestorRoot
    ? { pausedByGoalId: ancestorRoot.id, pausedUntil: ancestorRoot.pausedUntil, pauseReason: null }
    : { status: 'IN_PROGRESS', ...CLEARED_PAUSE, resumedAt: now };

  // The guarded update doubles as a claim, so concurrent resumes of the same goal cannot both win
  const claimed = await tx.goal.updateMany({
    where: { id: rootId, userId, status: 'PAUSED', pausedByGoalId: null },
    data,
  });
  if (claimed.count === 0) return null;

  if (groupIds.length) await tx.goal.updateMany({ where: { id: { in: groupIds } }, data });
  await tx.goalPause.updateMany({
    where: { goalId: rootId, resumedAt: null },
    data: { resumedAt: now, resumeKind: kind },
  });
  return { resumed: !ancestorRoot, cascaded: groupIds.length };
}

// A cascade-paused goal leaves its pause tree (detached or its parent deleted): it and the goals paused
// together with it go back to in-progress.
export async function releaseCascade(tx: Db, map: Map<string, TreeNode>, goalId: string, now: Date): Promise<number> {
  const node = map.get(goalId);
  if (!node || node.status !== 'PAUSED' || !node.pausedByGoalId) return 0;

  const ids = [
    node.id,
    ...descendantsOf(map, node.id)
      .filter((d) => d.status === 'PAUSED' && d.pausedByGoalId === node.pausedByGoalId)
      .map((d) => d.id),
  ];
  await tx.goal.updateMany({
    where: { id: { in: ids } },
    data: { status: 'IN_PROGRESS', ...CLEARED_PAUSE, resumedAt: now },
  });
  return ids.length;
}

// A pause root is being deleted: everything it cascaded goes back to in-progress
export async function releaseGroup(tx: Db, userId: string, rootId: string, now: Date) {
  await tx.goal.updateMany({
    where: { userId, pausedByGoalId: rootId },
    data: { status: 'IN_PROGRESS', ...CLEARED_PAUSE, resumedAt: now },
  });
}

export async function clearPauseFields(tx: Db, goalId: string) {
  await tx.goal.update({ where: { id: goalId }, data: CLEARED_PAUSE });
}
