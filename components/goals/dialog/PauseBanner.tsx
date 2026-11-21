"use client";

import React from 'react';
import { Pause } from 'lucide-react';
import type { GoalDetail } from '../../../types/goals';
import { formatDateTime } from './ModalShell';

interface PauseBannerProps {
  detail: GoalDetail;
  busy: boolean;
  onResume: () => void;
  onChangeDate: () => void;
  onOpenRoot: (id: string) => void;
}

export default function PauseBanner({ detail, busy, onResume, onChangeDate, onOpenRoot }: PauseBannerProps) {
  if (detail.status !== 'PAUSED') return null;

  // Paused together with another goal: only that goal can be resumed
  if (detail.pausedByGoalId) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-neutral-700 px-3 py-2.5 text-xs text-neutral-300">
        <Pause className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
        <span className="min-w-0">
          Paused with{' '}
          <button onClick={() => onOpenRoot(detail.pausedByGoalId!)} className="font-semibold text-white underline underline-offset-2 hover:no-underline">
            {detail.pausedByGoalName ?? 'another goal'}
          </button>
          {detail.pausedUntil && <> · resumes {formatDateTime(detail.pausedUntil)}</>}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-neutral-700 px-3 py-2.5 space-y-2">
      <p className="flex items-start gap-2 text-xs text-neutral-300">
        <Pause className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-500" />
        <span className="min-w-0 break-words">
          Paused{detail.pausedUntil && <> until <span className="font-mono text-white">{formatDateTime(detail.pausedUntil)}</span></>}
          {detail.pauseReason && <> — <span className="text-neutral-400">{detail.pauseReason}</span></>}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <button disabled={busy} onClick={onResume} className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-50">Resume now</button>
        <button disabled={busy} onClick={onChangeDate} className="px-3 py-1.5 rounded-full border border-neutral-700 text-xs text-white hover:border-white active:scale-95 transition-all disabled:opacity-50">Change date</button>
      </div>
    </div>
  );
}
