import React from 'react';

interface SparklineProps {
  values: number[];
  className?: string;
}

// 14 tiny bars; today is the last one and rendered solid white
export default function Sparkline({ values, className = '' }: SparklineProps) {
  const max = Math.max(...values, 0);
  return (
    <div className={`flex items-end gap-[3px] h-6 ${className}`} aria-hidden="true">
      {values.map((v, i) => {
        const h = max === 0 ? 8 : Math.max(8, Math.round((v / max) * 100));
        const isToday = i === values.length - 1;
        return (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className={`w-[5px] rounded-sm transition-all duration-300 ${
              v === 0 ? 'bg-neutral-800' : isToday ? 'bg-white' : 'bg-neutral-500'
            }`}
          />
        );
      })}
    </div>
  );
}
