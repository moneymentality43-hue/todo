export interface Task {
  id: string;
  rail: 'urgent' | 'exploration';
  title: string;
  deadline: string | Date; 
  importanceLevel: number;
  lightColor: string;
  microStep?: string;

  // --- NEW SETTINGS ---
  warningThresholdMin: number;
  notificationIntervalMin?: number | null;

  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  score?: string | null;
  reflection?: string | null;
  completedAt?: string | null;
  
  // (Plus any other old UI properties you have like presetAccomplishment, etc.)
}
