import React, { useState, useEffect } from 'react';
import { X, Zap, Clock, Bell, AlertTriangle, Trash2 } from 'lucide-react';
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

// THE TIMEZONE FIX: Ensures the database UTC time translates perfectly back to your local time
const toLocalDatetimeString = (date: Date | string) => {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function TaskModal({ isOpen, onClose, onSave, onDelete, initialTask, defaultRail = 'urgent' }: TaskModalProps) {
  const isEditing = !!initialTask;

  const [rail, setRail] = useState<'urgent' | 'exploration'>(defaultRail);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [importanceLevel, setImportanceLevel] = useState(3);
  const [microStep, setMicroStep] = useState('');

  // NEW DATABASE FIELDS
  const [warningThresholdMin, setWarningThresholdMin] = useState(120);
  const [notificationIntervalMin, setNotificationIntervalMin] = useState<number | ''>('');

  // Load initial data
  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setRail(initialTask.rail as 'urgent' | 'exploration');
        setTitle(initialTask.title);
        setDeadline(toLocalDatetimeString(initialTask.deadline));
        setImportanceLevel(initialTask.importanceLevel || 3);
        setMicroStep(initialTask.microStep ? initialTask.microStep.replace(/^starter:\s*/i, '') : '');
        setWarningThresholdMin(initialTask.warningThresholdMin ?? 120);
        setNotificationIntervalMin(initialTask.notificationIntervalMin ?? '');
      } else {
        setRail(defaultRail);
        setTitle('');
        const now = new Date();
        now.setHours(now.getHours() + 2);
        setDeadline(toLocalDatetimeString(now));
        setImportanceLevel(defaultRail === 'urgent' ? 5 : 3);
        setMicroStep('');
        setWarningThresholdMin(120);
        setNotificationIntervalMin('');
      }
    }
  }, [isOpen, initialTask, defaultRail]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !deadline) return;

    const formattedStarter = microStep.trim()
      ? (microStep.toLowerCase().startsWith('starter:') ? microStep.trim() : `starter: ${microStep.trim()}`)
      : (rail === 'urgent' ? 'starter: Launch workspace & review first item' : 'starter: Skim initial architecture notes');

    const resolvedLightColor = rail === 'urgent' ? 'amber' : 'white';

    const taskData: Task = {
      id: initialTask ? initialTask.id : '',
      rail,
      title: title.trim(),
      // FIX: Force absolute UTC string from the browser so the server never guesses the timezone
      deadline: new Date(deadline).toISOString(), 
      importanceLevel,
      lightColor: resolvedLightColor,
      microStep: formattedStarter,
      warningThresholdMin,
      notificationIntervalMin: notificationIntervalMin === '' ? null : Number(notificationIntervalMin),
      status: 'ACTIVE'
    };

    onSave(taskData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e0e0e] border border-white/80 rounded-2xl w-full max-w-lg p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-neutral-800">
          <div>
            <h3 className="text-base font-bold text-white font-headline">{isEditing ? 'Edit Task' : 'Create New Task'}</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Configure task parameters & importance lights</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center border border-neutral-800 text-neutral-400 hover:text-white hover:border-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 p-1.5 bg-neutral-950 border border-neutral-800 rounded-xl gap-1.5">
            <button type="button" onClick={() => { setRail('urgent'); setImportanceLevel(5); }} className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${rail === 'urgent' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${rail === 'urgent' ? 'bg-black' : 'bg-neutral-600'}`}></span><span>Mandatory</span>
            </button>
            <button type="button" onClick={() => { setRail('exploration'); setImportanceLevel(3); }} className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${rail === 'exploration' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${rail === 'exploration' ? 'bg-black' : 'bg-neutral-600'}`}></span><span>Exploration</span>
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-400 block mb-1">Task Title</label>
            <input type="text" required placeholder={rail === 'urgent' ? 'e.g. Finalize quarterly tax reconciliation' : 'e.g. Dissect Raymarching & SDF shaders'} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 focus:border-white rounded-xl px-3.5 py-2 text-sm text-white placeholder-neutral-600 outline-none transition-all" />
          </div>

          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-neutral-400" /><span> Level</span></label>
              <span className="text-xs font-mono font-bold text-white">Level {importanceLevel} / 5</span>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button key={lvl} type="button" onClick={() => setImportanceLevel(lvl)} className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${importanceLevel === lvl ? 'bg-white text-black border-white shadow-sm' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}>{lvl}</button>
              ))}
            </div>
            <div className="pt-1"><ImportanceLightsHeader level={importanceLevel} lightColor={rail === 'urgent' ? 'amber' : 'white'} className="mb-0 mt-1" /></div>
          </div>

          <div className="flex flex-col gap-3 p-4 bg-neutral-950 border border-neutral-800 rounded-xl">
            <div>
              <label className="text-xs text-neutral-300 flex items-center gap-1.5 mb-1 font-semibold"><Clock className="w-3 h-3 text-neutral-400" /><span>Target Deadline</span></label>
              <input type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full bg-black border border-neutral-800 rounded-lg focus:border-white px-3 py-1.5 text-xs text-white placeholder-neutral-600 outline-none font-mono [color-scheme:dark]" />
            </div>

            {rail === 'urgent' && (
              <div className="grid grid-cols-2 gap-3 pt-2 mt-1 border-t border-neutral-800/50">
                <div>
                  <label className="text-[11px] font-semibold text-red-400/80 mb-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Red Laser @</label>
                  <select value={warningThresholdMin} onChange={(e) => setWarningThresholdMin(Number(e.target.value))} className="w-full bg-black border border-neutral-800 rounded-lg px-2 py-1.5 text-white text-xs focus:border-red-500 outline-none transition-colors appearance-none font-mono">
                    <option value={15}>15 mins prior</option>
                    <option value={30}>30 mins prior</option>
                    <option value={60}>1 hour prior</option>
                    <option value={120}>2 hours prior</option>
                    <option value={240}>4 hours prior</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-[11px] font-semibold text-neutral-400 mb-1.5 flex items-center gap-1"><Bell className="w-3 h-3" /> Push Alerts</label>
                  <select value={notificationIntervalMin} onChange={(e) => setNotificationIntervalMin(e.target.value ? Number(e.target.value) : '')} className="w-full bg-black border border-neutral-800 rounded-lg px-2 py-1.5 text-white text-xs focus:border-white outline-none transition-colors appearance-none font-mono">
                    <option value="">No alerts</option>
                    <option value={5}>Every 5 mins</option>
                    <option value={10}>Every 10 mins</option>
                    <option value={15}>Every 15 mins</option>
                  </select>
                </div>
              </div>
            )}

            <div className="pt-2">
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
