"use client";

import React, { useState } from 'react';
import { createGoalTask } from '../../app/goals/actions';
import type { GoalTaskDTO, MetricType } from '../../types/goals';
import MetricTypePicker from './MetricTypePicker';

interface CreateTaskFormProps {
  goalId?: string | null;
  onCreated: (task: GoalTaskDTO) => void;
  onCancel: () => void;
}

const inputCls = 'w-full bg-[#141414] border border-[#262626] focus:border-white rounded-lg px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-all';
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1.5';

export default function CreateTaskForm({ goalId, onCreated, onCancel }: CreateTaskFormProps) {
  const [title, setTitle] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('COUNT');
  const [target, setTarget] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [unit, setUnit] = useState('');
  const [start, setStart] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const durationTarget = (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);

    if (!title.trim()) return setError('Give the task a name.');

    let targetValue: number | undefined;
    if (metricType === 'DURATION') {
      if (durationTarget < 1) return setError('Set a target of at least 1 minute.');
      targetValue = durationTarget;
    } else if (metricType === 'COUNT' || metricType === 'CUSTOM') {
      targetValue = Number(target);
      if (!target || !(targetValue > 0)) return setError('Set a target greater than 0.');
      if (metricType === 'CUSTOM' && !unit.trim()) return setError('Add a unit, for example pages or km.');
    }

    setSaving(true);
    try {
      const res = await createGoalTask({
        title,
        metricType,
        target: targetValue,
        unit: metricType === 'CUSTOM' ? unit : undefined,
        start: start ? Number(start) : 0,
        goalId: goalId ?? null,
      });
      if (res.ok === false) {
        setError(res.error);
        return;
      }
      onCreated(res.data);
    } catch {
      setError('Could not create the task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-4 sm:p-5 space-y-4">
      <div>
        <label className={labelCls} htmlFor="gt-title">Task name</label>
        <input id="gt-title" autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Pushups" className={inputCls} />
      </div>

      <div>
        <span className={labelCls}>Metric</span>
        <MetricTypePicker value={metricType} onChange={setMetricType} />
      </div>

      {metricType === 'DURATION' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="gt-h">Target hours</label>
            <input id="gt-h" type="number" min={0} inputMode="numeric" value={hours} onChange={e => setHours(e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="gt-m">Target minutes</label>
            <input id="gt-m" type="number" min={0} inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="0" className={inputCls} />
          </div>
        </div>
      )}

      {(metricType === 'COUNT' || metricType === 'CUSTOM') && (
        <div className={`grid gap-3 ${metricType === 'CUSTOM' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className={labelCls} htmlFor="gt-target">Target</label>
            <input id="gt-target" type="number" min={1} step={metricType === 'COUNT' ? 1 : 'any'} inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="50" className={inputCls} />
          </div>
          {metricType === 'CUSTOM' && (
            <div>
              <label className={labelCls} htmlFor="gt-unit">Unit</label>
              <input id="gt-unit" value={unit} onChange={e => setUnit(e.target.value)} maxLength={20} placeholder="pages, km, glasses…" className={inputCls} />
            </div>
          )}
        </div>
      )}

      {metricType !== 'YESNO' && (
        <div>
          <label className={labelCls} htmlFor="gt-start">
            Starting value <span className="normal-case text-neutral-600">(optional{metricType === 'DURATION' ? ', in minutes' : ''})</span>
          </label>
          <input id="gt-start" type="number" min={0} inputMode="decimal" value={start} onChange={e => setStart(e.target.value)} placeholder="0" className={inputCls} />
        </div>
      )}

      {error && <p role="alert" className="text-xs text-neutral-300 border border-neutral-700 rounded-lg px-3 py-2 bg-neutral-900">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-full text-xs text-neutral-400 hover:text-white transition-colors">Cancel</button>
        <button type="submit" disabled={saving} className="px-5 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-50">
          {saving ? 'Creating…' : 'Create task'}
        </button>
      </div>
    </form>
  );
}
