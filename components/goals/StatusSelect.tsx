import React from 'react';
import { GOAL_STATUSES, type GoalStatus } from '../../types/goals';
import { STATUS_LABEL } from './StatusBadge';

interface StatusSelectProps {
  value: GoalStatus;
  onChange: (status: GoalStatus) => void;
  disabled?: boolean;
}

export default function StatusSelect({ value, onChange, disabled }: StatusSelectProps) {
  return (
    <div role="radiogroup" aria-label="Goal status" className="inline-flex p-0.5 rounded-full bg-neutral-950 border border-neutral-800">
      {GOAL_STATUSES.map(s => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(s)}
            className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-medium transition-all disabled:opacity-50 ${
              active ? 'bg-white text-black font-semibold' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
