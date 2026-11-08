import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { GoalSummary } from '../../types/goals';
import StatusBadge from './StatusBadge';

interface GoalPickerProps {
  goals: GoalSummary[];
  onPick: (goal: GoalSummary) => void;
  placeholder?: string;
  emptyText?: string;
  autoFocus?: boolean;
  className?: string;
}

export default function GoalPicker({ goals, onPick, placeholder = 'Search goals…', emptyText = 'No goals available.', autoFocus = true, className = '' }: GoalPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? goals.filter(g => g.name.toLowerCase().includes(q)) : goals;
  }, [goals, query]);

  return (
    <div className={`rounded-xl border border-[#262626] bg-[#101010] ${className}`}>
      <div className="relative border-b border-[#1f1f1f]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full bg-transparent pl-9 pr-3 py-2.5 text-xs text-white placeholder-neutral-600 outline-none font-mono"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-neutral-600">{query ? 'No matches.' : emptyText}</li>
        ) : (
          filtered.map(g => (
            <li key={g.id}>
              <button
                onClick={() => onPick(g)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-800 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-white truncate">{g.name}</span>
                  {g.parentName && <span className="block text-[10px] font-mono text-neutral-500 truncate">↳ under {g.parentName}</span>}
                </span>
                <StatusBadge status={g.status} />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
