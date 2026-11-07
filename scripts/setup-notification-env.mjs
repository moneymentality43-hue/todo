// Adds VAPID + cron secrets to .env if missing. Run: node scripts/setup-notification-env.mjs
// Prints only variable names, never the secret values.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const webpush = createRequire(import.meta.url)('web-push');

const file = '.env';
const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
const has = (name) => new RegExp(`^${name}=`, 'm').test(current);

let add = '';
if (!has('NEXT_PUBLIC_VAPID_PUBLIC_KEY') && !has('VAPID_PRIVATE_KEY')) {
  const keys = webpush.generateVAPIDKeys();
  add += `\nNEXT_PUBLIC_VAPID_PUBLIC_KEY="${keys.publicKey}"\nVAPID_PRIVATE_KEY="${keys.privateKey}"\n`;
}
if (!has('VAPID_SUBJECT')) add += `VAPID_SUBJECT="mailto:admin@example.com"\n`;
if (!has('CRON_SECRET')) add += `CRON_SECRET="${randomBytes(32).toString('hex')}"\n`;

if (add) {
  appendFileSync(file, add);
  console.log('added:', [...add.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]).join(', '));
} else {
  console.log('nothing to add');
}
