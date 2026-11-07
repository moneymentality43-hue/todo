import * as webpush from 'web-push';
import { prisma } from '../../prisma';
import type { ChannelOutcome, NotificationChannel, NotificationMessage } from '../types';

let configured = false;

function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID keys are not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

// Only same-origin relative paths are allowed so a notification can't send users elsewhere
function safeUrl(url?: string): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

export const webPushChannel: NotificationChannel = {
  id: 'webpush',

  async send(userId, message: NotificationMessage & { tag: string }): Promise<ChannelOutcome> {
    try {
      configure();
    } catch (e) {
      return { status: 'failed', error: (e as Error).message };
    }

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return { status: 'no_target' };

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: safeUrl(message.url),
      tag: message.tag,
      data: message.data ?? {},
    });

    let delivered = 0;
    let lastError = '';
    const dead: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 60 * 60, urgency: 'high' }
          );
          delivered++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410 mean the browser revoked or expired this subscription
          if (status === 404 || status === 410) dead.push(sub.endpoint);
          else lastError = `push service responded ${status ?? 'with an error'}`;
        }
      })
    );

    if (dead.length) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
    if (delivered > 0) {
      await prisma.pushSubscription.updateMany({
        where: { userId, endpoint: { notIn: dead } },
        data: { lastSuccessAt: new Date() },
      });
      return { status: 'sent' };
    }
    return lastError ? { status: 'failed', error: lastError } : { status: 'no_target' };
  },
};
