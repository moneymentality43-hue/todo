"use client";

import React from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { GitBranch, ListChecks } from 'lucide-react';
import type { GoalStatus, MetricType } from '../../types/goals';
import { formatTarget, formatValue, progressRatio } from '../../lib/goals/metrics';
import StatusBadge from './StatusBadge';
import WorkTimeBadge from './WorkTimeBadge';

export type GoalNodeData = {
  name: string;
  status: GoalStatus;
  subGoalCount: number;
  taskCount: number;
  deepMinutes: number;
  shallowMinutes: number;
  isRoot: boolean;
};
export type GoalFlowNode = Node<GoalNodeData, 'goal'>;

export type TaskNodeData = {
  title: string;
  metricType: MetricType;
  unit: string | null;
  current: number;
  target: number;
};
export type TaskFlowNode = Node<TaskNodeData, 'task'>;

const hidden = '!opacity-0 !pointer-events-none !w-1 !h-1';

export function GoalNode({ data }: NodeProps<GoalFlowNode>) {
  return (
    <div
      className={`w-[220px] rounded-2xl border bg-[#0a0a0a] p-3.5 cursor-pointer transition-colors hover:border-white ${
        data.isRoot ? 'border-white shadow-[0_0_24px_rgba(255,255,255,0.12)]' : 'border-[#333333]'
      } ${data.status === 'COMPLETED' ? 'opacity-70' : ''}`}
    >
      <Handle type="target" position={Position.Top} className={hidden} />
      <div className="flex items-start justify-between gap-2">
        <span className="font-headline text-sm font-semibold text-white leading-snug break-words line-clamp-2">{data.name}</span>
      </div>
      <div className="mt-2"><StatusBadge status={data.status} /></div>
      <div className="mt-3 flex items-center gap-3 text-[10px] font-mono text-neutral-500">
        <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {data.subGoalCount}</span>
        <span className="flex items-center gap-1"><ListChecks className="w-3 h-3" /> {data.taskCount}</span>
      </div>
      <WorkTimeBadge deepMinutes={data.deepMinutes} shallowMinutes={data.shallowMinutes} compact className="mt-2" />
      <Handle type="source" position={Position.Bottom} className={hidden} />
    </div>
  );
}

export function TaskLeafNode({ data }: NodeProps<TaskFlowNode>) {
  const ratio = progressRatio(data.current, data.target);
  const label = data.metricType === 'YESNO'
    ? (data.current >= 1 ? 'Done' : 'Not done')
    : `${formatValue(data, data.current)} / ${formatTarget({ metricType: data.metricType, unit: data.unit, target: data.target })}`;

  return (
    <div className="w-[220px] rounded-xl border border-dashed border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2.5 cursor-pointer transition-colors hover:border-neutral-400">
      <Handle type="target" position={Position.Top} className={hidden} />
      <div className="text-xs text-neutral-200 truncate">{data.title}</div>
      <div className="mt-1.5 h-1 rounded-full bg-neutral-900 overflow-hidden">
        <div className="h-full rounded-full bg-white transition-all" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-1 text-[10px] font-mono text-neutral-500 truncate">{label}</div>
    </div>
  );
}
