"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Search } from 'lucide-react';
import AppHeader from '../../components/AppHeader';
import TimelineNode from '../../components/TimelineNode';
import { 
  getMilestones, 
  createMilestoneAction, 
  createMetricAction, 
  updateMetricValAction, 
  deleteMetricAction,
  deleteMilestoneAction // NEW IMPORT
} from '../actions';

type Metric = { id: string; name: string; val: number };
type TimelineEntry = { id: string; dateString: string; metrics: Metric[] };

export default function ProgressPage() {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  
  const [timelineData, setTimelineData] = useState<TimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // States
  const [activeDateId, setActiveDateId] = useState<string | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch real data from Database
  useEffect(() => {
    async function loadData() {
      try {
        const milestones = await getMilestones();
        setTimelineData(milestones);
        if (milestones.length > 0 && !activeDateId) {
          setActiveDateId(milestones[0].id); // Auto-open the newest one
        }
      } catch (error) {
        console.error("Failed to fetch progress data", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // 2. Realtime Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Database Interactions ---

  const handleAddNewDate = async (dateString: string) => {
    try {
      const newMilestone = await createMilestoneAction(dateString);
      setTimelineData(prev => [newMilestone, ...prev]); // Add to top
      setActiveDateId(newMilestone.id);
    } catch (e) {
      console.error("Failed to create milestone", e);
    }
    setIsPopoverOpen(false);
  };

  const handleAddMetric = async (milestoneId: string, name: string, val: number) => {
    try {
      await createMetricAction(milestoneId, name, val);
      // Refresh the specific milestone data (simulated for immediate UI response)
      setTimelineData(prev => prev.map(entry => {
        if (entry.id === milestoneId) {
          return { ...entry, metrics: [...entry.metrics, { id: 'temp_' + Date.now(), name, val }] };
        }
        return entry;
      }));
      // Silently fetch real IDs in background
      const fresh = await getMilestones();
      setTimelineData(fresh);
    } catch (e) {
      console.error("Failed to add metric", e);
    }
  };

  const handleUpdateMetricVal = async (metricId: string, newVal: number) => {
    // 1. OPTIMISTIC UPDATE: Instantly change the UI state without waiting for the server
    setTimelineData(prev => prev.map(entry => ({
      ...entry,
      metrics: entry.metrics.map(m => m.id === metricId ? { ...m, val: newVal } : m)
    })));

    // 2. BACKGROUND SYNC: Quietly fire the server action to update the database
    try {
      await updateMetricValAction(metricId, newVal);
    } catch (e) {
      console.error("Failed to sync metric update with database", e);
      // Optional: You could fetch the real data here again if it failed, to revert the optimistic update
    }
  };

  const handleDeleteMetric = async (metricId: string) => {
    try {
      await deleteMetricAction(metricId);
      setTimelineData(prev => prev.map(entry => ({
        ...entry,
        metrics: entry.metrics.filter(m => m.id !== metricId)
      })));
    } catch (e) {
      console.error("Failed to delete metric", e);
    }
  };

  // NEW DELETION HANDLER FOR MILESTONES
  const handleDeleteMilestone = async (milestoneId: string) => {
    // 1. Optimistically remove it from the UI
    setTimelineData(prev => prev.filter(entry => entry.id !== milestoneId));
    setActiveDateId(null); // Close the active panel since it was just deleted

    // 2. Sync with database
    try {
      await deleteMilestoneAction(milestoneId);
    } catch (e) {
      console.error("Failed to delete milestone", e);
    }
  };

  const formattedToday = `${new Date().getMonth() + 1}/${new Date().getDate()}/${String(new Date().getFullYear()).slice(-2)}`;

  // Filter based on search query
  const filteredTimeline = timelineData.filter(entry => 
    entry.dateString.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.metrics.some(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="bg-black text-white font-sans antialiased min-h-screen selection:bg-white selection:text-black">
      <AppHeader currentDate={currentDate} currentTime={currentTime} />

      <main className="w-full pt-8 pb-16 min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-5xl mx-auto px-6">
          <div className="w-full rounded-2xl bg-[#0a0a0a] p-8 md:p-10 relative border border-[#222222] shadow-2xl">
            
            {/* Header & Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[#222222]">
              <h1 className="font-headline text-2xl text-white tracking-tight font-semibold">Progress Engine</h1>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search milestones..."
                    className="w-full bg-[#141414] border border-[#262626] focus:border-white rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-600 outline-none transition-all font-mono"
                  />
                </div>

                <div className="relative shrink-0">
                  <button 
                    onClick={() => setIsPopoverOpen(!isPopoverOpen)}
                    className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs transition-all border border-neutral-800"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white transition-colors" />
                    <span className="font-semibold hidden sm:inline">Add Date</span>
                  </button>

                  {isPopoverOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#141414] border border-[#262626] p-1.5 shadow-xl z-30 backdrop-blur-sm">
                      <div className="px-2.5 py-1 text-[10px] text-neutral-500 uppercase tracking-wider font-bold">New Milestone</div>
                      <button onClick={() => handleAddNewDate(formattedToday)} className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors flex items-center justify-between font-mono">
                        <span>Today ({formattedToday})</span>
                        <span className="text-[10px] text-neutral-500">AUTO</span>
                      </button>
                      <button onClick={() => {
                        const input = window.prompt("Enter milestone date (MM/DD/YY):", formattedToday);
                        if (input?.trim()) handleAddNewDate(input.trim());
                      }} className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors flex items-center justify-between font-mono">
                        <span>Custom Date...</span>
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline Area */}
            <div className="relative pt-8 pb-8 min-h-[460px]">
              

              <div className="flex flex-col gap-y-10 relative z-10 pl-6 md:pl-8">
                {isLoading ? (
                  <div className="text-xs font-mono text-neutral-500">Syncing telemetry...</div>
                ) : filteredTimeline.length === 0 ? (
                  <div className="text-xs font-mono text-neutral-500">No milestones found. Create one.</div>
                ) : (
                  filteredTimeline.map((entry) => (
                    <TimelineNode 
                      key={entry.id}
                      id={entry.id}
                      dateString={entry.dateString}
                      metrics={entry.metrics}
                      isActive={entry.id === activeDateId}
                      onSelect={() => setActiveDateId(entry.id)}
                      onAddMetric={handleAddMetric}
                      onUpdateMetric={handleUpdateMetricVal}
                      onDeleteMetric={handleDeleteMetric}
                      onDeleteMilestone={handleDeleteMilestone} // WIRED UP PROP HERE
                    />
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
