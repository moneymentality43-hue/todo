"use client";

import React, { useState } from 'react';
import { pauseGoal, updatePause } from '../../../app/goals/actions';
import { LONG_TEXT_MAX, MAX_PAUSE_DAYS, MIN_PAUSE_LEAD_MIN, PAUSE_MIN_WORDS, countWords } from '../../../types/validation';
import ModalShell from './ModalShell';

interface PauseGoalDialogProps {
  goalId: string;
  goalName: string;
  mode: 'create' | 'edit';
  currentResumeAt?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm"
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const atNineIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
};

const CHIPS = [
  { label: 'Tomorrow 9:00', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '4 weeks', days: 28 },
];

export default function PauseGoalDialog({ goalId, goalName, mode, currentResumeAt, onClose, onDone, onError }: PauseGoalDialogProps) {
  const [reason, setReason] = useState('');
  const [resumeAt, setResumeAt] = useState(currentResumeAt ? toLocalInput(new Date(currentResumeAt)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Fixed when the dialog opens; the server re-checks the same bounds
  const [{ min, max }] = useState(() => {
    const now = Date.now();
    return {
      min: toLocalInput(new Date(now + MIN_PAUSE_LEAD_MIN * 60_000)),
      max: toLocalInput(new Date(now + MAX_PAUSE_DAYS * 86_400_000)),
    };
  });

  const words = countWords(reason);
  const needReason = mode === 'create';
  const ready = Boolean(resumeAt) && (!needReason || words >= PAUSE_MIN_WORDS);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    const when = new Date(resumeAt);
    if (Number.isNaN(when.getTime()) || resumeAt < min || resumeAt > max) {
      setError(`Choose a time between ${MIN_PAUSE_LEAD_MIN} minutes and ${MAX_PAUSE_DAYS} days from now.`);
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (mode === 'create') {
        const res = await pauseGoal(goalId, { reason, resumeAt: when.toISOString() });
        if (res.ok === false) return onError(res.error);
        const n = res.data.cascadedCount;
        onDone(n > 0 ? `Goal paused · ${n} sub-goal${n === 1 ? '' : 's'} paused too` : 'Goal paused');
      } else {
        const res = await updatePause(goalId, { resumeAt: when.toISOString() });
        if (res.ok === false) return onError(res.error);
        onDone('Resume date updated');
      }
    } catch {
      onError('Could not update the pause.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={mode === 'create' ? `Pause “${goalName}”` : 'Change resume date'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {mode === 'create' && (
          <>
            <p className="text-xs text-neutral-400">Explain why you are pausing. In-progress sub-goals will pause too.</p>
            <textarea
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={LONG_TEXT_MAX}
              rows={5}
              aria-label="Reason for pausing"
              className="w-full bg-[#141414] border border-[#262626] focus:border-white rounded-lg px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-all resize-y"
            />
            <p className={`text-[11px] font-mono ${words >= PAUSE_MIN_WORDS ? 'text-white' : 'text-neutral-500'}`}>{words} / {PAUSE_MIN_WORDS} words</p>
          </>
        )}

        <div className="space-y-2">
          <label className="block text-[11px] font-mono uppercase tracking-wider text-neutral-500" htmlFor="pause-resume-at">Resume on</label>
          <input
            id="pause-resume-at"
            type="datetime-local"
            value={resumeAt}
            min={min}
            max={max}
            onChange={e => setResumeAt(e.target.value)}
            className="bg-black border border-neutral-800 rounded-lg px-2 py-1.5 text-white text-xs font-mono outline-none focus:border-white"
          />
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map(c => (
              <button key={c.days} type="button" onClick={() => setResumeAt(atNineIn(c.days))} className="px-2.5 py-1 rounded-full border border-neutral-800 text-[11px] text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors">
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-500">At most {MAX_PAUSE_DAYS} days. The goal then resumes automatically and needs validating.</p>
        </div>

        {error && <p role="alert" className="text-xs text-neutral-300">{error}</p>}
        <button type="submit" disabled={!ready || busy} className="w-full px-4 py-2.5 rounded-full bg-white text-black text-xs font-semibold disabled:opacity-40 active:scale-95 transition-all">
          {busy ? 'Saving…' : mode === 'create' ? 'Pause goal' : 'Save date'}
        </button>
      </form>
    </ModalShell>
  );
}
