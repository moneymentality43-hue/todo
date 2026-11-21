"use client";

import React, { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { GoalDetail } from '../../../types/goals';
import { formatDateTime } from './ModalShell';

type Entry =
  | { kind: 'validation'; at: string; id: string; direct: boolean; via: string | null; text: string }
  | { kind: 'pause'; at: string; id: string; reason: string; resumeAt: string; resumedAt: string | null; resumeKind: string | null; cascaded: number };

const RESUME_LABEL: Record<string, string> = {
  AUTO: 'resumed automatically',
  MANUAL: 'resumed early',
  COMPLETED: 'ended by completing the goal',
  DELETED: 'ended by deleting a parent',
};

export default function HistorySection({ detail }: { detail: GoalDetail }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...detail.validations.map<Entry>(v => ({ kind: 'validation', at: v.createdAt, id: v.id, direct: v.direct, via: v.viaGoalName, text: v.text })),
      ...detail.pauses.map<Entry>(p => ({ kind: 'pause', at: p.pausedAt, id: p.id, reason: p.reason, resumeAt: p.resumeAt, resumedAt: p.resumedAt, resumeKind: p.resumeKind, cascaded: p.cascadedCount })),
    ];
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [detail.validations, detail.pauses]);

  if (entries.length === 0) return null;

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <details className="group">
      <summary className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-mono uppercase tracking-wider text-neutral-400 hover:text-white">
        <History className="w-3.5 h-3.5" /> History <span className="text-neutral-600">{entries.length}</span>
      </summary>
      <ul className="mt-3 space-y-2">
        {entries.map(e => {
          const open = expanded.has(e.id);
          const body = e.kind === 'validation' ? e.text : e.reason;
          return (
            <li key={e.id} className="rounded-xl border border-[#222222] bg-[#0f0f0f] px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-neutral-500">
                <span className="text-neutral-300">
                  {e.kind === 'validation' ? (e.direct ? 'Validated' : `Validated via ${e.via ?? 'a sub-goal'}`) : 'Paused'}
                </span>
                <span>{formatDateTime(e.at)}</span>
              </div>
              <p className={`mt-1.5 text-xs text-neutral-300 whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-3'}`}>{body}</p>
              {body.length > 160 && (
                <button onClick={() => toggle(e.id)} className="mt-1 text-[11px] text-neutral-500 hover:text-white">{open ? 'Show less' : 'Show more'}</button>
              )}
              {e.kind === 'pause' && (
                <p className="mt-1.5 text-[11px] font-mono text-neutral-500">
                  Planned resume {formatDateTime(e.resumeAt)}
                  {e.resumedAt ? ` · ${RESUME_LABEL[e.resumeKind ?? ''] ?? 'resumed'} ${formatDateTime(e.resumedAt)}` : ' · paused now'}
                  {e.cascaded > 0 ? ` · ${e.cascaded} sub-goal${e.cascaded === 1 ? '' : 's'} paused too` : ''}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
