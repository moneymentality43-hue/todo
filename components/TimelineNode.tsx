// components/TimelineNode.tsx
import React, { useState, useTransition } from 'react';
import { Plus, Minus, X, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';

interface Metric {
  id: string;
  name: string;
  val: number;
}

interface TimelineNodeProps {
  id: string;
  dateString: string;
  metrics: Metric[];
  isActive: boolean;
  onSelect: () => void;
  onAddMetric: (id: string, name: string, val: number) => void;
  onUpdateMetric: (metricId: string, newVal: number) => void;
  onDeleteMetric: (metricId: string) => void;
  onDeleteMilestone: (id: string) => void;
}

export default function TimelineNode({ 
  id, dateString, metrics, isActive, onSelect, onAddMetric, onUpdateMetric, onDeleteMetric, onDeleteMilestone 
}: TimelineNodeProps) {
  const [isAddMetricFormOpen, setIsAddMetricFormOpen] = useState(false);
  const [newMetricName, setNewMetricName] = useState('');
  const [newMetricVal, setNewMetricVal] = useState('20');
  
  const [isPending, startTransition] = useTransition();

  const handleAddSubmit = () => {
    const val = newMetricVal.trim() === '' ? 20 : parseInt(newMetricVal, 10);
    const name = newMetricName.trim() || 'Custom Metric';
    
    onAddMetric(id, name, val);
    
    setNewMetricName('');
    setNewMetricVal('20');
    setIsAddMetricFormOpen(false);
  };

  const handleOptimisticUpdate = (metricId: string, newVal: number) => {
    onUpdateMetric(metricId, newVal);
  };

  return (
    <div className="relative flex flex-col group cursor-pointer" onClick={() => { onSelect(); setIsAddMetricFormOpen(false); }}>
      
      {/* Header Row */}
      <div className="flex items-center gap-4 select-none py-1">
        {/* Glowing Active Node */}
        <div className={`-ml-[11px] md:-ml-[13px] w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 z-20 
          ${isActive 
            ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)] scale-110' 
            : 'bg-[#0a0a0a] border-2 border-[#222222] text-neutral-600 group-hover:border-neutral-500 group-hover:text-neutral-300'
          }`}
        >
          {isActive ? <ChevronDown className="w-4 h-4 stroke-[3]" /> : <ChevronRight className="w-4 h-4 stroke-[3]" />}
        </div>
        
        <div className="flex items-center gap-3">
          <span className={`text-sm tracking-wide font-mono transition-colors duration-300 
            ${isActive ? 'font-bold text-white' : 'text-neutral-500 group-hover:text-neutral-300'} 
          `}>
            {dateString}
          </span>
          {/* Subtle Trash Icon */}
          {isActive && (
            <button 
              onClick={(e) => { e.stopPropagation(); onDeleteMilestone(id); }}
              className="w-6 h-6 flex items-center justify-center rounded-full text-neutral-600 hover:text-red-500 hover:bg-red-500/10 transition-colors animate-in fade-in zoom-in duration-200"
              title="Delete Milestone"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active Detail Panel - Smooth sliding animation */}
      {isActive && (
        <div className="flex items-start gap-4 md:gap-6 pt-3 pl-2 md:pl-5 cursor-default animate-in slide-in-from-top-4 fade-in duration-300 fill-mode-both" onClick={e => e.stopPropagation()}>
          
          <div className="flex flex-col gap-4 w-full max-w-xl pb-2 ml-4">
            <div className="flex flex-col gap-3">
              {metrics.length === 0 ? (
                <div className="px-4 py-4 rounded-xl bg-[#141414]/50 border border-[#262626] border-dashed text-neutral-500 text-xs font-mono flex items-center justify-center">
                  NO METRICS RECORDED
                </div>
              ) : (
                metrics.map(metric => (
                  // Hover lifts and Glassmorphism (Background bar removed)
                  <div key={metric.id} className="relative group/card flex items-center justify-between gap-4 bg-[#141414] hover:bg-[#1a1a1a] px-5 py-4 rounded-xl border border-[#262626] hover:border-neutral-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
                    
                    <div className="flex flex-col relative z-10">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-neutral-600 group-hover/card:bg-white transition-colors"></span>
                        Named Metric
                      </span>
                      <span className="text-sm font-semibold text-white tracking-tight">{metric.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-3 relative z-10 bg-[#0a0a0a] p-1 rounded-lg border border-[#222222]">
                      <button 
                        disabled={isPending}
                        onClick={() => handleOptimisticUpdate(metric.id, Math.max(0, metric.val - 1))} 
                        className="w-7 h-7 rounded-md bg-transparent hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex items-baseline gap-1 min-w-[50px] justify-center select-none">
                        <span className="text-lg font-bold text-white tracking-tighter">{metric.val}</span>
                      </div>
                      <button 
                        disabled={isPending}
                        onClick={() => handleOptimisticUpdate(metric.id, metric.val + 1)} 
                        className="w-7 h-7 rounded-md bg-transparent hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <div className="w-[1px] h-4 bg-neutral-800 mx-1"></div>
                      <button onClick={() => onDeleteMetric(metric.id)} className="w-7 h-7 rounded-md text-neutral-600 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Metric Form */}
            <div className="flex flex-col gap-2 pt-1">
              {!isAddMetricFormOpen ? (
                <button onClick={() => setIsAddMetricFormOpen(true)} className="group w-fit flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900/50 hover:bg-white hover:text-black text-neutral-400 font-mono text-xs transition-all border border-neutral-800 border-dashed hover:border-solid hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] active:scale-95">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="font-semibold tracking-wide">ADD METRIC</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-end gap-3 bg-[#111111] p-4 rounded-xl border border-neutral-700 shadow-xl animate-in fade-in slide-in-from-top-2">
                  <div className="flex flex-col flex-1 min-w-[180px]">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold pb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                      Metric Name
                    </label>
                    <input 
                      autoFocus
                      type="text" 
                      value={newMetricName} 
                      onChange={e => setNewMetricName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSubmit(); if (e.key === 'Escape') setIsAddMetricFormOpen(false); }}
                      placeholder="e.g. Focus Hours, Code Output" 
                      className="bg-black border border-neutral-700 rounded-lg px-4 py-2.5 text-xs text-white placeholder-neutral-700 focus:outline-none focus:border-white w-full transition-colors"
                    />
                  </div>
                  <div className="flex flex-col w-24">
                    <label className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold pb-2">Initial (pts)</label>
                    <input 
                      type="number" 
                      value={newMetricVal} 
                      onChange={e => setNewMetricVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSubmit(); }}
                      className="bg-black border border-neutral-700 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-white w-full text-center transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-0.5">
                    <button onClick={handleAddSubmit} className="px-5 py-2.5 rounded-lg bg-white text-black text-xs font-bold hover:bg-neutral-200 active:scale-95 transition-all shadow-sm">Save</button>
                    <button onClick={() => setIsAddMetricFormOpen(false)} className="px-4 py-2.5 rounded-lg text-neutral-400 hover:text-white text-xs font-semibold transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
