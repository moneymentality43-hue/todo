import React from 'react';
import { TriangleAlert } from 'lucide-react';

interface DeleteGoalConfirmProps {
  goalName: string;
  subGoals: number;
  tasks: number;
  plans: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function DeleteGoalConfirm({ goalName, subGoals, tasks, plans, busy, onCancel, onConfirm }: DeleteGoalConfirmProps) {
  return (
    <div role="alertdialog" aria-label="Confirm goal deletion" className="rounded-2xl border border-neutral-600 bg-neutral-950 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <TriangleAlert className="w-5 h-5 text-white shrink-0 mt-0.5" />
        <div className="text-sm text-neutral-300 space-y-2">
          <p className="font-semibold text-white">Delete “{goalName}”?</p>
          <ul className="list-disc pl-4 space-y-1 text-xs text-neutral-400">
            <li>{plural(subGoals, 'sub-goal becomes', 'sub-goals become')} top-level (kept, and can be re-attached to another goal).</li>
            <li>{plural(tasks, 'task becomes', 'tasks become')} unattached (kept, with their progress).</li>
            <li>{plural(plans, 'plan is', 'plans are')} deleted permanently.</li>
          </ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-full text-xs text-neutral-400 hover:text-white transition-colors">Cancel</button>
        <button onClick={onConfirm} disabled={busy} className="px-5 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-50">
          {busy ? 'Deleting…' : 'Delete goal'}
        </button>
      </div>
    </div>
  );
}
