import type { GoalTaskDTO, MetricType } from '../../types/goals';

export interface MetricConfig {
  label: string;
  example: string;
  steps: number[];
}

export const METRIC_CONFIG: Record<MetricType, MetricConfig> = {
  COUNT: { label: 'Count', example: '12 / 50 pushups', steps: [1, 5, 10] },
  PERCENT: { label: 'Percentage', example: '0 – 100%', steps: [5, 10, 25] },
  DURATION: { label: 'Duration', example: '1h 30m of 5h', steps: [5, 15, 30] },
  YESNO: { label: 'Yes / No', example: 'Done or not done', steps: [1] },
  CUSTOM: { label: 'Custom unit', example: '40 / 300 pages', steps: [1, 5, 10] },
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Mirrors the server rule so optimistic updates match what gets saved
export function clampValue(metricType: MetricType, value: number): number {
  const v = Math.max(0, value);
  switch (metricType) {
    case 'YESNO': return v >= 0.5 ? 1 : 0;
    case 'PERCENT': return round2(Math.min(100, v));
    case 'COUNT':
    case 'DURATION': return Math.round(v);
    case 'CUSTOM': return round2(v);
  }
}

export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

const trimNumber = (n: number) => String(round2(n));

export function formatValue(task: Pick<GoalTaskDTO, 'metricType' | 'unit'>, value: number): string {
  switch (task.metricType) {
    case 'PERCENT': return `${trimNumber(value)}%`;
    case 'DURATION': return formatMinutes(value);
    case 'YESNO': return value >= 1 ? 'Done' : 'Not done';
    case 'CUSTOM': return `${trimNumber(value)} ${task.unit ?? ''}`.trim();
    default: return trimNumber(value);
  }
}

export function formatTarget(task: Pick<GoalTaskDTO, 'metricType' | 'unit' | 'target'>): string {
  switch (task.metricType) {
    case 'PERCENT': return '100%';
    case 'DURATION': return formatMinutes(task.target);
    case 'YESNO': return '';
    case 'CUSTOM': return `${trimNumber(task.target)} ${task.unit ?? ''}`.trim();
    default: return trimNumber(task.target);
  }
}

export function stepLabel(metricType: MetricType, step: number, sign: '+' | '−' = '+'): string {
  return `${sign}${step}${metricType === 'DURATION' ? 'm' : metricType === 'PERCENT' ? '%' : ''}`;
}

export const progressRatio = (current: number, target: number) =>
  target <= 0 ? 0 : Math.min(1, Math.max(0, current / target));

export const isComplete = (current: number, target: number) => current >= target;
