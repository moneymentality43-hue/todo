export interface Task {
  id: string;
  rail: 'urgent' | 'exploration';
  title: string;
  deadline: Date | string; // Handled as Date object or ISO string
  importanceLevel: number;
  lightColor: 'white' | 'red' | 'amber' | 'yellow';
  microStep: string;
  status?: string;
  presetAccomplishment?: string;
  presetScore?: string;
  completedAt?: string;
  score?: string;
  reflection?: string;
}
