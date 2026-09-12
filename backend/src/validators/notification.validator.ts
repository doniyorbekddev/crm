import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'NEW_LEAD',
  'LEAD_ASSIGNED',
  'NEW_PAYMENT',
  'FOLLOW_UP_REMINDER',
  'FOLLOW_UP_OVERDUE',
  'NEW_STUDENT',
  'DEBT_REMINDER',
  'TRIAL_LESSON_REMINDER',
  'SYSTEM',
] as const;

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(NOTIFICATION_TYPES, 'Bildirishnoma turi noto‘g‘ri').optional(),
  /** Faqat o‘qilmaganlar */
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
