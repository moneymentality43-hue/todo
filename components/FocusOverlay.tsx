import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import { Task } from '../types';

interface FocusOverlayProps {
  task: Task;
  onDismiss: () => void;
  onComplete: (task: Task) => void;
}

export default function FocusOverlay({ task, onDismiss, onComplete }: FocusOverlayProps) {
  const [focusPhase, setFocusPhase] = useState<'2min' | 'deep'>('2min');
  const [isFocusRunning, setIsFocusRunning] = useState(true);
  
  // UI Display states
  const [displaySeconds, setDisplaySeconds] = useState(120);

  // ABSOLUTE TIME TRACKING
  const startTimeRef = useRef<number>(Date.now());
  const totalPausedTimeRef = useRef<number>(0);
  const pauseStartRef = useRef<number | null>(null);

  // Handle phase switching manually (when user clicks "Enter Deep Flow")
  const switchToDeepFlow = () => {
    setFocusPhase('deep');
    startTimeRef.current = Date.now(); // Reset the absolute clock for the new phase
    totalPausedTimeRef.current = 0;
    pauseStartRef.current = null;
    setDisplaySeconds(0);
  };

  // Handle Pause/Resume
  const togglePause = () => {
    if (isFocusRunning) {
      // We are pausing. Record exactly when we paused.
      pauseStartRef.current = Date.now();
    } else {
      // We are resuming. Add the time spent paused to our total paused tally.
      if (pauseStartRef.current) {
        totalPausedTimeRef.current += (Date.now() - pauseStartRef.current);
        pauseStartRef.current = null;
      }
    }
    setIsFocusRunning(!isFocusRunning);
  };

  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      if (isFocusRunning) {
        const now = Date.now();
        // Calculate exact elapsed time: (Now - Start) minus (Time spent paused)
        const elapsedMs = now - startTimeRef.current - totalPausedTimeRef.current;
        const elapsedSecs = Math.floor(elapsedMs / 1000);

        if (focusPhase === '2min') {
          const remaining = Math.max(0, 120 - elapsedSecs);
          setDisplaySeconds(remaining);
          
          if (remaining === 0) {
            switchToDeepFlow(); // Auto-switch when 2 minutes are up
          }
        } else {
          setDisplaySeconds(elapsedSecs);
        }
      }
      // Request next frame (runs at ~60fps while tab is active, throttles gracefully when hidden but math stays accurate!)
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
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
              strokeDashoffset={focusPhase === '2min' ? 276.46 - (displaySeconds / 120) * 276.46 : 0} 
              stroke="currentColor" fill="transparent" 
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-4xl font-bold text-white tracking-tight tabular-nums font-headline">
              {`${Math.floor(displaySeconds / 60)}:${String(displaySeconds % 60).padStart(2, '0')}`}
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
          <button onClick={switchToDeepFlow} className="px-5 py-2.5 rounded-full border border-neutral-700 hover:border-white text-white text-xs font-medium transition-all font-mono">
            Enter Deep Flow
          </button>
        ) : (
          <button onClick={togglePause} className="px-5 py-2.5 rounded-full border border-neutral-700 hover:border-white text-white text-xs font-medium transition-all font-mono">
            {isFocusRunning ? 'Pause' : 'Resume'}
          </button>
        )}
        <button onClick={() => onComplete(task)} className="px-5 py-2.5 rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 font-semibold text-xs flex items-center gap-1.5 transition-all">
          <CheckCircle className="w-4 h-4 text-black" /><span>Mark Finished</span>
        </button>
      </div>
    </div>
  );
}
