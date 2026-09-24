import { z } from 'zod';
import { NotificationType } from '../generated/prisma/enums.js';

/**
 * Bildirishnoma turlari — bazadagi enum bilan **bir xil** bo'lishi shart.
 *
 * Avval bu ro'yxat qo'lda yozilgan edi va yangi turlar qo'shilganda unutilib qolgan:
 * natijada, masalan, "Bugun kelmadi" turini filtrlash 422 xato berardi. Endi ro'yxat
 * Prisma enumidan olinadi, shuning uchun yangi tur qo'shilishi bilan filtrda ham paydo bo'ladi.
 */
export const NOTIFICATION_TYPES = Object.values(NotificationType) as [NotificationType, ...NotificationType[]];

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(NOTIFICATION_TYPES, 'Bildirishnoma turi noto‘g‘ri').optional(),
  /** Faqat o‘qilmaganlar */
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Faqat o‘qilganlar */
  readOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Sana oralig‘i (kun aniqligida) */
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-09-15')
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-09-15')
    .optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
