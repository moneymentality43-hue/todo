import React, { useState, useEffect } from 'react';
import { X, Zap, Clock, Trash2 } from 'lucide-react';
import { Task } from '../types';
import ImportanceLightsHeader from './ImportanceLightsHeader';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  initialTask?: Task | null;
  defaultRail?: 'urgent' | 'exploration';
}

// Helper to get YYYY-MM-DDTHH:mm for the HTML input
const getLocalIsoString = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function TaskModal({ isOpen, onClose, onSave, onDelete, initialTask, defaultRail = 'urgent' }: TaskModalProps) {
  const isEditing = !!initialTask;

  const [rail, setRail] = useState<'urgent' | 'exploration'>(defaultRail);
  const [title, setTitle] = useState('');
  
  // Set default deadline to 2 hours from now
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    return getLocalIsoString(d);
  });
  
  const [importanceLevel, setImportanceLevel] = useState(3);
  const [microStep, setMicroStep] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setRail(initialTask.rail as 'urgent' | 'exploration');
        setTitle(initialTask.title);
        setDeadline(getLocalIsoString(new Date(initialTask.deadline)));
        setImportanceLevel(initialTask.importanceLevel);
        setMicroStep(initialTask.microStep.replace(/^starter:\s*/i, ''));
      } else {
        setRail(defaultRail);
        setTitle('');
        const d = new Date();
        d.setHours(d.getHours() + 2);
        setDeadline(getLocalIsoString(d));
        setImportanceLevel(defaultRail === 'urgent' ? 3 : 3);
        setMicroStep('');
      }
    }
  }, [isOpen, initialTask, defaultRail]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const formattedStarter = microStep.trim()
      ? (microStep.toLowerCase().startsWith('starter:') ? microStep.trim() : `starter: ${microStep.trim()}`)
      : (rail === 'urgent' ? 'starter: Launch workspace & review first item' : 'starter: Skim initial architecture notes');

    const taskData: Task = {
      id: initialTask ? initialTask.id : 'task-' + Date.now(),
      rail,
      title: title.trim(),
      deadline: new Date(deadline), // Convert back to real Date object
      importanceLevel,
      lightColor: rail === 'urgent' ? 'amber' : 'white', // Default color, will be overridden dynamically if < 2 hours
      microStep: formattedStarter
    };

    onSave(taskData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e0e0e] border border-white/80 rounded-2xl w-full max-w-lg p-6 relative shadow-2xl">
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-neutral-800">
          <div>
            <h3 className="text-base font-bold text-white font-headline">{isEditing ? 'Edit Task' : 'Create New Task'}</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Automated synchronous deadline tracking</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center border border-neutral-800 text-neutral-400 hover:text-white hover:border-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 p-1.5 bg-neutral-950 border border-neutral-800 rounded-xl gap-1.5">
            <button type="button" onClick={() => setRail('urgent')} className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${rail === 'urgent' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}>
              <span>Left Stream (Mandatory)</span>
            </button>
            <button type="button" onClick={() => setRail('exploration')} className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${rail === 'exploration' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}>
              <span>Right Stream (Exploration)</span>
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-400 block mb-1">Task Title</label>
            <input type="text" required placeholder="Task title..." value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 focus:border-white rounded-xl px-3.5 py-2 text-sm text-white placeholder-neutral-600 outline-none transition-all" />
          </div>

          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-neutral-400" /><span>Base Importance Level</span></label>
              <span className="text-xs font-mono font-bold text-white">Level {importanceLevel} / 5</span>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button key={lvl} type="button" onClick={() => setImportanceLevel(lvl)} className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${importanceLevel === lvl ? 'bg-white text-black border-white shadow-sm' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}>{lvl}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4 bg-neutral-950 border border-neutral-800 rounded-xl">
            <div>
              <label className="text-xs text-neutral-300 flex items-center gap-1.5 mb-1 font-semibold"><Clock className="w-3 h-3 text-neutral-400" /><span>Exact Deadline</span></label>
              <input 
                type="datetime-local" 
                required 
                value={deadline} 
                onChange={(e) => setDeadline(e.target.value)} 
                className="w-full bg-black border border-neutral-800 rounded-lg focus:border-white px-3 py-1.5 text-xs text-white outline-none font-mono" 
                style={{ colorScheme: 'dark' }}
              />
            </div>

            <div>
              <label className="text-xs text-neutral-300 block mb-1 font-semibold">Starter Step (starter: ...)</label>
              <input type="text" value={microStep} onChange={(e) => setMicroStep(e.target.value)} placeholder="e.g. Launch workspace & review first item" className="w-full bg-black border border-neutral-800 rounded-lg focus:border-white px-3 py-1.5 text-xs text-white placeholder-neutral-600 outline-none" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3.5 border-t border-neutral-800">
            {isEditing && onDelete ? (
              <button type="button" onClick={() => onDelete(initialTask!.id)} className="px-3.5 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /><span>Delete Task</span>
              </button>
            ) : <div />}
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white">Cancel</button>
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 active:scale-95 transition-all">
                {isEditing ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
