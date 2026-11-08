"use client";

import React, { useState } from 'react';
import { FileText, Plus, ChevronRight } from 'lucide-react';
import { createPlan } from '../../../app/goals/actions';
import { useGoals } from '../../../app/goals/GoalsProvider';
import type { GoalDetail } from '../../../types/goals';

interface PlansSectionProps {
  detail: GoalDetail;
  onOpenPlan: (planId: string) => void;
}

function firstLine(body: string): string {
  const line = body.split('\n').map(l => l.replace(/^[#>\-*\s]+/, '').trim()).find(l => l.length > 0);
  return line ?? 'Empty plan';
}

export default function PlansSection({ detail, onOpenPlan }: PlansSectionProps) {
  const { notify, refresh } = useGoals();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await createPlan(detail.id);
      if (res.ok === false) return notify(res.error);
      await refresh();
      onOpenPlan(res.data.id);
    } catch {
      notify('Could not create the plan.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section aria-labelledby="plans-heading">
      <div className="flex items-center justify-between mb-3">
        <h3 id="plans-heading" className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-neutral-400">
          <FileText className="w-3.5 h-3.5" /> Plans <span className="text-neutral-600">{detail.plans.length}</span>
        </h3>
        <button onClick={handleCreate} disabled={creating} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-700 text-xs text-white hover:border-white active:scale-95 transition-all disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> New plan
        </button>
      </div>

      {detail.plans.length === 0 ? (
        <button onClick={handleCreate} className="w-full rounded-xl border border-dashed border-neutral-800 py-6 text-xs text-neutral-500 hover:border-neutral-600 hover:text-neutral-300 transition-colors">
          No plans yet. Write your first one.
        </button>
      ) : (
        <ul className="space-y-2">
          {detail.plans.map(p => (
            <li key={p.id}>
              <button onClick={() => onOpenPlan(p.id)} className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#222222] bg-[#0f0f0f] px-4 py-3 text-left hover:border-neutral-600 transition-colors group">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white truncate">{p.title}</span>
                  <span className="block text-xs text-neutral-500 truncate mt-0.5">{firstLine(p.body)}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-neutral-600">
                  {new Date(p.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-white transition-colors" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
