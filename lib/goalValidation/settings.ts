import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { DISABLED_CONFIG, needsValidation, type ValidationConfig } from './status';

type Db = Prisma.TransactionClient | typeof prisma;

export const DEFAULT_REMINDER_TIMES = [1260]; // 21:00

// A missing row is treated as "feature off"
export async function getValidationConfig(db: Db, userId: string): Promise<ValidationConfig> {
  const row = await db.validationSettings.findUnique({
    where: { userId },
    select: { enabled: true, timezone: true, dayStartMin: true },
  });
  return row ?? DISABLED_CONFIG;
}

export interface DueGoal {
  id: string;
  name: string;
  rootId: string;
  rootName: string;
  depth: number;
}

// In-progress goals that need validation right now, with their top-level ancestor
export async function findDueGoals(db: Db, userId: string, cfg: ValidationConfig, now: Date): Promise<DueGoal[]> {
  if (!cfg.enabled) return [];
  const rows = await db.goal.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      parentId: true,
      status: true,
      validationPeriodDays: true,
      lastValidatedAt: true,
      resumedAt: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const due: DueGoal[] = [];
  for (const g of rows) {
    if (!needsValidation(g, cfg, now)) continue;
    let root = g;
    let depth = 0;
    while (root.parentId && byId.has(root.parentId) && depth < 1000) {
      root = byId.get(root.parentId)!;
      depth++;
    }
    due.push({ id: g.id, name: g.name, rootId: root.id, rootName: root.name, depth });
  }
  return due;
}
