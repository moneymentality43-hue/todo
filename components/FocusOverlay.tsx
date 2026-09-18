import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { Task } from '../types';

interface FocusOverlayProps {
  task: Task;
  onDismiss: () => void;
  onComplete: (task: Task) => void;
}

export default function FocusOverlay({ task, onDismiss, onComplete }: FocusOverlayProps) {
  const [focusSeconds, setFocusSeconds] = useState(120);
  const [isFocusRunning, setIsFocusRunning] = useState(true);
  const [focusPhase, setFocusPhase] = useState<'2min' | 'deep'>('2min');
  const [deepSeconds, setDeepSeconds] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFocusRunning) {
      timer = setInterval(() => {
        if (focusPhase === '2min') {
          setFocusSeconds((prev) => {
            if (prev <= 1) {
              setFocusPhase('deep');
              return 0;
            }
            return prev - 1;
          });
        } else {
          setDeepSeconds((prev) => prev + 1);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isFocusRunning, focusPhase]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-lg flex flex-col items-center justify-between p-6 md:p-12 select-none">
      <div className="w-full max-w-xl flex items-center justify-between text-xs text-neutral-400 border-b border-neutral-850 pb-3.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span className="font-semibold text-white font-headline">Focus Session</span>
        </div>
        <button onClick={onDismiss} className="px-3.5 py-1.5 rounded-full border border-neutral-700 hover:border-white text-neutral-300 hover:text-white text-xs font-medium">
          Dismiss
        </button>
      </div>
      
      <div className="max-w-md w-full flex flex-col items-center text-center my-auto">
        <span className="text-xs font-semibold text-neutral-400 mb-2 font-mono">
          {focusPhase === '2min' ? '2-Minute Starter' : 'Deep Flow Session'}
        </span>
        <div className="relative w-52 h-52 flex items-center justify-center my-5">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" className="text-neutral-800" strokeWidth="2.5" stroke="currentColor" fill="transparent" />
            <circle 
              cx="50" cy="50" r="44" className="text-white" strokeWidth="3.5" strokeLinecap="round" 
              strokeDasharray={276.46} 
              strokeDashoffset={focusPhase === '2min' ? 276.46 - (focusSeconds / 120) * 276.46 : 0} 
              stroke="currentColor" fill="transparent" 
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-4xl font-bold text-white tracking-tight tabular-nums font-headline">
              {focusPhase === '2min' 
                ? `${Math.floor(focusSeconds / 60)}:${String(focusSeconds % 60).padStart(2, '0')}`
                : `${Math.floor(deepSeconds / 60)}:${String(deepSeconds % 60).padStart(2, '0')}`
              }
            </span>
            <span className="text-xs text-neutral-400 mt-1 font-mono">
              {focusPhase === '2min' ? 'Initial step' : 'Elapsed'}
            </span>
          </div>
        </div>
        
        <div className="mt-3 p-5 rounded-2xl bg-neutral-950 border border-neutral-800 text-center w-full">
          <span className="text-xs font-semibold block mb-1 text-white font-mono">Initial step</span>
          <p className="text-sm font-semibold text-white">"{task.microStep || task.title}"</p>
          <p className="text-xs text-neutral-400 mt-2">{task.title}</p>
        </div>
      </div>
      
      <div className="w-full max-w-sm flex items-center justify-center gap-3">
        {focusPhase === '2min' ? (
          <button onClick={() => setFocusPhase('deep')} className="px-5 py-2.5 rounded-full border border-neutral-700 hover:border-white text-white text-xs font-medium transition-all font-mono">
            Enter Deep Flow
          </button>
        ) : (
          <button onClick={() => setIsFocusRunning(!isFocusRunning)} className="px-5 py-2.5 rounded-full border border-neutral-700 hover:border-white text-white text-xs font-medium transition-all font-mono">
            {isFocusRunning ? 'Pause' : 'Resume'}
          </button>
        )}
        {/* THIS FIXES THE BUG: We call onComplete which will unmount this overlay instantly */ }
        <button onClick={() => onComplete(task)} className="px-5 py-2.5 rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 font-semibold text-xs flex items-center gap-1.5 transition-all">
          <CheckCircle className="w-4 h-4 text-black" /><span>Mark Finished</span>
        </button>
      </div>
    </div>
  );
}
