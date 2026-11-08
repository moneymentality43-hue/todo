"use client";

import React, { useMemo, useState } from 'react';
import { ListChecks, Plus, Link2, X } from 'lucide-react';
import { attachTask } from '../../../app/goals/actions';
import { useGoals } from '../../../app/goals/GoalsProvider';
import type { GoalDetail, GoalTaskDTO } from '../../../types/goals';
import { METRIC_CONFIG } from '../../../lib/goals/metrics';
import CreateTaskForm from '../CreateTaskForm';
import TaskProgressCard from '../TaskProgressCard';

interface TasksSectionProps {
  detail: GoalDetail;
}

export default function TasksSection({ detail }: TasksSectionProps) {
  const { tasks, patchTask, notify, refresh, openGoal } = useGoals();
  const [mode, setMode] = useState<'none' | 'create' | 'attach'>('none');
  const [query, setQuery] = useState('');
  const [confirmMove, setConfirmMove] = useState<GoalTaskDTO | null>(null);
  const [busy, setBusy] = useState(false);

  // Live values come from the shared task list; membership comes from the goal itself
  const goalTasks = useMemo(() => {
    const byId = new Map(tasks.map(t => [t.id, t]));
    return detail.tasks
      .map(t => byId.get(t.id) ?? t)
      .filter(t => t.goalId === detail.id);
  }, [detail.tasks, detail.id, tasks]);

  const attachable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter(t => t.goalId !== detail.id)
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .sort((a, b) => Number(!!a.goalId) - Number(!!b.goalId)); // unattached first
  }, [tasks, detail.id, query]);

  const doAttach = async (task: GoalTaskDTO, move: boolean) => {
    setBusy(true);
    try {
      const res = await attachTask(detail.id, task.id, { move });
      if (res.ok === false) {
        if (res.needsConfirm) setConfirmMove(task);
        else notify(res.error);
        return;
      }
      patchTask(res.data);
      setConfirmMove(null);
      setMode('none');
      setQuery('');
      notify(move ? 'Task moved to this goal' : 'Task attached');
      await refresh();
    } catch {
      notify('Could not attach the task.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="tasks-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 id="tasks-heading" className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-neutral-400 whitespace-nowrap">
          <ListChecks className="w-3.5 h-3.5" /> Tasks <span className="text-neutral-600">{goalTasks.length}</span>
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setMode(m => (m === 'attach' ? 'none' : 'attach'))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-700 text-xs text-white whitespace-nowrap hover:border-white active:scale-95 transition-all">
            <Link2 className="w-3.5 h-3.5" /> Attach existing
          </button>
          <button onClick={() => setMode(m => (m === 'create' ? 'none' : 'create'))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold whitespace-nowrap hover:bg-neutral-200 active:scale-95 transition-all">
            <Plus className="w-3.5 h-3.5" /> New task
          </button>
        </div>
      </div>

      {mode === 'create' && (
        <div className="mb-4">
          <CreateTaskForm
            goalId={detail.id}
            onCancel={() => setMode('none')}
            onCreated={async t => {
              patchTask(t);
              setMode('none');
              notify('Task created');
              await refresh();
            }}
          />
        </div>
      )}

      {mode === 'attach' && (
        <div className="mb-4 rounded-xl border border-[#262626] bg-[#101010]">
          <div className="flex items-center border-b border-[#1f1f1f]">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tasks…"
              aria-label="Search tasks"
              className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white placeholder-neutral-600 outline-none font-mono"
            />
            <button onClick={() => { setMode('none'); setConfirmMove(null); }} aria-label="Close" className="w-8 h-8 mr-1 text-neutral-500 hover:text-white flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>

          {confirmMove && (
            <div className="m-2 rounded-lg border border-neutral-700 bg-neutral-950 p-3">
              <p className="text-xs text-neutral-300">
                “{confirmMove.title}” is attached to “{confirmMove.goalName}”. A task can only belong to one goal. Move it here?
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setConfirmMove(null)} className="px-3 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white">Cancel</button>
                <button disabled={busy} onClick={() => doAttach(confirmMove, true)} className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-50">Move here</button>
              </div>
            </div>
          )}

          <ul className="max-h-56 overflow-y-auto p-1">
            {attachable.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-neutral-600">{query ? 'No matches.' : 'No other tasks yet. Create a new one instead.'}</li>
            ) : (
              attachable.map(t => (
                <li key={t.id}>
                  <button
                    disabled={busy}
                    onClick={() => (t.goalId ? setConfirmMove(t) : doAttach(t, false))}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-800 transition-colors disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-white truncate">{t.title}</span>
                      <span className="block text-[10px] font-mono text-neutral-500">{METRIC_CONFIG[t.metricType].label}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-mono text-neutral-500">{t.goalId ? `on ${t.goalName}` : 'Unattached'}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {goalTasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-800 py-5 text-center text-xs text-neutral-600">No tasks yet. Create one or attach an existing task.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goalTasks.map(t => (
            <TaskProgressCard key={t.id} task={t} showGoalChip={false} onOpenGoal={id => openGoal(id, 'push')} />
          ))}
        </div>
      )}
    </section>
  );
}
