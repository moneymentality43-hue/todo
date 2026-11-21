import type { NotificationProducer } from '../types';
import { taskReminderProducer } from './taskReminders';
import { goalResumeProducer, validationDigestProducer } from './goalValidation';

// Register any feature that needs to generate notifications on a schedule.
// Goal resume runs first so goals that just resumed are included in the validation digest.
export const producers: NotificationProducer[] = [taskReminderProducer, goalResumeProducer, validationDigestProducer];
