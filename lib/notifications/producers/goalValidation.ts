import { prisma } from '../../prisma';
import { notify } from '../service';
import type { NotificationProducer } from '../types';
import { resumeDueGoals } from '../../goalValidation/resume';
import { findDueGoals } from '../../goalValidation/settings';
import { buildDigest } from '../../goalValidation/digest';
import { localDateKey, localParts, zonedToUtc } from '../../time/zoned';

const SLOT_MS = 60 * 60_000;

// Resumes paused goals whose resume time has passed and announces them
export const goalResumeProducer: NotificationProducer = {
  name: 'goal-resume',

  async run(now) {
    return { created: await resumeDueGoals(now) };
  },
};

// A reminder slot is open for an hour after its time. The dedupe key allows one digest per slot,
// so the every-minute cron cannot send it twice.
export const validationDigestProducer: NotificationProducer = {
  name: 'validation-digest',

  async run(now) {
    const users = await prisma.validationSettings.findMany({
      where: { enabled: true },
      select: { userId: true, timezone: true, dayStartMin: true, reminderTimes: true },
      take: 2000,
    });

    let created = 0;
    for (const u of users) {
      const today = localParts(now, u.timezone);
      // Today's and yesterday's slots, so a late-evening slot still counts just after midnight
      const openSlots = u.reminderTimes.flatMap((t) =>
        [0, -1].map((dayOffset) => ({ t, start: zonedToUtc(today.year, today.month, today.day + dayOffset, t, u.timezone) }))
      ).filter(({ start }) => now >= start && now.getTime() < start.getTime() + SLOT_MS);
      if (openSlots.length === 0) continue;

      const due = await findDueGoals(prisma, u.userId, { enabled: true, timezone: u.timezone, dayStartMin: u.dayStartMin }, now);
      if (due.length === 0) continue;
      const digest = buildDigest(due);

      for (const slot of openSlots) {
        const result = await notify({
          userId: u.userId,
          type: 'VALIDATION_DIGEST',
          dedupeKey: `validation-digest:${u.userId}:${localDateKey(localParts(slot.start, u.timezone))}:${slot.t}`,
          title: `${digest.count} goal${digest.count === 1 ? '' : 's'} need validation`,
          body: digest.body,
          url: '/goals',
          expiresAt: new Date(slot.start.getTime() + SLOT_MS),
        });
        if (result.status !== 'DUPLICATE') created++;
      }
    }
    return { created };
  },
};
