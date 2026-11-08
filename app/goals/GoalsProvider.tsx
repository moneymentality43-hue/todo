"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getGoalsOverview, getTaskLogs } from './actions';
import type { GoalSummary, GoalTaskDTO, TaskLogDTO } from '../../types/goals';

export type GoalsTab = 'goals' | 'tasks' | 'graph';
const TABS: GoalsTab[] = ['goals', 'tasks', 'graph'];
const LOG_WINDOW_DAYS = 120;

interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface GoalsContextValue {
  goals: GoalSummary[];
  tasks: GoalTaskDTO[];
  loading: boolean;
  loadError: string | null;
  version: number; // bumps after every refresh so views (graph, dialog) refetch
  refresh: () => Promise<void>;

  tab: GoalsTab;
  setTab: (tab: GoalsTab) => void;

  activeGoalId: string | null;
  canGoBack: boolean;
  openGoal: (id: string, mode?: 'root' | 'push') => void;
  goBack: () => void;
  closeDialog: () => void;

  patchTask: (task: GoalTaskDTO) => void;
  removeTask: (id: string) => void;

  logs: Record<string, TaskLogDTO[]>;
  requestLogs: (ids: string[]) => void;
  addLog: (log: TaskLogDTO) => void;
  popLog: (taskId: string) => void;

  notify: (message: string, options?: { actionLabel?: string; onAction?: () => void }) => void;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

export function useGoals() {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error('useGoals must be used inside GoalsProvider');
  return ctx;
}

export default function GoalsProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();

  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [tasks, setTasks] = useState<GoalTaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Tab and open goal are initialised from the URL once, then mirrored back to it
  const [tab, setTabState] = useState<GoalsTab>(() => {
    const t = searchParams.get('tab');
    return TABS.includes(t as GoalsTab) ? (t as GoalsTab) : 'goals';
  });
  const [stack, setStack] = useState<string[]>(() => {
    const g = searchParams.get('goal');
    return g ? [g] : [];
  });

  const [logs, setLogs] = useState<Record<string, TaskLogDTO[]>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toastId = useRef(0);
  const hasLoaded = useRef(false);
  const requestedLogs = useRef<Set<string>>(new Set());
  const queuedLogIds = useRef<Set<string>>(new Set());
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { goals: g, tasks: t } = await getGoalsOverview();
      setGoals(g);
      setTasks(t);
      setLoadError(null);
      // The first load must not bump the version, otherwise an open dialog would fetch its goal twice
      if (hasLoaded.current) setVersion(v => v + 1);
      hasLoaded.current = true;
    } catch (e) {
      console.error('Failed to load goals', e);
      setLoadError('Could not load your goals. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount; refresh() only sets state after its awaited requests resolve
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const activeGoalId = stack.length > 0 ? stack[stack.length - 1] : null;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === 'goals') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    if (activeGoalId) url.searchParams.set('goal', activeGoalId);
    else url.searchParams.delete('goal');
    const next = url.pathname + url.search;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', next);
    }
  }, [tab, activeGoalId]);

  const setTab = useCallback((t: GoalsTab) => setTabState(t), []);

  const openGoal = useCallback((id: string, mode: 'root' | 'push' = 'root') => {
    setStack(prev => (mode === 'push' && prev.length > 0 ? [...prev, id] : [id]));
  }, []);
  const goBack = useCallback(() => setStack(prev => prev.slice(0, -1)), []);
  const closeDialog = useCallback(() => setStack([]), []);

  const patchTask = useCallback((task: GoalTaskDTO) => {
    setTasks(prev => (prev.some(t => t.id === task.id) ? prev.map(t => (t.id === task.id ? task : t)) : [task, ...prev]));
  }, []);
  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  // Cards ask for their own logs; requests made in the same tick are fetched in one call
  const requestLogs = useCallback((ids: string[]) => {
    for (const id of ids) {
      if (!requestedLogs.current.has(id)) {
        requestedLogs.current.add(id);
        queuedLogIds.current.add(id);
      }
    }
    if (queuedLogIds.current.size === 0 || logTimer.current) return;

    logTimer.current = setTimeout(async () => {
      logTimer.current = null;
      const batch = [...queuedLogIds.current];
      queuedLogIds.current.clear();
      try {
        const since = new Date(Date.now() - LOG_WINDOW_DAYS * 86_400_000).toISOString();
        const rows = await getTaskLogs(batch, since);
        setLogs(prev => {
          const next = { ...prev };
          for (const id of batch) next[id] = [];
          for (const row of rows) next[row.goalTaskId] = [...(next[row.goalTaskId] ?? []), row];
          return next;
        });
      } catch (e) {
        console.error('Failed to load task history', e);
        batch.forEach(id => requestedLogs.current.delete(id));
      }
    }, 20);
  }, []);

  const addLog = useCallback((log: TaskLogDTO) => {
    setLogs(prev => ({ ...prev, [log.goalTaskId]: [...(prev[log.goalTaskId] ?? []), log] }));
  }, []);
  const popLog = useCallback((taskId: string) => {
    setLogs(prev => ({ ...prev, [taskId]: (prev[taskId] ?? []).slice(0, -1) }));
  }, []);

  const notify = useCallback((message: string, options?: { actionLabel?: string; onAction?: () => void }) => {
    const id = ++toastId.current;
    setToasts(prev => [...prev.slice(-2), { id, message, ...options }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), options?.onAction ? 6000 : 3500);
  }, []);

  const value = useMemo<GoalsContextValue>(() => ({
    goals, tasks, loading, loadError, version, refresh,
    tab, setTab,
    activeGoalId, canGoBack: stack.length > 1, openGoal, goBack, closeDialog,
    patchTask, removeTask,
    logs, requestLogs, addLog, popLog,
    notify,
  }), [goals, tasks, loading, loadError, version, refresh, tab, setTab, activeGoalId, stack.length, openGoal, goBack, closeDialog, patchTask, removeTask, logs, requestLogs, addLog, popLog, notify]);

  return (
    <GoalsContext.Provider value={value}>
      {children}

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none w-[calc(100%-2rem)] max-w-sm" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-full bg-white text-black pl-4 pr-2 py-2 text-xs font-medium shadow-2xl motion-safe:animate-[goal-toast_0.2s_ease-out]">
            <span className="flex-1">{t.message}</span>
            {t.onAction && (
              <button
                onClick={() => { t.onAction?.(); setToasts(prev => prev.filter(x => x.id !== t.id)); }}
                className="px-3 py-1 rounded-full bg-black text-white font-semibold hover:bg-neutral-800 transition-colors"
              >
                {t.actionLabel ?? 'Undo'}
              </button>
            )}
          </div>
        ))}
      </div>
    </GoalsContext.Provider>
  );
}
