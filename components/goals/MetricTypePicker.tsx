import React from 'react';
import { Hash, Percent, Timer, CircleCheck, Ruler } from 'lucide-react';
import { METRIC_TYPES, type MetricType } from '../../types/goals';
import { METRIC_CONFIG } from '../../lib/goals/metrics';

export const METRIC_ICON: Record<MetricType, React.ComponentType<{ className?: string }>> = {
  COUNT: Hash,
  PERCENT: Percent,
  DURATION: Timer,
  YESNO: CircleCheck,
  CUSTOM: Ruler,
};

interface MetricTypePickerProps {
  value: MetricType;
  onChange: (value: MetricType) => void;
}

export default function MetricTypePicker({ value, onChange }: MetricTypePickerProps) {
  return (
    <div role="radiogroup" aria-label="Metric type" className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {METRIC_TYPES.map(type => {
        const Icon = METRIC_ICON[type];
        const active = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(type)}
            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all active:scale-[0.97] ${
              active
                ? 'border-white bg-white text-black'
                : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-xs font-semibold">{METRIC_CONFIG[type].label}</span>
            <span className={`text-[10px] font-mono leading-tight ${active ? 'text-neutral-600' : 'text-neutral-500'}`}>
              {METRIC_CONFIG[type].example}
            </span>
          </button>
        );
      })}
    </div>
  );
}
