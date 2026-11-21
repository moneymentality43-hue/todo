"use client";

import React from 'react';
import { PERIOD_OPTIONS } from '../../../types/validation';
import type { GoalDetail } from '../../../types/goals';
import { formatDateTime } from './ModalShell';

interface ValidationBarProps {
  detail: GoalDetail;
  onValidate: () => void;
  onPeriodChange: (days: number) => void;
}

// Shown only while the validation feature is on and the goal is in progress
export default function ValidationBar({ detail, onValidate, onPeriodChange }: ValidationBarProps) {
  if (!detail.validationEnabled || detail.status !== 'IN_PROGRESS') return null;

  const periods = PERIOD_OPTIONS.includes(detail.validationPeriodDays as (typeof PERIOD_OPTIONS)[number])
    ? [...PERIOD_OPTIONS]
    : [...PERIOD_OPTIONS, detail.validationPeriodDays].sort((a, b) => a - b);

  return (
    <div className={`mt-3 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-3 py-2.5 ${detail.needsValidation ? 'border-white bg-[#141414]' : 'border-[#222222] bg-[#0f0f0f]'}`}>
      <div className="flex-1 min-w-0 text-xs">
        {detail.needsValidation ? (
          <span className="flex items-center gap-2 font-semibold text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Needs validation
          </span>
        ) : (
          <span className="text-neutral-300">
            Validated{detail.validUntil ? <> · valid until <span className="font-mono text-white">{formatDateTime(detail.validUntil)}</span></> : null}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 justify-between sm:justify-end">
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          Validate every
          <select
            value={detail.validationPeriodDays}
            onChange={e => onPeriodChange(Number(e.target.value))}
            aria-label="Validation period in days"
            className="bg-black border border-neutral-800 rounded-lg px-1.5 py-1 text-white text-[11px] font-mono outline-none focus:border-white"
          >
            {periods.map(d => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
          </select>
        </label>
        <button
          onClick={onValidate}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition-all ${detail.needsValidation ? 'bg-white text-black hover:bg-neutral-200' : 'border border-neutral-700 text-white hover:border-white'}`}
        >
          {detail.needsValidation ? 'Validate' : 'Validate again'}
        </button>
      </div>
    </div>
  );
}
