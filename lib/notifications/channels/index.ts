import type { NotificationChannel } from '../types';
import { webPushChannel } from './webpush';

// Register additional channels (email, SMS, ...) here. notify() sends to every registered channel.
export const channels: NotificationChannel[] = [webPushChannel];
