import type { NotificationProducer } from '../types';
import { taskReminderProducer } from './taskReminders';

// Register any feature that needs to generate notifications on a schedule.
export const producers: NotificationProducer[] = [taskReminderProducer];
