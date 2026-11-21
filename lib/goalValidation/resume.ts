import { prisma } from '../prisma';
import { notify } from '../notifications/service';
import { resumeTree } from './pause';
import { getValidationConfig } from './settings';

// Generous limits: the database sits behind a remote pooler
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

interface ResumedGoal {
  userId: string;
  goalId: string;
  name: string;
  reason: string;
  pausedUntil: Date;
  cascaded: number;
}

async function notifyResumed(g: ResumedGoal) {
  const cfg = await getValidationConfig(prisma, g.userId);
  const reason = g.reason.length > 140 ? `${g.reason.slice(0, 140)}…` : g.reason;
  const more = g.cascaded > 0 ? ` (+${g.cascaded} sub-goal${g.cascaded === 1 ? '' : 's'})` : '';
  await notify({
    userId: g.userId,
    type: 'GOAL_RESUMED',
    dedupeKey: `goal-resume:${g.goalId}:${g.pausedUntil.getTime()}`,
    title: `Goal resumed: ${g.name}`,
    body: `Paused for: ${reason}${more}. ${cfg.enabled ? 'It needs validation now.' : 'It is back in progress.'}`,
    url: `/goals?goal=${g.goalId}`,
  });
}

// Resumes every pause root whose resume time has passed. Called by the cron producer and lazily
// (for one user) when goals are loaded, so the UI is right even if the cron lags.
export async function resumeDueGoals(now: Date, userId?: string): Promise<number> {
  const roots = await prisma.goal.findMany({
    where: { status: 'PAUSED', pausedByGoalId: null, pausedUntil: { lte: now }, ...(userId ? { userId } : {}) },
    select: { id: true, userId: true, name: true, pausedUntil: true, pauseReason: true },
    take: 500,
  });

  const resumed: ResumedGoal[] = [];
  for (const r of roots) {
    const result = await prisma.$transaction((tx) => resumeTree(tx, r.userId, r.id, 'AUTO', now), TX_OPTIONS);
    if (result?.resumed && r.pausedUntil) {
      resumed.push({
        userId: r.userId,
        goalId: r.id,
        name: r.name,
        reason: r.pauseReason ?? '',
        pausedUntil: r.pausedUntil,
        cascaded: result.cascaded,
      });
    }
  }

  for (const g of resumed) {
    try {
      await notifyResumed(g);
    } catch (e) {
      console.error('[goalValidation] resume notification failed', e);
    }
  }
  return resumed.length;
}
