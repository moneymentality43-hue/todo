"use client";

import React, { useState } from 'react';
import { Clock, Minus, Plus } from 'lucide-react';
import { logTaskTime, updateGoalTask } from '../../app/goals/actions';
import { useGoals } from '../../app/goals/GoalsProvider';
import { formatHours } from '../../lib/goals/time';
import type { GoalTaskDTO, WorkType } from '../../types/goals';
import WorkTypeToggle from './WorkTypeToggle';

const QUICK_ADD: { label: string; minutes: number }[] = [
  { label: '+15m', minutes: 15 },
  { label: '+30m', minutes: 30 },
  { label: '+1h', minutes: 60 },
  { label: '+2h', minutes: 120 },
];

// Deep/shallow type and manually logged time for a task; goal totals refresh after every change
export default function TaskTimeRow({ task }: { task: GoalTaskDTO }) {
  const { patchTask, refresh, notify } = useGoals();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);

  const afterChange = (updated: GoalTaskDTO) => {
    patchTask(updated);
    if (updated.goalId) refresh();
  };

  const changeType = async (workType: WorkType) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await updateGoalTask(task.id, { workType });
      if (res.ok === false) return notify(res.error);
      afterChange(res.data);
    } catch {
      notify('Could not change the work type.');
    } finally {
      setBusy(false);
    }
  };

  const log = async (deltaMin: number) => {
    if (busy || deltaMin === 0) return;
    setBusy(true);
    try {
      const res = await logTaskTime(task.id, { deltaMin });
      if (res.ok === false) return notify(res.error);
      afterChange(res.data);
      setHours('');
    } catch {
      notify('Could not log time. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const customMinutes = Math.round((Number(hours) || 0) * 60);

  return (
    <div className="mt-4 pt-3 border-t border-[#1a1a1a]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WorkTypeToggle value={task.workType} onChange={changeType} disabled={busy} />
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-800 text-[11px] font-mono text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
        >
          <Clock className="w-3.5 h-3.5" /> {formatHours(task.timeSpentMin)} spent
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Quick add time">
            {QUICK_ADD.map(q => (
              <button
                key={q.minutes}
                onClick={() => log(q.minutes)}
                disabled={busy}
                className="px-3 py-1 rounded-full border border-neutral-700 text-[11px] font-mono text-neutral-200 hover:border-white hover:text-white active:scale-95 transition-all disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="0.25"
              inputMode="decimal"
              value={hours}
              onChange={e => setHours(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); log(customMinutes); } }}
              placeholder="Hours, e.g. 1.5"
              aria-label="Hours to add or remove"
              className="flex-1 min-w-0 bg-[#141414] border border-[#262626] focus:border-white rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none transition-all"
            />
            <button
              onClick={() => log(-customMinutes)}
              disabled={busy || customMinutes <= 0}
              aria-label="Remove time"
              className="shrink-0 w-9 h-9 rounded-full border border-neutral-700 text-white flex items-center justify-center hover:border-white active:scale-90 transition-all disabled:opacity-30"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => log(customMinutes)}
              disabled={busy || customMinutes <= 0}
              aria-label="Add time"
              className="shrink-0 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 active:scale-90 transition-all disabled:opacity-30"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
