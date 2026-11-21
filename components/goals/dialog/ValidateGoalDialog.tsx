"use client";

import React, { useState } from 'react';
import { validateGoal } from '../../../app/goals/actions';
import { LONG_TEXT_MAX, VALIDATION_MIN_WORDS, countWords } from '../../../types/validation';
import ModalShell from './ModalShell';

interface ValidateGoalDialogProps {
  goalId: string;
  goalName: string;
  ancestors: { id: string; name: string }[]; // root first
  onClose: () => void;
  onValidated: (validatedCount: number) => void;
  onError: (message: string) => void;
}

export default function ValidateGoalDialog({ goalId, goalName, ancestors, onClose, onValidated, onError }: ValidateGoalDialogProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const words = countWords(text);
  const enough = words >= VALIDATION_MIN_WORDS;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enough || busy) return;
    setBusy(true);
    try {
      const res = await validateGoal(goalId, text);
      if (res.ok === false) return onError(res.error);
      onValidated(res.data.validatedCount);
    } catch {
      onError('Could not validate the goal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Validate “${goalName}”`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-neutral-400">
          Reflect on this goal: what moved forward, what is blocking you, and what comes next.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={LONG_TEXT_MAX}
          rows={8}
          aria-label="Validation text"
          className="w-full bg-[#141414] border border-[#262626] focus:border-white rounded-lg px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-all resize-y"
        />
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className={enough ? 'text-white' : 'text-neutral-500'}>{words} / {VALIDATION_MIN_WORDS} words</span>
          {ancestors.length > 0 && (
            <span className="text-neutral-500 truncate ml-3">Also validates: {[...ancestors].reverse().map(a => a.name).join(' › ')}</span>
          )}
        </div>
        <button type="submit" disabled={!enough || busy} className="w-full px-4 py-2.5 rounded-full bg-white text-black text-xs font-semibold disabled:opacity-40 active:scale-95 transition-all">
          {busy ? 'Validating…' : 'Validate'}
        </button>
      </form>
    </ModalShell>
  );
}
