"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, ChevronDown, ChevronRight, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { Task } from '../types';
import TaskCard from '../components/TaskCard';
import FocusOverlay from '../components/FocusOverlay';
import AccomplishmentModal from '../components/AccomplishmentModal';
import TaskModal from '../components/TaskModal';
import CriticalLockdownModal from '../components/CriticalLockdownModal';
import { playSound } from '../audio'; // Added sound import

import { 
  getTasks, createTaskAction, updateTaskAction, 
  deleteTaskAction, completeTaskAction, restoreTaskAction 
} from './actions';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(true);

  // States for Overlays & Modals
  const [activeFocusTask, setActiveFocusTask] = useState<Task | null>(null);
  const [accomplishmentConfig, setAccomplishmentConfig] = useState<{task: Task, mode: 'complete'|'review'} | null>(null);
  const [lockedTask, setLockedTask] = useState<Task | null>(null);
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalRail, setTaskModalRail] = useState<'urgent' | 'exploration'>('urgent');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Realtime Clock
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [currentDateObj, setCurrentDateObj] = useState(new Date());

  // NEW: Tracking when we last sent a notification so we don't spam
  const lastAlertTimes = useRef<Record<string, number>>({});

  // 1. Fetch REAL tasks and ask for Notification Permission
  useEffect(() => {
    async function loadData() {
      try {
        const allTasks = await getTasks();
        setTasks(allTasks.filter(t => t.status === 'ACTIVE') as Task[]);
        setCompletedTasks(allTasks.filter(t => t.status !== 'ACTIVE') as Task[]);
      } catch (error) {
        console.error("Database connection failed:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();

    // Request browser notification permission on load
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  // 2. Real-time Clock, Lockdown Checker, AND Harassment Protocol (Notifications)
  useEffect(() => {
    const updateTimeAndCheckDeadlines = () => {
      const now = new Date();
      const nowMs = now.getTime();
      setCurrentDateObj(now);
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));

      if (!lockedTask && tasks.length > 0) {
        // Find if any task has breached the deadline (Lockdown)
        const expiredTask = tasks.find(t => t.rail === 'urgent' && new Date(t.deadline).getTime() < nowMs);

        if (expiredTask) {
          setLockedTask(expiredTask);
          setActiveFocusTask(null); 
          setAccomplishmentConfig(null);
          setIsTaskModalOpen(false);
          return; // Stop processing other alerts if we are locked down
        }

        // Check for Red Laser Notifications
        tasks.forEach(t => {
          if (t.rail !== 'urgent') return;

          const deadlineMs = new Date(t.deadline).getTime();
          const minutesRemaining = (deadlineMs - nowMs) / (1000 * 60);
          const threshold = t.warningThresholdMin ?? 120;

          const isCritical = minutesRemaining <= threshold && minutesRemaining > 0;

          // If task is in the Red Laser zone AND has a notification interval set
          if (isCritical && t.notificationIntervalMin) {
            const lastAlert = lastAlertTimes.current[t.id] || 0;
            const intervalMs = t.notificationIntervalMin * 60 * 1000;

            // If we've never alerted, or the interval has passed since the last alert
            if (nowMs - lastAlert >= intervalMs) {
              // FIRE NOTIFICATION!
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`⚠️ SYSTEM WARNING`, {
                  body: `Task "${t.title}" locks down in ${Math.ceil(minutesRemaining)} minutes!`,
                });
              }
              // TRIGGER THE SYNTHETIC ALERT SOUND
              playSound('alert');
              
              // Record the exact time we sent this alert
              lastAlertTimes.current[t.id] = nowMs;
            }
          }
        });
      }
    };
    
    updateTimeAndCheckDeadlines();
    const interval = setInterval(updateTimeAndCheckDeadlines, 1000);
    return () => clearInterval(interval);
  }, [tasks, lockedTask]);

  // --- Database Handlers ---
  const handleSaveTask = async (savedTask: Task) => {
    try {
      if (editingTask) {
        const updated = await updateTaskAction(savedTask.id, savedTask);
        setTasks(tasks.map(t => t.id === updated.id ? (updated as Task) : t));
      } else {
        const created = await createTaskAction(savedTask);
        setTasks([created as Task, ...tasks]);
      }
    } catch (e) {
      console.error("Failed to save task to DB", e);
    }
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTaskAction(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (e) {
      console.error("Failed to delete task", e);
    }
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleSaveAccomplishment = async (task: Task, text: string, score: string, mode: 'complete' | 'review') => {
    const formattedScore = score.includes('%') ? score : `${score}%`;
    try {
      if (mode === 'complete') {
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const completedTask = await completeTaskAction(task.id, formattedScore, text, nowStr, false);
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setCompletedTasks(prev => [completedTask as Task, ...prev]);
      } else {
        const updatedTask = await completeTaskAction(task.id, formattedScore, text, task.completedAt || '', task.score === 'FAILED');
        setCompletedTasks(prev => prev.map(t => t.id === task.id ? (updatedTask as Task) : t));
      }
    } catch (e) {
      console.error("Failed to save accomplishment", e);
    }
    setAccomplishmentConfig(null);
  };

  const handleResolveCriticalLockdown = async (task: Task, excuse: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    try {
      const failedTask = await completeTaskAction(task.id, 'FAILED', `MISSED DEADLINE: ${excuse}`, nowStr, true);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setCompletedTasks(prev => [failedTask as Task, ...prev]);
    } catch (e) {
      console.error("Failed to resolve lockdown", e);
    }
    setLockedTask(null);
  };

  const handleRestoreTask = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const restored = await restoreTaskAction(task.id);
      setCompletedTasks(completedTasks.filter(t => t.id !== task.id));
      setTasks([restored as Task, ...tasks]);
    } catch (err) {
      console.error("Failed to restore task", err);
    }
  };

  const handleTriggerComplete = (task: Task, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveFocusTask(null); 
    setAccomplishmentConfig({ task, mode: 'complete' });
  };

  const openCreateModal = (rail: 'urgent' | 'exploration') => {
    setTaskModalRail(rail);
    setEditingTask(null);
    setIsTaskModalOpen(true);
  };

  const openEditModal = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const urgentTasks = useMemo(() => tasks.filter(t => t.rail === 'urgent'), [tasks]);
  const explorationTasks = useMemo(() => tasks.filter(t => t.rail === 'exploration'), [tasks]);

  if (isLoading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono">Connecting to Database...</div>;
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[#222222] bg-black/95 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center relative">
              <span className="w-2.5 h-2.5 rounded-full bg-white inline-block"></span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight leading-none font-headline">GOF</h1>
              <p className="text-xs text-neutral-400 mt-1 font-mono">{currentDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-950 border border-neutral-800 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              <span className="text-white font-semibold">Optimal</span>
              <span className="text-neutral-600">•</span>
              <span className="text-neutral-300 font-mono tabular-nums">{currentTime}</span>
            </div>
            <button onClick={() => openCreateModal('urgent')} className="w-8 h-8 rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center font-bold">
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <section className="flex flex-col gap-4">
            {urgentTasks.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-neutral-800/40 bg-neutral-950/60 text-center">
                <p className="text-sm text-neutral-400">No tasks remaining</p>
                <button onClick={() => openCreateModal('urgent')} className="mt-3 text-xs font-semibold text-white hover:underline inline-flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /><span>Add Task</span>
                </button>
              </div>
            ) : (
              urgentTasks.map((task) => (
                <TaskCard key={task.id} task={task} currentTime={currentDateObj} onStart={setActiveFocusTask} onComplete={handleTriggerComplete} onEdit={openEditModal} />
              ))
            )}
          </section>

          <section className="flex flex-col gap-4">
            {explorationTasks.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-neutral-800/40 bg-neutral-950/60 text-center">
                <p className="text-sm text-neutral-400">No tasks active</p>
                <button onClick={() => openCreateModal('exploration')} className="mt-3 text-xs font-semibold text-white hover:underline inline-flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /><span>Add Task</span>
                </button>
              </div>
            ) : (
              explorationTasks.map((task) => (
                <TaskCard key={task.id} task={task} currentTime={currentDateObj} onStart={setActiveFocusTask} onComplete={handleTriggerComplete} onEdit={openEditModal} />
              ))
            )}
          </section>
        </div>

        <section className="mt-4 pt-6 border-t border-neutral-800/40">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setIsCompletedExpanded(!isCompletedExpanded)} className="flex items-center gap-2 text-neutral-300 hover:text-white transition-colors text-sm font-semibold">
              {isCompletedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span className="text-white font-headline">Completed</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-900/80 text-neutral-400 border border-neutral-800/50 font-mono">{completedTasks.length}</span>
            </button>
          </div>

          {isCompletedExpanded && (
            <div className="space-y-2.5">
              {completedTasks.length === 0 ? (
                <div className="py-6 px-4 rounded-2xl border border-dashed border-neutral-850/40 text-center text-xs text-neutral-500 bg-neutral-950/40">
                  No completed tasks yet.
                </div>
              ) : (
                completedTasks.map((task) => {
                  const isFailed = task.score === 'FAILED';
                  return (
                    <div key={task.id} onClick={() => setAccomplishmentConfig({ task, mode: 'review' })} className={`group flex items-center justify-between p-3.5 px-4 rounded-xl hover:bg-neutral-900/80 border cursor-pointer ${isFailed ? 'bg-red-950/20 border-red-900/50' : 'bg-neutral-950/70 border-neutral-800/40'}`}>
                      <div className="flex items-center gap-3.5 min-w-0 w-full pr-4">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isFailed ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
                          {isFailed ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </div>
                        
                        {/* FIX: We added overflow-hidden and truncate to this text container so it respects mobile boundaries! */}
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className={`text-sm font-medium truncate ${isFailed ? 'text-red-200' : 'text-neutral-200'}`}>{task.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-500">
                            <span className="font-mono shrink-0">Finished {task.completedAt}</span>
                            {task.score && <><span className="text-neutral-600 shrink-0">•</span><span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded shrink-0 ${isFailed ? 'bg-red-500 text-white' : 'text-black bg-white'}`}>{task.score}</span></>}
                            {/* FIX: truncate forces the text to drop to '...' when it hits the edge of the phone screen */}
                            {task.reflection && <><span className="text-neutral-600 shrink-0">•</span><span className="text-neutral-400 italic truncate min-w-0">"{task.reflection}"</span></>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={(e) => handleRestoreTask(task, e)} className="text-xs text-neutral-400 hover:text-white px-3 py-1 rounded-full border border-neutral-800/40 flex items-center gap-1.5">
                          <RotateCcw className="w-3 h-3" /> Restore
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </section>
      </main>

      {/* OVERLAYS & MODALS */}
      {lockedTask && (
        <CriticalLockdownModal task={lockedTask} onSubmitExcuse={handleResolveCriticalLockdown} />
      )}

      {!lockedTask && activeFocusTask && (
        <FocusOverlay task={activeFocusTask} onDismiss={() => setActiveFocusTask(null)} onComplete={handleTriggerComplete} />
      )}

      {!lockedTask && accomplishmentConfig && (
        <AccomplishmentModal task={accomplishmentConfig.task} mode={accomplishmentConfig.mode} onClose={() => setAccomplishmentConfig(null)} onSave={handleSaveAccomplishment} />
      )}

      {!lockedTask && (
        <TaskModal isOpen={isTaskModalOpen} onClose={() => { setIsTaskModalOpen(false); setEditingTask(null); }} onSave={handleSaveTask} onDelete={handleDeleteTask} initialTask={editingTask} defaultRail={taskModalRail} />
      )}
    </>
  );
}
