// components/CompletedTaskList.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { Task } from '../types';

interface CompletedTaskListProps {
  tasks: Task[];
  onReviewTask: (task: Task) => void;
  onRestoreTask: (task: Task, e: React.MouseEvent) => void;
}

export default function CompletedTaskList({ tasks, onReviewTask, onRestoreTask }: CompletedTaskListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="mt-4 pt-6 border-t border-neutral-800/40">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-neutral-300 hover:text-white transition-colors text-sm font-semibold">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="text-white font-headline">Completed</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-900/80 text-neutral-400 border border-neutral-800/50 font-mono">{tasks.length}</span>
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2.5">
          {tasks.length === 0 ? (
            <div className="py-6 px-4 rounded-2xl border border-dashed border-neutral-850/40 text-center text-xs text-neutral-500 bg-neutral-950/40">
              No completed tasks yet.
            </div>
          ) : (
            tasks.map((task) => {
              const isFailed = task.score === 'FAILED';
              return (
                <div key={task.id} onClick={() => onReviewTask(task)} className={`group flex items-center justify-between p-3.5 px-4 rounded-xl hover:bg-neutral-900/80 border cursor-pointer ${isFailed ? 'bg-red-950/20 border-red-900/50' : 'bg-neutral-950/70 border-neutral-800/40'}`}>
                  <div className="flex items-center gap-3.5 min-w-0 w-full pr-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isFailed ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
                      {isFailed ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </div>
                    
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className={`text-sm font-medium truncate ${isFailed ? 'text-red-200' : 'text-neutral-200'}`}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-500">
                        <span className="font-mono shrink-0">Finished {task.completedAt}</span>
                        {task.score && <><span className="text-neutral-600 shrink-0">•</span><span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded shrink-0 ${isFailed ? 'bg-red-500 text-white' : 'text-black bg-white'}`}>{task.score}</span></>}
                        {task.reflection && <><span className="text-neutral-600 shrink-0">•</span><span className="text-neutral-400 italic truncate min-w-0">"{task.reflection}"</span></>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={(e) => onRestoreTask(task, e)} className="text-xs text-neutral-400 hover:text-white px-3 py-1 rounded-full border border-neutral-800/40 flex items-center gap-1.5">
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
  );
}
