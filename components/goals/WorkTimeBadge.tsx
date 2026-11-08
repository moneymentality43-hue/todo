import React from 'react';
import { Brain, Zap } from 'lucide-react';
import { formatHours } from '../../lib/goals/time';

interface WorkTimeBadgeProps {
  deepMinutes: number;
  shallowMinutes: number;
  compact?: boolean;
  className?: string;
}

export default function WorkTimeBadge({ deepMinutes, shallowMinutes, compact = false, className = '' }: WorkTimeBadgeProps) {
  const icon = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <div
      className={`flex items-center gap-3 font-mono ${compact ? 'text-[10px]' : 'text-[11px]'} ${className}`}
      aria-label={`Deep work ${formatHours(deepMinutes)}, shallow work ${formatHours(shallowMinutes)}`}
    >
      <span className={`flex items-center gap-1.5 ${deepMinutes > 0 ? 'text-white' : 'text-neutral-600'}`}>
        <Brain className={icon} aria-hidden="true" /> Deep {formatHours(deepMinutes)}
      </span>
      <span className={`flex items-center gap-1.5 ${shallowMinutes > 0 ? 'text-neutral-300' : 'text-neutral-600'}`}>
        <Zap className={icon} aria-hidden="true" /> Shallow {formatHours(shallowMinutes)}
      </span>
    </div>
  );
}
