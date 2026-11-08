"use client";

import React, { useMemo, useState } from 'react';
import { Plus, Search, Target, GitBranch, ListChecks } from 'lucide-react';
import { createGoal } from '../../app/goals/actions';
import { useGoals } from '../../app/goals/GoalsProvider';
import { GOAL_STATUSES, type GoalStatus } from '../../types/goals';
import StatusBadge, { STATUS_LABEL } from './StatusBadge';

type Filter = 'ALL' | GoalStatus;

export default function GoalsTab() {
  const { goals, loading, openGoal, refresh, notify } = useGoals();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: goals.length, IN_PROGRESS: 0, PAUSED: 0, COMPLETED: 0 };
    for (const g of goals) c[g.status]++;
    return c;
  }, [goals]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return goals.filter(g => (filter === 'ALL' || g.status === filter) && (!q || g.name.toLowerCase().includes(q)));
  }, [goals, filter, query]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const res = await createGoal({ name });
      if (res.ok === false) return notify(res.error);
      setName('');
      setCreating(false);
      await refresh();
      openGoal(res.data.id);
    } catch {
      notify('Could not create the goal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search goals…"
            aria-label="Search goals"
            className="w-full bg-[#141414] border border-[#262626] focus:border-white rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-600 outline-none transition-all font-mono"
          />
        </div>
        <button onClick={() => setCreating(c => !c)} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all">
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> New goal
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="mt-3 flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            placeholder="What do you want to achieve?"
            aria-label="Goal name"
            className="flex-1 bg-[#141414] border border-[#262626] focus:border-white rounded-lg px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-all"
          />
          <button type="submit" disabled={busy || !name.trim()} className="px-5 py-2.5 rounded-full bg-white text-black text-xs font-semibold disabled:opacity-40 active:scale-95 transition-all">Create</button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Filter by status">
        {(['ALL', ...GOAL_STATUSES] as Filter[]).map(f => (
          <button
            key={f}
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
              filter === f ? 'bg-white text-black border-white font-semibold' : 'border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600'
            }`}
          >
            {f === 'ALL' ? 'All' : STATUS_LABEL[f]} <span className="font-mono opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 animate-pulse" aria-busy="true">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-neutral-900" />)}
          </div>
        ) : goals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 py-14 text-center">
            <Target className="w-8 h-8 mx-auto text-neutral-700" />
            <p className="mt-3 text-sm text-neutral-300">No goals yet</p>
            <p className="mt-1 text-xs text-neutral-600">Create one, then add plans, sub-goals and tasks to it.</p>
            <button onClick={() => setCreating(true)} className="mt-4 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all">Create your first goal</button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-xs font-mono text-neutral-600">No goals match your filters.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map(g => (
              <li key={g.id}>
                <button
                  onClick={() => openGoal(g.id)}
                  className={`w-full h-full text-left rounded-2xl border bg-[#0a0a0a] p-4 hover:border-neutral-500 active:scale-[0.99] transition-all ${
                    g.status === 'COMPLETED' ? 'border-[#1c1c1c] opacity-70' : 'border-[#222222]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-headline text-base font-semibold text-white leading-snug break-words min-w-0">{g.name}</h3>
                    <StatusBadge status={g.status} />
                  </div>
                  {g.parentName && <p className="mt-1 text-[11px] font-mono text-neutral-500 truncate">↳ under {g.parentName}</p>}
                  <div className="mt-4 flex items-center gap-4 text-[11px] font-mono text-neutral-500">
                    <span className="flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> {g.subGoalCount} sub-goal{g.subGoalCount === 1 ? '' : 's'}</span>
                    <span className="flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" /> {g.taskCount} task{g.taskCount === 1 ? '' : 's'}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
