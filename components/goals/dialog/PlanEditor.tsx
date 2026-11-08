"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, Pencil, Trash2, Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import { updatePlan, deletePlan } from '../../../app/goals/actions';
import { useGoals } from '../../../app/goals/GoalsProvider';
import type { GoalPlanDTO } from '../../../types/goals';
import Markdown from '../Markdown';

interface PlanEditorProps {
  plan: GoalPlanDTO;
  onBack: () => void;
  onSaved: (plan: GoalPlanDTO) => void;
  onDeleted: () => void;
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
const AUTOSAVE_MS = 800;

export default function PlanEditor({ plan, onBack, onSaved, onDeleted }: PlanEditorProps) {
  const { notify } = useGoals();

  const [title, setTitle] = useState(plan.title);
  const [body, setBody] = useState(plan.body);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const latest = useRef({ title: plan.title, body: plan.body });
  const savedSnapshot = useRef({ title: plan.title, body: plan.body });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const deleted = useRef(false);

  const save = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const snap = { ...latest.current };
    if (snap.title === savedSnapshot.current.title && snap.body === savedSnapshot.current.body) return chain.current;

    setSaveState('saving');
    chain.current = chain.current.then(async () => {
      if (deleted.current) return;
      try {
        const res = await updatePlan(plan.id, { title: snap.title.trim() ? snap.title : undefined, body: snap.body });
        if (res.ok === false) {
          setSaveState('error');
          notify(res.error);
          return;
        }
        savedSnapshot.current = { title: res.data.title, body: res.data.body };
        onSaved(res.data);
        const stillDirty = latest.current.title !== res.data.title || latest.current.body !== res.data.body;
        setSaveState(stillDirty ? 'dirty' : 'saved');
      } catch {
        setSaveState('error');
      }
    });
    return chain.current;
  }, [notify, onSaved, plan.id]);

  const schedule = () => {
    setSaveState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { save(); }, AUTOSAVE_MS);
  };

  // Flush unsaved edits when the editor closes (back, dialog close, Esc)
  useEffect(() => () => {
    if (!deleted.current) save();
  }, [save]);

  const handleBack = async () => {
    await save();
    onBack();
  };

  const handleDelete = async () => {
    deleted.current = true;
    if (timer.current) clearTimeout(timer.current);
    const res = await deletePlan(plan.id);
    if (res.ok === false) {
      deleted.current = false;
      notify(res.error);
      return;
    }
    notify('Plan deleted');
    onDeleted();
  };

  const status = {
    saved: { icon: Check, text: 'Saved' },
    dirty: { icon: LoaderCircle, text: 'Unsaved changes' },
    saving: { icon: LoaderCircle, text: 'Saving…' },
    error: { icon: TriangleAlert, text: 'Could not save' },
  }[saveState];
  const StatusIcon = status.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> All plans
        </button>
        <span className={`flex items-center gap-1.5 text-[11px] font-mono ${saveState === 'error' ? 'text-white' : 'text-neutral-500'}`} aria-live="polite">
          <StatusIcon className={`w-3 h-3 ${saveState === 'saving' ? 'animate-spin' : ''}`} /> {status.text}
        </span>
      </div>

      <input
        value={title}
        onChange={e => { setTitle(e.target.value); latest.current.title = e.target.value; schedule(); }}
        onBlur={() => { if (!title.trim()) { setTitle(savedSnapshot.current.title); latest.current.title = savedSnapshot.current.title; } }}
        maxLength={120}
        aria-label="Plan title"
        placeholder="Plan title"
        className="w-full bg-transparent border-b border-neutral-800 focus:border-white pb-2 font-headline text-lg font-semibold text-white outline-none transition-colors"
      />

      <div className="flex items-center justify-between">
        <div role="tablist" className="inline-flex p-0.5 rounded-full bg-neutral-950 border border-neutral-800">
          {([['edit', Pencil, 'Edit'], ['preview', Eye, 'Preview']] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                mode === m ? 'bg-white text-black font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-mono text-neutral-600">Markdown supported</span>
      </div>

      {mode === 'edit' ? (
        <textarea
          value={body}
          onChange={e => { setBody(e.target.value); latest.current.body = e.target.value; schedule(); }}
          placeholder={'Write your plan…\n\n# Heading\n- bullet\n**bold**, *italic*, `code`'}
          aria-label="Plan body"
          className="w-full min-h-[260px] resize-y rounded-xl bg-[#101010] border border-[#262626] focus:border-white p-4 text-sm text-neutral-200 placeholder-neutral-700 outline-none font-mono leading-relaxed transition-colors"
        />
      ) : (
        <div className="min-h-[260px] rounded-xl bg-[#101010] border border-[#1f1f1f] p-4">
          <Markdown source={body} />
        </div>
      )}

      {confirmDelete ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-950 p-3">
          <span className="text-xs text-neutral-300">Delete this plan permanently?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white">Cancel</button>
            <button onClick={handleDelete} className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all">Delete</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Delete plan
        </button>
      )}
    </div>
  );
}
