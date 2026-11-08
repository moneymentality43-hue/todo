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
| Status | `In progress`, `Paused` or `Completed`, set freely. |

Code lives in `app/goals/` (server actions in `actions.ts`), `components/goals/`, `lib/goals/` and `types/goals.ts`. The models (`Goal`, `GoalPlan`, `GoalTask`, `GoalTaskLog`) are additive: run `npx prisma db push` to create them.
The graph uses [React Flow](https://reactflow.dev) (`@xyflow/react`).

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
