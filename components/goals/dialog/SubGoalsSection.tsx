"use client";

import React, { useMemo, useState } from 'react';
import { GitBranch, Plus, Link2, Unlink, ChevronRight, X } from 'lucide-react';
import { createGoal, attachSubGoal, detachSubGoal } from '../../../app/goals/actions';
import { useGoals } from '../../../app/goals/GoalsProvider';
import type { GoalDetail } from '../../../types/goals';
import StatusBadge from '../StatusBadge';
import GoalPicker from '../GoalPicker';

interface SubGoalsSectionProps {
  detail: GoalDetail;
}

export default function SubGoalsSection({ detail }: SubGoalsSectionProps) {
  const { goals, notify, refresh, openGoal } = useGoals();
  const [mode, setMode] = useState<'none' | 'create' | 'link'>('none');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Only parentless goals can be linked, and never this goal or one of its ancestors
  const linkable = useMemo(() => {
    const blocked = new Set([detail.id, ...detail.ancestors.map(a => a.id)]);
    return goals.filter(g => !g.parentId && !blocked.has(g.id));
  }, [goals, detail.id, detail.ancestors]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const res = await createGoal({ name, parentId: detail.id });
      if (res.ok === false) return notify(res.error);
      setName('');
      setMode('none');
      notify(`Created and linked “${res.data.name}”`);
      await refresh();
    } catch {
      notify('Could not create the sub-goal.');
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async (childId: string) => {
    setBusy(true);
    try {
      const res = await attachSubGoal(detail.id, childId);
      if (res.ok === false) return notify(res.error);
      setMode('none');
      notify(`Linked “${res.data.name}” as a sub-goal`);
      await refresh();
    } catch {
      notify('Could not link the goal.');
    } finally {
      setBusy(false);
    }
  };

  const handleDetach = async (childId: string, childName: string) => {
    const res = await detachSubGoal(childId);
    if (res.ok === false) return notify(res.error);
    notify(`Detached “${childName}”. It is now a top-level goal.`);
    await refresh();
  };

  return (
    <section aria-labelledby="subgoals-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 id="subgoals-heading" className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-neutral-400 whitespace-nowrap">
          <GitBranch className="w-3.5 h-3.5" /> Sub-goals <span className="text-neutral-600">{detail.children.length}</span>
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setMode(m => (m === 'link' ? 'none' : 'link'))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-700 text-xs text-white whitespace-nowrap hover:border-white active:scale-95 transition-all">
            <Link2 className="w-3.5 h-3.5" /> Link existing
          </button>
          <button onClick={() => setMode(m => (m === 'create' ? 'none' : 'create'))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold whitespace-nowrap hover:bg-neutral-200 active:scale-95 transition-all">
            <Plus className="w-3.5 h-3.5" /> Create &amp; link
          </button>
        </div>
      </div>

      {mode === 'create' && (
        <form onSubmit={handleCreate} className="mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            placeholder="Sub-goal name"
            aria-label="Sub-goal name"
            className="flex-1 bg-[#141414] border border-[#262626] focus:border-white rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none transition-all"
          />
          <button type="submit" disabled={busy || !name.trim()} className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold disabled:opacity-40 active:scale-95 transition-all">Add</button>
          <button type="button" onClick={() => setMode('none')} aria-label="Cancel" className="w-8 h-8 rounded-full text-neutral-500 hover:text-white flex items-center justify-center"><X className="w-4 h-4" /></button>
        </form>
      )}

      {mode === 'link' && (
        <GoalPicker
          goals={linkable}
          onPick={g => handleLink(g.id)}
          placeholder="Search top-level goals…"
          emptyText="No unlinked goals. Create a goal first, or detach one from its parent."
          className="mb-3"
        />
      )}

      {detail.children.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-800 py-5 text-center text-xs text-neutral-600">No sub-goals attached.</p>
      ) : (
        <ul className="space-y-2">
          {detail.children.map(c => (
            <li key={c.id} className="flex items-center gap-2 rounded-xl border border-[#222222] bg-[#0f0f0f] pl-4 pr-2 py-2 hover:border-neutral-600 transition-colors">
              <button onClick={() => openGoal(c.id, 'push')} className="flex-1 min-w-0 flex items-center justify-between gap-3 py-1 text-left group">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white truncate">{c.name}</span>
                  <span className="block text-[10px] font-mono text-neutral-500 mt-0.5">{c.subGoalCount} sub-goals · {c.taskCount} tasks</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={c.status} />
                  <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-white transition-colors" />
                </span>
              </button>
              <button
                onClick={() => handleDetach(c.id, c.name)}
                aria-label={`Detach ${c.name}`}
                title="Detach from this goal"
                className="shrink-0 w-8 h-8 rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors"
              >
                <Unlink className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
