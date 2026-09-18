import React, { useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { Task } from '../types';
import ImportanceLightsHeader from './ImportanceLightsHeader';

interface CriticalLockdownModalProps {
  task: Task;
  onSubmitExcuse: (task: Task, excuse: string) => void;
}

export default function CriticalLockdownModal({ task, onSubmitExcuse }: CriticalLockdownModalProps) {
  const [excuse, setExcuse] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (excuse.trim().length < 10) return; // Force them to write at least a few words!
    onSubmitExcuse(task, excuse);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-red-950/90 backdrop-blur-xl flex items-center justify-center p-4 selection:bg-red-500 selection:text-white animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-black/80 to-black pointer-events-none"></div>
      
      <div className="bg-black border-2 border-red-500/50 rounded-2xl w-full max-w-xl p-8 relative shadow-[0_0_100px_rgba(239,68,68,0.2)] flex flex-col gap-6">
        
        {/* Warning Header */}
        <div className="flex flex-col items-center text-center gap-3 border-b border-red-900/30 pb-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 animate-pulse">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-red-500 font-headline uppercase tracking-widest">Critical Deadline Missed</h2>
            <p className="text-sm text-red-400/80 mt-1">Portal locked. Accountability required to proceed.</p>
          </div>
        </div>

        {/* The Missed Task */}
        <div className="p-5 bg-red-950/20 border border-red-900/50 rounded-xl flex flex-col">
          <ImportanceLightsHeader level={5} lightColor="red" />
          <p className="text-xs font-mono text-red-400/60 mb-1.5 mt-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            {/* BUG FIX: Converted the Date object into a readable string string */}
            Target was: {new Date(task.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </p>
          <h4 className="text-base font-bold text-white tracking-tight leading-snug">{task.title}</h4>
        </div>

        {/* The Mandatory Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-semibold text-red-200 flex items-center gap-2 mb-2">
              <span>Why was this task not completed on time?</span>
            </label>
            <div className="w-full bg-black border border-red-900/50 focus-within:border-red-500 rounded-xl p-3.5 transition-all">
              <textarea
                rows={4}
                required
                value={excuse}
                onChange={(e) => setExcuse(e.target.value)}
                placeholder="Provide a detailed reason. Minimum 10 characters required..."
                className="w-full bg-transparent text-sm text-white placeholder-red-900/50 outline-none leading-relaxed resize-none font-sans"
              />
            </div>
            <p className="text-xs text-red-500/60 mt-2 font-mono text-right">
              {excuse.length < 10 ? `Need ${10 - excuse.length} more characters` : 'Ready to submit'}
            </p>
          </div>

          <button 
            type="submit" 
            disabled={excuse.length < 10}
            className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-neutral-900 disabled:text-neutral-600 disabled:cursor-not-allowed text-white font-bold text-sm transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)]"
          >
            Submit Explanation & Unlock Portal
          </button>
        </form>

      </div>
    </div>
  );
}
