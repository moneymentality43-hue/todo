This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Push notifications

Web Push notifications are delivered to the user's browser even when the site is closed (desktop + Android).

### Sending a notification from anywhere in the server code

```ts
import { notify } from '../lib/notifications/service'; // adjust the relative path

await notify({
  userId,
  type: 'TASK_WARNING',           // must exist in lib/notifications/types.ts
  dedupeKey: `task:${id}:warn`,   // same key twice = sent once
  title: 'Due in 1h',
  body: 'Finish the report',
  url: '/',                       // same-origin path opened on click
});
```

`notify()` applies the user's preferences and quiet hours, de-duplicates, and sends through every registered channel.

### Extending it

| To add...                    | Do this                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| a notification type          | add an entry to `NOTIFICATION_TYPES` in `lib/notifications/types.ts`                      |
| a scheduled source           | implement `NotificationProducer` and add it to `lib/notifications/producers/index.ts`     |
| a channel (email, SMS, ...)  | implement `NotificationChannel` and add it to `lib/notifications/channels/index.ts`       |

### Setup

1. `node scripts/setup-notification-env.mjs` adds `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` to `.env` (existing values are never overwritten). Set `VAPID_SUBJECT` to a real `mailto:` address.
2. Add the same four variables to the hosting provider (e.g. Vercel) and redeploy.
3. `npx prisma db push` to create the notification tables.
4. Create a scheduler that calls the endpoint every minute, for example a free [cron-job.org](https://cron-job.org) job:
   `GET https://<your-domain>/api/cron/notifications` with header `Authorization: Bearer <CRON_SECRET>`.
   `vercel.json` also registers a daily Vercel Cron as a backup (Vercel Hobby allows one run per day).
5. Open the bell icon in the app header and enable notifications on each device.

Notes: push needs HTTPS (localhost is allowed). Regenerating the VAPID keys invalidates existing subscriptions.
`node scripts/generate-icons.mjs` regenerates the PWA/notification icons in `public/`.

## Goals

The **Goals** tab (`/goals`) has three views: **Goals**, **Tasks** and **Graph**. A goal opens in a shared dialog with its plans (markdown, autosaved), sub-goals and tasks.

| Rule | Behaviour |
| --- | --- |
| Sub-goals | A strict tree: a goal has at most one parent. Detach it first to attach it elsewhere; cycles are rejected. |
| Tasks | A goal task has one metric (count, percentage, duration, yes/no or custom unit) and belongs to at most one goal. Detach keeps it; delete removes it and its history. |
| Deleting a goal | Its sub-goals become top-level, its tasks become unattached, and its plans are deleted. |
| Status | `In progress`, `Paused` or `Completed`. Pausing is only possible through the Pause dialog (see below). |

Code lives in `app/goals/` (server actions in `actions.ts`), `components/goals/`, `lib/goals/` and `types/goals.ts`. The models (`Goal`, `GoalPlan`, `GoalTask`, `GoalTaskLog`) are additive: run `npx prisma db push` to create them.
The graph uses [React Flow](https://reactflow.dev) (`@xyflow/react`).

### Goal validation and pausing

The shield icon in the header opens the **Validation** settings. It is opt-in: until it is switched on there are no validate buttons or reminders.

| Rule | Behaviour |
| --- | --- |
| Validating | In an open goal, **Validate** needs at least 100 words. The goal and all its ancestors are validated and each gets a history row. Updating tasks never validates. |
| Validity | A validation lasts until the Nth next "day start" (default 07:00 in your timezone), where N is the goal's own period (1-30 days, default 1). |
| Needs validation | In-progress goals that were never validated, whose validity ended, or that resumed after a pause. Paused and completed goals never need it. |
| Reminders | Up to 4 daily times. At each one the cron sends a single push listing the goals that need validating, grouped by top-level goal. |
| Pausing | Always needs a reason (at least 20 words) and a resume date at most 30 days ahead; this applies even when validation is off. In-progress sub-goals pause with it. |
| Resuming | The goal and the sub-goals paused with it resume automatically at the resume time, need validation straight away, and send a "Goal resumed" push. **Resume now** resumes early (no push). Sub-goals paused with a parent can only be resumed through the parent. |

Code lives in `lib/goalValidation/` (rules, pause/resume, digest), `app/validation/actions.ts`, `components/validation/` and `types/validation.ts`. Two cron producers (`goal-resume`, `validation-digest`) are registered in `lib/notifications/producers/`, so the every-minute cron ping from the push-notification setup is required for reminders and automatic resume.

After pulling this feature run `npx prisma db push`, then once `node scripts/migrate-paused-goals.mjs` (moves goals paused under the old free-form status back to `IN_PROGRESS`; safe to re-run).

## Authentication and input limits

`/login` has **Sign In** and **Sign Up** tabs (accounts are no longer auto-created). Server actions: `signInAction` / `signUpAction` in `app/actions.ts`.

| Rule | Behaviour |
| --- | --- |
| Username | 3-30 chars, letters/numbers/`_ . -`, stored lowercase, case-insensitive unique |
| Password (sign up) | 10-64 chars with upper + lower + number + symbol, no spaces, must not contain the username (bcrypt, cost 12). Sign-in only caps the length so older accounts keep working |
| Lockout | 5 wrong passwords lock the account for 15 minutes (`failedLoginCount`, `lockedUntil` on `User`) |
| Errors | Sign-in always answers "Invalid username or password" (no user enumeration) |
| `JWT_SECRET` | Required, at least 32 characters |

Every text field has a limit, enforced three times: `maxLength` in the UI, server-side checks (`lib/validation.ts`, `types/goals.ts`) and `@db.VarChar(n)` in `prisma/schema.prisma`. Titles/names are 120 chars (metric name 60, starter step 200) and long text (plans, reflections, excuses) is 6000 chars (~1000 words). All queries go through Prisma (the one raw query is a parameterised tagged template), so user input is never concatenated into SQL. After changing limits run `npx prisma db push`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
