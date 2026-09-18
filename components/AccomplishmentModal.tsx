import React, { useState } from 'react';
import { X, Target, Check } from 'lucide-react';
import { Task } from '../types';
import ImportanceLightsHeader from './ImportanceLightsHeader';

interface AccomplishmentModalProps {
  task: Task;
  mode: 'complete' | 'review';
  onClose: () => void;
  onSave: (task: Task, text: string, score: string, mode: 'complete' | 'review') => void;
}

export default function AccomplishmentModal({ task, mode, onClose, onSave }: AccomplishmentModalProps) {
  const [text, setText] = useState(
    mode === 'review' 
      ? (task.reflection || '') 
      : (task.presetAccomplishment || (task.microStep ? `Finished: ${task.microStep}` : ''))
  );
  
  const [score, setScore] = useState(
    mode === 'review' 
      ? (task.score ? task.score.replace('%', '') : '100')
      : (task.presetScore || '100')
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e0e0e] border border-white/80 rounded-2xl w-full max-w-lg p-6 sm:p-7 relative shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between pb-3.5 border-b border-neutral-800">
          <h3 className="text-base font-bold text-white tracking-tight font-headline">Task Accomplishment</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center border border-neutral-800 text-neutral-400 hover:text-white hover:border-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        
        <div className="p-4 bg-[#141414] border border-[#262626] rounded-xl flex flex-col">
          <ImportanceLightsHeader level={task.importanceLevel || 4} lightColor={task.lightColor || 'white'} />
          
          {/* BUG FIX: Converted Date object to readable string and cleaned up the old timeRemaining text */}
          <p className="text-xs font-mono text-neutral-400 mb-1">
            Target: {new Date(task.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            {task.completedAt && ` • Logged ${task.completedAt}`}
          </p>

          <h4 className="text-sm font-bold text-white tracking-tight leading-snug">{task.title}</h4>
          {task.microStep && <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed font-sans">{task.microStep}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5 mb-2"><span className="w-1.5 h-1.5 rounded-full bg-white"></span><span>What was accomplished?</span></label>
          <div className="w-full bg-[#141414] border border-[#262626] focus-within:border-white rounded-xl p-3.5 transition-all">
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Document outcome, breakthroughs, key findings or links..." className="w-full bg-transparent text-xs sm:text-sm text-neutral-100 placeholder-neutral-600 outline-none leading-relaxed resize-none font-sans" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-white"></span><span>Expectation Score</span></label>
            <span className="text-xs font-bold font-mono text-white bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">Goal Met: {score ? (score.includes('%') ? score : `${score}%`) : '0%'}</span>
          </div>
          <div className="relative flex items-center bg-[#111111] border border-[#262626] focus-within:border-white rounded-xl transition-all overflow-hidden group">
            <div className="pl-4 pr-2 text-white flex items-center pointer-events-none"><Target className="w-4 h-4" /></div>
            <input type="number" min="0" max="300" value={score} onChange={(e) => setScore(e.target.value)} placeholder="100" className="w-full bg-transparent py-3 px-2 text-white font-headline text-base font-semibold tracking-wide outline-none placeholder-neutral-600" />
            <div className="pr-4 pl-2 flex items-center gap-1.5"><span className="text-xs font-mono font-bold px-2 py-1 rounded-md bg-white text-black select-none">%</span></div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800 mt-1">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent transition-all">Cancel</button>
          <button type="button" onClick={() => onSave(task, text, score, mode)} className="px-6 py-2.5 rounded-full bg-white text-black font-bold text-xs hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2 shadow-sm">
            <Check className="w-4 h-4 text-black stroke-[3]" /><span>Save & Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
