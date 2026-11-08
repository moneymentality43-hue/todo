"use client";

import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { attachTask } from '../../app/goals/actions';
import { useGoals } from '../../app/goals/GoalsProvider';
import type { GoalSummary, GoalTaskDTO } from '../../types/goals';
import { isComplete } from '../../lib/goals/metrics';
import { currentStreak } from '../../lib/goals/streak';
import CreateTaskForm from './CreateTaskForm';
import GoalPicker from './GoalPicker';
import TaskProgressCard from './TaskProgressCard';

type Filter = 'ALL' | 'UNATTACHED' | 'ATTACHED';

export default function TasksTab() {
  const { tasks, goals, logs, loading, openGoal, patchTask, refresh, notify } = useGoals();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [attachFor, setAttachFor] = useState<GoalTaskDTO | null>(null);
  const [pendingGoal, setPendingGoal] = useState<GoalSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(t =>
      (filter === 'ALL' || (filter === 'UNATTACHED' ? !t.goalId : !!t.goalId)) &&
      (!q || t.title.toLowerCase().includes(q)),
    );
  }, [tasks, filter, query]);

  const summary = useMemo(() => ({
    total: tasks.length,
    complete: tasks.filter(t => isComplete(t.current, t.target)).length,
    bestStreak: tasks.reduce((best, t) => Math.max(best, currentStreak(logs[t.id] ?? [])), 0),
  }), [tasks, logs]);

  const closeAttach = () => { setAttachFor(null); setPendingGoal(null); };

  const doAttach = async (task: GoalTaskDTO, goal: GoalSummary) => {
    setBusy(true);
    try {
      const res = await attachTask(goal.id, task.id, { move: true });
      if (res.ok === false) return notify(res.error);
      patchTask(res.data);
      notify(`Attached to “${goal.name}”`);
      closeAttach();
      await refresh();
    } catch {
      notify('Could not attach the task.');
    } finally {
      setBusy(false);
    }
  };

  const pickGoal = (goal: GoalSummary) => {
    if (!attachFor) return;
    if (attachFor.goalId && attachFor.goalId !== goal.id) setPendingGoal(goal);
    else doAttach(attachFor, goal);
  };

  const counts: Record<Filter, number> = {
    ALL: tasks.length,
    UNATTACHED: tasks.filter(t => !t.goalId).length,
    ATTACHED: tasks.filter(t => !!t.goalId).length,
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['Tasks', summary.total],
          ['At target', summary.complete],
          ['Best streak', `${summary.bestStreak}d`],
        ].map(([label, val]) => (
          <div key={label} className="rounded-xl border border-[#222222] bg-[#0f0f0f] px-3 py-3 sm:px-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">{label}</div>
            <div className="mt-1 font-headline text-xl font-semibold text-white tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="w-full bg-[#141414] border border-[#262626] focus:border-white rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-600 outline-none transition-all font-mono"
          />
        </div>
        <button onClick={() => setCreating(c => !c)} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all">
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> New task
        </button>
      </div>

      {creating && (
        <div className="mt-3">
          <CreateTaskForm
            onCancel={() => setCreating(false)}
            onCreated={async t => {
              patchTask(t);
              setCreating(false);
              notify('Task created');
              await refresh();
            }}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Filter tasks">
        {([['ALL', 'All'], ['UNATTACHED', 'Unattached'], ['ATTACHED', 'Attached']] as [Filter, string][]).map(([f, label]) => (
          <button
            key={f}
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
              filter === f ? 'bg-white text-black border-white font-semibold' : 'border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600'
            }`}
          >
            {label} <span className="font-mono opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 animate-pulse" aria-busy="true">
            {[0, 1].map(i => <div key={i} className="h-56 rounded-2xl bg-neutral-900" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 py-14 text-center">
            <p className="text-sm text-neutral-300">No tasks yet</p>
            <p className="mt-1 text-xs text-neutral-600">Create a task with a metric, then attach it to a goal.</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-xs font-mono text-neutral-600">No tasks match your filters.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map(t => (
              <TaskProgressCard key={t.id} task={t} onOpenGoal={id => openGoal(id)} onAttach={setAttachFor} />
            ))}
          </div>
        )}
      </div>

      {attachFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) closeAttach(); }}>
          <div role="dialog" aria-modal="true" aria-label="Attach task to a goal" className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#222222] bg-[#0a0a0a] p-4 sm:p-5 shadow-2xl motion-safe:animate-[goal-sheet_0.2s_ease-out]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-semibold text-white">
                {attachFor.goalId ? 'Move' : 'Attach'} “{attachFor.title}”
              </h3>
              <button onClick={closeAttach} aria-label="Close" className="w-8 h-8 rounded-full text-neutral-500 hover:text-white flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>

            {pendingGoal ? (
              <div className="rounded-xl border border-neutral-700 bg-neutral-950 p-3">
                <p className="text-xs text-neutral-300">
                  This task is on “{attachFor.goalName}”. A task can only belong to one goal. Move it to “{pendingGoal.name}”?
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => setPendingGoal(null)} className="px-3 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white">Back</button>
                  <button disabled={busy} onClick={() => doAttach(attachFor, pendingGoal)} className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-50">Move task</button>
                </div>
              </div>
            ) : (
              <GoalPicker
                goals={goals.filter(g => g.id !== attachFor.goalId)}
                onPick={pickGoal}
                emptyText="No goals yet. Create one in the Goals tab."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
