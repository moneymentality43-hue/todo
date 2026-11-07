import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { flushPending } from '../../../../lib/notifications/service';
import { producers } from '../../../../lib/notifications/producers';

// Constant-time comparison of the bearer token against CRON_SECRET
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = createHash('sha256').update(token).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const produced: Record<string, number | string> = {};
  for (const producer of producers) {
    try {
      produced[producer.name] = (await producer.run(now)).created;
    } catch (e) {
      console.error(`[notifications] producer ${producer.name} failed`, e);
      produced[producer.name] = 'error';
    }
  }

  const flushed = await flushPending();
  return NextResponse.json({ ok: true, produced, flushed: flushed.processed });
}

// GET for Vercel Cron / simple pingers, POST for everything else
export const GET = handle;
export const POST = handle;
