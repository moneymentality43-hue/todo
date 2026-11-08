"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Ellipsis, Trash2, X } from 'lucide-react';
import { getGoal, renameGoal, setGoalStatus, deleteGoal } from '../../app/goals/actions';
import { useGoals } from '../../app/goals/GoalsProvider';
import type { GoalDetail, GoalPlanDTO, GoalStatus } from '../../types/goals';
import StatusSelect from './StatusSelect';
import PlansSection from './dialog/PlansSection';
import PlanEditor from './dialog/PlanEditor';
import SubGoalsSection from './dialog/SubGoalsSection';
import TasksSection from './dialog/TasksSection';
import DeleteGoalConfirm from './dialog/DeleteGoalConfirm';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The body is keyed by goal id, so moving to another goal (or closing) resets all local state
export default function GoalDialog() {
  const { activeGoalId } = useGoals();
  if (!activeGoalId) return null;
  return <DialogBody key={activeGoalId} goalId={activeGoalId} />;
}

function DialogBody({ goalId }: { goalId: string }) {
  const { canGoBack, goBack, closeDialog, openGoal, version, refresh, notify } = useGoals();

  const [detail, setDetail] = useState<GoalDetail | null>(null);
  const [missing, setMissing] = useState(false);

  const [nameDraft, setNameDraft] = useState<string | null>(null); // null = not editing
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  // Load, and reload after every shared refresh (version bump)
  useEffect(() => {
    const myRequest = ++requestId.current;
    getGoal(goalId)
      .then(result => {
        if (myRequest !== requestId.current) return;
        if (!result) setMissing(true);
        else setDetail(result);
      })
      .catch(() => {
        if (myRequest === requestId.current) setMissing(true);
      });
  }, [goalId, version]);

  // Focus management and scroll lock while open
  useEffect(() => {
    const returnFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus?.();
    };
  }, []);

  // Esc peels back one layer at a time: confirm -> menu -> plan editor -> dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (confirmDelete) setConfirmDelete(false);
      else if (menuOpen) setMenuOpen(false);
      else if (editingPlanId) setEditingPlanId(null);
      else closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDelete, menuOpen, editingPlanId, closeDialog]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const commitName = async () => {
    if (!detail || nameDraft === null) return;
    const next = nameDraft.trim();
    setNameDraft(null);
    if (!next || next === detail.name) return;

    const res = await renameGoal(detail.id, next);
    if (res.ok === false) return notify(res.error);
    setDetail(d => (d ? { ...d, name: res.data.name } : d));
    await refresh();
  };

  const handleStatus = async (status: GoalStatus) => {
    if (!detail) return;
    const previous = detail.status;
    setDetail({ ...detail, status });
    const res = await setGoalStatus(detail.id, status);
    if (res.ok === false) {
      setDetail(d => (d ? { ...d, status: previous } : d));
      notify(res.error);
      return;
    }
    await refresh();
  };

  const handleDelete = async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      const res = await deleteGoal(detail.id);
      if (res.ok === false) return notify(res.error);
      const { orphanedSubGoals, unattachedTasks } = res.data;
      const parts = [
        orphanedSubGoals ? `${orphanedSubGoals} sub-goal${orphanedSubGoals === 1 ? '' : 's'} now top-level` : '',
        unattachedTasks ? `${unattachedTasks} task${unattachedTasks === 1 ? '' : 's'} unattached` : '',
      ].filter(Boolean);
      notify(parts.length ? `Goal deleted · ${parts.join(', ')}` : 'Goal deleted');
      closeDialog();
      await refresh();
    } catch {
      notify('Could not delete the goal.');
    } finally {
      setDeleting(false);
    }
  };

  const patchPlan = useCallback((plan: GoalPlanDTO) => {
    setDetail(d => (d ? { ...d, plans: d.plans.map(p => (p.id === plan.id ? plan : p)) } : d));
  }, []);

  const handlePlanDeleted = useCallback(() => {
    setEditingPlanId(null);
    refresh();
  }, [refresh]);

  const editingPlan = detail?.plans.find(p => p.id === editingPlanId) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) closeDialog(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `Goal: ${detail.name}` : 'Goal'}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="w-full sm:max-w-3xl h-[94dvh] sm:h-auto sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-[#222222] bg-[#0a0a0a] shadow-2xl outline-none motion-safe:animate-[goal-sheet_0.22s_ease-out]"
      >
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-700 shrink-0" />

        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-[#1a1a1a]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 min-w-0 text-[11px] font-mono text-neutral-500 overflow-x-auto">
              {canGoBack && (
                <button onClick={goBack} aria-label="Back" className="shrink-0 flex items-center gap-1 mr-2 px-2 py-1 rounded-full border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors">
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
              )}
              {detail?.ancestors.map(a => (
                <React.Fragment key={a.id}>
                  <button onClick={() => openGoal(a.id)} className="shrink-0 max-w-[140px] truncate hover:text-white transition-colors">{a.name}</button>
                  <ChevronRight className="w-3 h-3 shrink-0 text-neutral-700" />
                </React.Fragment>
              ))}
              <span className="shrink-0 text-neutral-400">{detail ? 'Goal' : 'Loading…'}</span>
            </div>
            <button onClick={closeDialog} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 flex items-center justify-center transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {detail && (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                value={nameDraft ?? detail.name}
                onFocus={() => setNameDraft(detail.name)}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { e.stopPropagation(); setNameDraft(null); (e.target as HTMLInputElement).blur(); }
                }}
                maxLength={120}
                aria-label="Goal name"
                className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-neutral-800 focus:border-white font-headline text-xl sm:text-2xl font-semibold text-white outline-none transition-colors py-1"
              />
              <div className="flex items-center gap-2 justify-between sm:justify-end">
                <StatusSelect value={detail.status} onChange={handleStatus} />
                <div className="relative">
                  <button onClick={() => setMenuOpen(o => !o)} aria-label="Goal options" aria-expanded={menuOpen} className="w-8 h-8 rounded-full border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 flex items-center justify-center transition-colors">
                    <Ellipsis className="w-4 h-4" />
                  </button>
                  {menuOpen && (
                    <>
                      <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 mt-1 w-44 z-20 rounded-xl bg-[#141414] border border-[#262626] p-1 shadow-xl">
                        <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                          <Trash2 className="w-3.5 h-3.5 text-neutral-500" /> Delete goal
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-8">
          {missing ? (
            <div className="py-16 text-center">
              <p className="text-sm text-neutral-300">This goal no longer exists.</p>
              <button onClick={closeDialog} className="mt-4 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold">Close</button>
            </div>
          ) : !detail ? (
            <div className="space-y-4 animate-pulse" aria-busy="true">
              <div className="h-5 w-1/3 rounded bg-neutral-900" />
              <div className="h-16 rounded-xl bg-neutral-900" />
              <div className="h-5 w-1/4 rounded bg-neutral-900" />
              <div className="h-16 rounded-xl bg-neutral-900" />
            </div>
          ) : (
            <>
              {confirmDelete && (
                <DeleteGoalConfirm
                  goalName={detail.name}
                  subGoals={detail.children.length}
                  tasks={detail.tasks.length}
                  plans={detail.plans.length}
                  busy={deleting}
                  onCancel={() => setConfirmDelete(false)}
                  onConfirm={handleDelete}
                />
              )}

              {editingPlanId ? (
                editingPlan ? (
                  <PlanEditor
                    key={editingPlan.id}
                    plan={editingPlan}
                    onBack={() => setEditingPlanId(null)}
                    onSaved={patchPlan}
                    onDeleted={handlePlanDeleted}
                  />
                ) : (
                  <div className="flex items-center justify-between text-xs font-mono text-neutral-500">
                    Loading plan…
                    <button onClick={() => setEditingPlanId(null)} className="text-neutral-300 hover:text-white">Back to plans</button>
                  </div>
                )
              ) : (
                <>
                  <PlansSection detail={detail} onOpenPlan={setEditingPlanId} />
                  <SubGoalsSection detail={detail} />
                  <TasksSection detail={detail} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
