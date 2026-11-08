"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Flame, Undo2, Ellipsis, Target, Check, X, Pencil, Unlink, Trash2, Link2 } from 'lucide-react';
import { adjustTaskValue, undoLastChange, updateGoalTask, detachTask, deleteTask } from '../../app/goals/actions';
import { useGoals } from '../../app/goals/GoalsProvider';
import type { GoalTaskDTO } from '../../types/goals';
import {
  METRIC_CONFIG, clampValue, formatTarget, formatValue, isComplete, progressRatio, round2, stepLabel,
} from '../../lib/goals/metrics';
import { currentStreak, dailySeries, todayTotal } from '../../lib/goals/streak';
import { METRIC_ICON } from './MetricTypePicker';
import Sparkline from './Sparkline';
import TaskTimeRow from './TaskTimeRow';

interface TaskProgressCardProps {
  task: GoalTaskDTO;
  showGoalChip?: boolean;
  onOpenGoal?: (goalId: string) => void;
  onAttach?: (task: GoalTaskDTO) => void;
  onStructuralChange?: () => void;
}

const RING_R = 50;
const RING_C = 2 * Math.PI * RING_R;
const FLUSH_DELAY_MS = 500;
const HOLD_DELAY_MS = 380;

export default function TaskProgressCard({ task, showGoalChip = true, onOpenGoal, onAttach, onStructuralChange }: TaskProgressCardProps) {
  const { patchTask, removeTask, logs, requestLogs, addLog, popLog, notify, refresh } = useGoals();

  const taskRef = useRef(task);
  taskRef.current = task;

  const config = METRIC_CONFIG[task.metricType];
  const Icon = METRIC_ICON[task.metricType];

  const [value, setValue] = useState(task.current);
  const [step, setStep] = useState(config.steps[0]);
  const [celebrate, setCelebrate] = useState(false);

  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // valueRef is the optimistic value; lastServer is the last value the server confirmed
  const valueRef = useRef(task.current);
  const lastServer = useRef(task.current);
  const pendingRef = useRef(0);
  const inflight = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didRepeat = useRef(false);

  useEffect(() => { requestLogs([task.id]); }, [task.id, requestLogs]);

  // Accept outside changes (undo elsewhere, refresh) only when nothing local is in flight
  const serverCurrent = task.current;
  useEffect(() => {
    if (pendingRef.current === 0 && inflight.current === 0) {
      valueRef.current = serverCurrent;
      lastServer.current = serverCurrent;
      setValue(serverCurrent);
    }
  }, [serverCurrent]);

  const enqueue = useCallback((fn: () => Promise<void>) => {
    inflight.current++;
    chain.current = chain.current.then(fn).catch(() => undefined).then(() => {
      inflight.current--;
      if (pendingRef.current === 0 && inflight.current === 0) {
        valueRef.current = lastServer.current;
        setValue(lastServer.current);
      }
    });
    return chain.current;
  }, []);

  const commit = useCallback(async (input: { delta: number } | { set: number }) => {
    try {
      const res = await adjustTaskValue(taskRef.current.id, input);
      if (res.ok === false) {
        notify(res.error);
        return;
      }
      lastServer.current = res.data.task.current;
      patchTask(res.data.task);
      if (res.data.log) addLog(res.data.log);
    } catch {
      notify('Could not save your change. Reverted.');
    }
  }, [addLog, notify, patchTask]);

  const flush = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const delta = round2(pendingRef.current);
    if (delta === 0) return chain.current;
    pendingRef.current = 0;
    return enqueue(() => commit({ delta }));
  }, [commit, enqueue]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    flush();
  }, [flush]);

  const applyDelta = useCallback((delta: number) => {
    const t = taskRef.current;
    const prev = valueRef.current;
    const next = clampValue(t.metricType, prev + delta);
    if (next === prev) return false;

    valueRef.current = next;
    setValue(next);
    pendingRef.current = round2(pendingRef.current + (next - prev));

    if (prev < t.target && next >= t.target) {
      setCelebrate(true);
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrate(false), 1300);
    }

    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flush(); }, FLUSH_DELAY_MS);
    return true;
  }, [flush]);

  // Press and hold repeats the step with acceleration; the whole hold is saved as one history entry
  const startHold = (sign: 1 | -1) => {
    didRepeat.current = false;
    applyDelta(sign * step);
    holdTimer.current = setTimeout(function tick() {
      didRepeat.current = true;
      applyDelta(sign * step);
      holdSpeed.current = Math.max(45, holdSpeed.current - 8);
      holdTimer.current = setTimeout(tick, holdSpeed.current);
    }, HOLD_DELAY_MS);
  };
  const holdSpeed = useRef(140);
  const stopHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    holdSpeed.current = 140;
    if (didRepeat.current) {
      didRepeat.current = false;
      flush();
    }
  };

  const holdProps = (sign: 1 | -1) => ({
    onPointerDown: (e: React.PointerEvent) => { if (e.button === 0) startHold(sign); },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        applyDelta(sign * step);
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const setExact = (n: number) => {
    flush();
    const next = clampValue(taskRef.current.metricType, n);
    const prev = valueRef.current;
    if (next === prev) return;
    valueRef.current = next;
    setValue(next);
    if (prev < taskRef.current.target && next >= taskRef.current.target) {
      setCelebrate(true);
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrate(false), 1300);
    }
    enqueue(() => commit({ set: next }));
  };

  const startTyping = () => {
    if (task.metricType === 'YESNO') return;
    setDraft(String(value));
    setTyping(true);
  };
  const commitTyping = () => {
    setTyping(false);
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) setExact(n);
  };

  const handleUndo = () => {
    flush();
    enqueue(async () => {
      try {
        const res = await undoLastChange(taskRef.current.id);
        if (res.ok === false) {
          notify(res.error);
          return;
        }
        lastServer.current = res.data.task.current;
        valueRef.current = res.data.task.current;
        setValue(res.data.task.current);
        patchTask(res.data.task);
        popLog(taskRef.current.id);
      } catch {
        notify('Could not undo. Please try again.');
      }
    });
  };

  const handleDetach = async () => {
    setMenuOpen(false);
    await flush();
    const res = await detachTask(task.id);
    if (res.ok === false) return notify(res.error);
    patchTask(res.data);
    notify('Task detached from goal');
    onStructuralChange?.();
    refresh();
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    pendingRef.current = 0;
    const res = await deleteTask(task.id);
    if (res.ok === false) return notify(res.error);
    removeTask(task.id);
    notify('Task deleted');
    onStructuralChange?.();
    refresh();
  };

  const taskLogs = useMemo(() => logs[task.id] ?? [], [logs, task.id]);
  const series = useMemo(() => dailySeries(taskLogs, 14).map(d => d.value), [taskLogs]);
  const streak = useMemo(() => currentStreak(taskLogs), [taskLogs]);
  const today = useMemo(() => todayTotal(taskLogs), [taskLogs]);

  const ratio = progressRatio(value, task.target);
  const done = isComplete(value, task.target);
  const over = task.metricType !== 'YESNO' && task.metricType !== 'PERCENT' && value > task.target;
  const isYesNo = task.metricType === 'YESNO';

  return (
    <div className={`relative rounded-2xl border bg-[#0a0a0a] p-4 sm:p-5 transition-colors duration-300 ${
      done ? 'border-white/70' : 'border-[#222222] hover:border-neutral-700'
    } ${celebrate ? 'motion-safe:animate-[goal-glow_1.2s_ease-out]' : ''}`}>

      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-neutral-500">
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-wider">{config.label}</span>
            {done && <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-white"><Check className="w-3 h-3 stroke-[3]" /> Done</span>}
          </div>
          <h3 className="mt-1 font-headline text-base font-semibold text-white leading-snug break-words">{task.title}</h3>
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Task options"
            aria-expanded={menuOpen}
            className="w-8 h-8 rounded-full border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 flex items-center justify-center transition-colors"
          >
            <Ellipsis className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-1 w-48 z-20 rounded-xl bg-[#141414] border border-[#262626] p-1 shadow-xl">
                <MenuItem icon={Pencil} label="Edit" onClick={() => { setMenuOpen(false); setEditing(true); }} />
                {onAttach && <MenuItem icon={Link2} label={task.goalId ? 'Move to goal…' : 'Attach to goal…'} onClick={() => { setMenuOpen(false); onAttach(task); }} />}
                {task.goalId && <MenuItem icon={Unlink} label="Detach from goal" onClick={handleDetach} />}
                <MenuItem icon={Trash2} label="Delete" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Goal chip */}
      {showGoalChip && (
        <div className="mt-2">
          {task.goalId ? (
            <button
              onClick={() => task.goalId && onOpenGoal?.(task.goalId)}
              className="inline-flex items-center gap-1.5 max-w-full rounded-full border border-neutral-700 px-2.5 py-0.5 text-[11px] text-neutral-300 hover:border-white hover:text-white transition-colors"
            >
              <Target className="w-3 h-3 shrink-0" />
              <span className="truncate">{task.goalName ?? 'Goal'}</span>
            </button>
          ) : (
            <span className="inline-flex items-center rounded-full border border-dashed border-neutral-800 px-2.5 py-0.5 text-[11px] text-neutral-600">Unattached</span>
          )}
        </div>
      )}

      {editing ? (
        <EditPanel task={task} onClose={() => setEditing(false)} onSaved={t => { patchTask(t); setEditing(false); }} />
      ) : confirmDelete ? (
        <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-950 p-3">
          <p className="text-xs text-neutral-300">Delete this task and all of its history? This cannot be undone.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white">Cancel</button>
            <button onClick={handleDelete} className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all">Delete</button>
          </div>
        </div>
      ) : isYesNo ? (
        <button
          onClick={() => setExact(value >= 1 ? 0 : 1)}
          aria-pressed={value >= 1}
          className={`mt-4 w-full rounded-xl py-5 flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-[0.98] ${
            value >= 1 ? 'bg-white text-black' : 'border border-neutral-700 text-neutral-300 hover:border-white hover:text-white'
          }`}
        >
          <Check className={`w-5 h-5 ${value >= 1 ? 'stroke-[3]' : 'opacity-40'}`} />
          {value >= 1 ? 'Done' : 'Mark as done'}
        </button>
      ) : (
        <div className="mt-4 flex items-center gap-4 sm:gap-5">
          {/* Progress ring */}
          <div className={`relative w-[112px] h-[112px] shrink-0 ${celebrate ? 'motion-safe:animate-[goal-pop_0.6s_ease-out]' : ''}`}>
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r={RING_R} fill="none" stroke="#1c1c1c" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={RING_R} fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - ratio)}
                className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
              {typing ? (
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitTyping}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitTyping();
                    if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); }
                  }}
                  aria-label={task.metricType === 'DURATION' ? 'Exact value in minutes' : 'Exact value'}
                  className="w-16 bg-transparent border-b border-white text-center font-mono text-lg text-white outline-none"
                />
              ) : (
                <button onClick={startTyping} aria-label="Type an exact value" title="Tap to type an exact value" className="font-mono text-lg font-bold text-white leading-tight tabular-nums hover:text-neutral-300 transition-colors">
                  {formatValue(task, value)}
                </button>
              )}
              <span className="mt-0.5 text-[10px] font-mono text-neutral-500 leading-tight">
                {typing && task.metricType === 'DURATION' ? 'minutes' : task.metricType === 'PERCENT' ? 'of 100%' : `of ${formatTarget(task)}`}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex-1 min-w-0 flex flex-col items-center sm:items-start gap-3">
            <div className="flex items-center gap-3">
              <button
                {...holdProps(-1)}
                aria-label={`Decrease by ${step}`}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-neutral-700 text-white flex items-center justify-center hover:border-white active:scale-90 transition-all select-none touch-none"
              >
                <Minus className="w-5 h-5" />
              </button>
              <button
                {...holdProps(1)}
                aria-label={`Increase by ${step}`}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 active:scale-90 transition-all select-none touch-none"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Step size">
              {config.steps.map(s => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={s === step}
                  onClick={() => setStep(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ${
                    s === step ? 'bg-neutral-800 text-white border border-neutral-600' : 'text-neutral-500 border border-transparent hover:text-white'
                  }`}
                >
                  {stepLabel(task.metricType, s)}
                </button>
              ))}
            </div>
            {over && <span className="text-[11px] font-mono text-neutral-400">+{formatValue(task, round2(value - task.target))} over target</span>}
          </div>
        </div>
      )}

      {!editing && !confirmDelete && <TaskTimeRow task={task} />}

      {!editing && !confirmDelete && (
        <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Sparkline values={series} />
            <div className="min-w-0 text-[11px] font-mono leading-tight">
              <div className={today > 0 ? 'text-neutral-200' : 'text-neutral-600'}>
                {today > 0 ? (isYesNo ? 'Done today' : `Today +${formatValue(task, today)}`) : 'Nothing yet today'}
              </div>
              {streak > 0 && (
                <div className="flex items-center gap-1 text-white">
                  <Flame className="w-3 h-3" /> {streak} day streak
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleUndo}
            disabled={taskLogs.length === 0}
            aria-label="Undo last change"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-800 text-[11px] text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-30 disabled:hover:text-neutral-400 disabled:hover:border-neutral-800 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        </div>
      )}

      <span className="sr-only" aria-live="polite">{task.title}: {formatValue(task, value)}</span>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
      <Icon className="w-3.5 h-3.5 text-neutral-500" /> {label}
    </button>
  );
}

function EditPanel({ task, onClose, onSaved }: { task: GoalTaskDTO; onClose: () => void; onSaved: (task: GoalTaskDTO) => void }) {
  const { notify } = useGoals();
  const [title, setTitle] = useState(task.title);
  const [target, setTarget] = useState(String(task.target));
  const [unit, setUnit] = useState(task.unit ?? '');
  const [saving, setSaving] = useState(false);

  const hasTarget = task.metricType === 'COUNT' || task.metricType === 'DURATION' || task.metricType === 'CUSTOM';
  const inputCls = 'w-full bg-[#141414] border border-[#262626] focus:border-white rounded-lg px-3 py-2 text-sm text-white outline-none transition-all';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateGoalTask(task.id, {
        title,
        ...(hasTarget ? { target: Number(target) } : {}),
        ...(task.metricType === 'CUSTOM' ? { unit } : {}),
      });
      if (res.ok === false) return notify(res.error);
      onSaved(res.data);
    } catch {
      notify('Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-4 space-y-3">
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={120} aria-label="Task name" className={inputCls} />
      {hasTarget && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
            Target{task.metricType === 'DURATION' ? ' (minutes)' : ''}
            <input type="number" min={1} value={target} onChange={e => setTarget(e.target.value)} className={`${inputCls} mt-1.5`} />
          </label>
          {task.metricType === 'CUSTOM' && (
            <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              Unit
              <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={20} className={`${inputCls} mt-1.5`} />
            </label>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-50">Save</button>
      </div>
    </form>
  );
}
