import React from 'react';
import { Check, Pencil } from 'lucide-react';
import { Task } from '../types';
import ImportanceLightsHeader from './ImportanceLightsHeader';
import { playSound } from '../audio'; // Added sound import

interface TaskCardProps {
  task: Task;
  currentTime: Date; // Passed down from page to trigger re-renders
  onStart: (task: Task) => void;
  onComplete: (task: Task, e: React.MouseEvent) => void;
  onEdit: (task: Task, e: React.MouseEvent) => void;
}

export default function TaskCard({ task, currentTime, onStart, onComplete, onEdit }: TaskCardProps) {
  const deadlineDate = new Date(task.deadline);
  const timeDiffMs = deadlineDate.getTime() - currentTime.getTime();
  
  // Calculate remaining time string
  let remainingText = '';
  const hoursLeft = Math.floor(timeDiffMs / (1000 * 60 * 60));
  const minutesLeft = Math.floor((timeDiffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (timeDiffMs < 0) {
    remainingText = 'OVERDUE';
  } else if (hoursLeft > 24) {
    const days = Math.floor(hoursLeft / 24);
    remainingText = `${days} day${days > 1 ? 's' : ''} left`;
  } else if (hoursLeft > 0) {
    remainingText = `${hoursLeft}h ${minutesLeft}m left`;
  } else {
    remainingText = `${minutesLeft}m left`;
  }

  // BUG FIX: Use custom threshold instead of hardcoded 2 hours
  const thresholdMin = task.warningThresholdMin ?? 120;
  const thresholdMs = thresholdMin * 60 * 1000;

  // SMART LOGIC: If it's a mandatory task AND time left is below the CUSTOM threshold, FORCE CRITICAL RED STATE
  const isDanger = task.rail === 'urgent' && timeDiffMs <= thresholdMs && timeDiffMs > 0;

  // Override visuals if in danger
  const finalLevel = isDanger ? 5 : task.importanceLevel;
  // FIX: Added TS cast to prevent strict-type error
  const finalLightColor = (isDanger ? 'red' : task.lightColor) as 'white' | 'red' | 'amber' | 'yellow';
  
  const borderClasses = isDanger 
    ? 'border-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.4)]'
    : 'border-[#262626] hover:border-neutral-400';

  // NEW: Handler to play focus sound before starting
  const handleStart = () => {
    playSound('focus');
    onStart(task);
  };

  return (
    <div
      onClick={handleStart} // Used new handler here
      tabIndex={0}
      role="button"
      className={`group relative text-left p-5 rounded-2xl cursor-pointer transition-all duration-200 select-none bg-[#141414] border ${borderClasses}`}
    >
      <ImportanceLightsHeader level={finalLevel} lightColor={finalLightColor} />
      <div className="flex items-start justify-between gap-3 mt-3.5">
        <div className="flex-1 min-w-0 pr-2">
          <p className={`text-xs font-mono mb-1.5 ${isDanger ? 'text-red-400 font-bold' : 'text-neutral-400'}`}>
            Target: {deadlineDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {remainingText}
          </p>
          <h3 className="text-base font-bold text-white tracking-tight leading-snug">{task.title}</h3>
          {task.microStep && <p className="mt-2 text-xs text-neutral-400 leading-relaxed font-sans">{task.microStep}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={(e) => onComplete(task, e)} className="w-7 h-7 rounded-full border border-neutral-700 hover:border-white hover:bg-white hover:text-black text-neutral-400 flex items-center justify-center transition-all group/btn" title="Mark Complete">
            <Check className="w-3.5 h-3.5 stroke-[2.5] group-hover/btn:scale-110 transition-transform" />
          </button>
          <button onClick={(e) => onEdit(task, e)} className="w-7 h-7 rounded-full border border-neutral-700 hover:border-white hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-all" title="Edit task">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
