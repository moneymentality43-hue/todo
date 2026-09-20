// app/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';
import { Task } from '../types';
import TaskCard from '../components/TaskCard';
import FocusOverlay from '../components/FocusOverlay';
import AccomplishmentModal from '../components/AccomplishmentModal';
import TaskModal from '../components/TaskModal';
import CriticalLockdownModal from '../components/CriticalLockdownModal';
import AppHeader from '../components/AppHeader'; 
import CompletedTaskList from '../components/CompletedTaskList';
import { playSound } from '../audio'; 
import { getTasks, createTaskAction, updateTaskAction, deleteTaskAction, completeTaskAction, restoreTaskAction } from './actions';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const lastAlertTimes = useRef<Record<string, number>>({});

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

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    const updateTimeAndCheckDeadlines = () => {
      const now = new Date();
      const nowMs = now.getTime();
      setCurrentDateObj(now);
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));

      if (!lockedTask && tasks.length > 0) {
        const expiredTask = tasks.find(t => t.rail === 'urgent' && new Date(t.deadline).getTime() < nowMs);

        if (expiredTask) {
          setLockedTask(expiredTask);
          setActiveFocusTask(null); 
          setAccomplishmentConfig(null);
          setIsTaskModalOpen(false);
          return;
        }

        tasks.forEach(t => {
          if (t.rail !== 'urgent') return;

          const deadlineMs = new Date(t.deadline).getTime();
          const minutesRemaining = (deadlineMs - nowMs) / (1000 * 60);
          const threshold = t.warningThresholdMin ?? 120;
          const isCritical = minutesRemaining <= threshold && minutesRemaining > 0;

          if (isCritical && t.notificationIntervalMin) {
            const lastAlert = lastAlertTimes.current[t.id] || 0;
            const intervalMs = t.notificationIntervalMin * 60 * 1000;

            if (nowMs - lastAlert >= intervalMs) {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`⚠️ SYSTEM WARNING`, { body: `Task "${t.title}" locks down in ${Math.ceil(minutesRemaining)} minutes!` });
              }
              playSound('alert');
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
    if (editingTask) {
      const updated = await updateTaskAction(savedTask.id, savedTask);
      setTasks(tasks.map(t => t.id === updated.id ? (updated as Task) : t));
    } else {
      const created = await createTaskAction(savedTask);
      setTasks([created as Task, ...tasks]);
    }
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTaskAction(taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleSaveAccomplishment = async (task: Task, text: string, score: string, mode: 'complete' | 'review') => {
    const formattedScore = score.includes('%') ? score : `${score}%`;
    if (mode === 'complete') {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const completedTask = await completeTaskAction(task.id, formattedScore, text, nowStr, false);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setCompletedTasks(prev => [completedTask as Task, ...prev]);
    } else {
      const updatedTask = await completeTaskAction(task.id, formattedScore, text, task.completedAt || '', task.score === 'FAILED');
      setCompletedTasks(prev => prev.map(t => t.id === task.id ? (updatedTask as Task) : t));
    }
    setAccomplishmentConfig(null);
  };

  const handleResolveCriticalLockdown = async (task: Task, excuse: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const failedTask = await completeTaskAction(task.id, 'FAILED', `MISSED DEADLINE: ${excuse}`, nowStr, true);
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setCompletedTasks(prev => [failedTask as Task, ...prev]);
    setLockedTask(null);
  };

  const handleRestoreTask = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const restored = await restoreTaskAction(task.id);
    setCompletedTasks(completedTasks.filter(t => t.id !== task.id));
    setTasks([restored as Task, ...tasks]);
  };

  const openCreateModal = (rail: 'urgent' | 'exploration') => {
    setTaskModalRail(rail);
    setEditingTask(null);
    setIsTaskModalOpen(true);
  };

  const urgentTasks = useMemo(() => tasks.filter(t => t.rail === 'urgent'), [tasks]);
  const explorationTasks = useMemo(() => tasks.filter(t => t.rail === 'exploration'), [tasks]);

  if (isLoading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono">Connecting to Database...</div>;
  }

  return (
    <>
      {/* Clean Reusable Header */}
      <AppHeader currentDate={currentDate} currentTime={currentTime} onOpenCreateModal={openCreateModal} />

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
                <TaskCard key={task.id} task={task} currentTime={currentDateObj} onStart={setActiveFocusTask} onComplete={(t) => { setActiveFocusTask(null); setAccomplishmentConfig({ task: t, mode: 'complete' }); }} onEdit={(t, e) => { e.stopPropagation(); setEditingTask(t); setIsTaskModalOpen(true); }} />
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
                <TaskCard key={task.id} task={task} currentTime={currentDateObj} onStart={setActiveFocusTask} onComplete={(t) => { setActiveFocusTask(null); setAccomplishmentConfig({ task: t, mode: 'complete' }); }} onEdit={(t, e) => { e.stopPropagation(); setEditingTask(t); setIsTaskModalOpen(true); }} />
              ))
            )}
          </section>
        </div>

        {/* Clean Reusable Completed Tasks Block */}
        <CompletedTaskList tasks={completedTasks} onReviewTask={(t) => setAccomplishmentConfig({ task: t, mode: 'review' })} onRestoreTask={handleRestoreTask} />
      </main>

      {/* OVERLAYS & MODALS */}
      {lockedTask && <CriticalLockdownModal task={lockedTask} onSubmitExcuse={handleResolveCriticalLockdown} />}
      {!lockedTask && activeFocusTask && <FocusOverlay task={activeFocusTask} onDismiss={() => setActiveFocusTask(null)} onComplete={(t) => { setActiveFocusTask(null); setAccomplishmentConfig({ task: t, mode: 'complete' }); }} />}
      {!lockedTask && accomplishmentConfig && <AccomplishmentModal task={accomplishmentConfig.task} mode={accomplishmentConfig.mode} onClose={() => setAccomplishmentConfig(null)} onSave={handleSaveAccomplishment} />}
      {!lockedTask && <TaskModal isOpen={isTaskModalOpen} onClose={() => { setIsTaskModalOpen(false); setEditingTask(null); }} onSave={handleSaveTask} onDelete={handleDeleteTask} initialTask={editingTask} defaultRail={taskModalRail} />}
    </>
  );
}
