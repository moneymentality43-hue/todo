// One-off: pausing now needs a reason and a resume date, so goals paused before that feature go back to in-progress.
// Run once after `npx prisma db push`:  node scripts/migrate-paused-goals.mjs
// Safe to re-run: goals paused with the new flow always have a resume date and are left alone.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const result = await prisma.goal.updateMany({
    where: { status: 'PAUSED', pausedUntil: null },
    data: { status: 'IN_PROGRESS' },
  });
  console.log(`Moved ${result.count} paused goal(s) back to IN_PROGRESS.`);
} finally {
  await prisma.$disconnect();
}
