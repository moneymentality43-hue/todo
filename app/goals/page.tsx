"use client";

import React, { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Network, Target, ListChecks } from 'lucide-react';
import AppHeader from '../../components/AppHeader';
import GoalDialog from '../../components/goals/GoalDialog';
import GoalsTab from '../../components/goals/GoalsTab';
import TasksTab from '../../components/goals/TasksTab';
import GoalsProvider, { useGoals, type GoalsTab as TabId } from './GoalsProvider';

// React Flow measures the DOM, so it only renders in the browser
const GraphTab = dynamic(() => import('../../components/goals/GraphTab'), {
  ssr: false,
  loading: () => <div className="h-[62vh] min-h-[380px] rounded-2xl border border-[#222222] animate-pulse bg-neutral-950" />,
});

const TAB_META: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'graph', label: 'Graph', icon: Network },
];

function GoalsView() {
  const { tab, setTab, goals, tasks, loadError, refresh } = useGoals();

  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const counts: Record<TabId, number | null> = { goals: goals.length, tasks: tasks.length, graph: null };

  return (
    <div className="bg-black text-white font-sans antialiased min-h-screen selection:bg-white selection:text-black">
      <AppHeader currentDate={currentDate} currentTime={currentTime} />

      <main className="w-full pt-6 md:pt-8 pb-16 min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6">
          <div className="w-full rounded-2xl bg-[#0a0a0a] p-4 sm:p-6 md:p-8 relative border border-[#222222] shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#222222]">
              <h1 className="font-headline text-2xl text-white tracking-tight font-semibold">Goals</h1>

              <div role="tablist" aria-label="Goal views" className="flex p-1 rounded-full bg-neutral-950 border border-neutral-800 gap-1">
                {TAB_META.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                      tab === id ? 'bg-white text-black font-semibold shadow-sm' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                    {counts[id] !== null && <span className={`font-mono text-[10px] ${tab === id ? 'text-neutral-600' : 'text-neutral-600'}`}>{counts[id]}</span>}
                  </button>
                ))}
              </div>
            </div>

            {loadError && (
              <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs text-neutral-300">
                {loadError}
                <button onClick={refresh} className="px-3 py-1.5 rounded-full bg-white text-black font-semibold hover:bg-neutral-200 active:scale-95 transition-all">Retry</button>
              </div>
            )}

            <div className="pt-6" role="tabpanel">
              {tab === 'goals' && <GoalsTab />}
              {tab === 'tasks' && <TasksTab />}
              {tab === 'graph' && <GraphTab />}
            </div>
          </div>
        </div>
      </main>

      <GoalDialog />
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <GoalsProvider>
        <GoalsView />
      </GoalsProvider>
    </Suspense>
  );
}
