"use client";

import React from 'react';
import { Brain, Zap } from 'lucide-react';
import type { WorkType } from '../../types/goals';

interface WorkTypeToggleProps {
  value: WorkType;
  onChange: (value: WorkType) => void;
  disabled?: boolean;
  label?: string;
}

const OPTIONS: { value: WorkType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'DEEP', label: 'Deep', icon: Brain },
  { value: 'SHALLOW', label: 'Shallow', icon: Zap },
];

export default function WorkTypeToggle({ value, onChange, disabled, label = 'Work type' }: WorkTypeToggleProps) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-neutral-800 p-0.5">
      {OPTIONS.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => value !== o.value && onChange(o.value)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors disabled:opacity-50 ${
            value === o.value ? 'bg-white text-black font-semibold' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <o.icon className="w-3 h-3" /> {o.label}
        </button>
      ))}
    </div>
  );
}
