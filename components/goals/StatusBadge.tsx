import React from 'react';
import { Check } from 'lucide-react';
import type { GoalStatus } from '../../types/goals';

export const STATUS_LABEL: Record<GoalStatus, string> = {
  IN_PROGRESS: 'In progress',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
};

export default function StatusBadge({ status, className = '' }: { status: GoalStatus; className?: string }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider whitespace-nowrap';

  if (status === 'COMPLETED') {
    return (
      <span className={`${base} bg-white text-black ${className}`}>
        <Check className="w-3 h-3 stroke-[3]" /> {STATUS_LABEL[status]}
      </span>
    );
  }
  if (status === 'PAUSED') {
    return (
      <span className={`${base} border border-dashed border-neutral-600 text-neutral-500 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full border border-neutral-500" /> {STATUS_LABEL[status]}
      </span>
    );
  }
  return (
    <span className={`${base} border border-neutral-500 text-neutral-200 ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white" /> {STATUS_LABEL[status]}
    </span>
  );
}
