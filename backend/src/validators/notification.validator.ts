import { z } from 'zod';
import { NotificationPriority, NotificationType } from '../generated/prisma/enums.js';

/**
 * Bildirishnoma turlari — bazadagi enum bilan **bir xil** bo'lishi shart.
 *
 * Avval bu ro'yxat qo'lda yozilgan edi va yangi turlar qo'shilganda unutilib qolgan:
 * natijada, masalan, "Bugun kelmadi" turini filtrlash 422 xato berardi. Endi ro'yxat
 * Prisma enumidan olinadi, shuning uchun yangi tur qo'shilishi bilan filtrda ham paydo bo'ladi.
 */
export const NOTIFICATION_TYPES = Object.values(NotificationType) as [NotificationType, ...NotificationType[]];

export const NOTIFICATION_PRIORITIES = Object.values(NotificationPriority) as [NotificationPriority, ...NotificationPriority[]];

/**
 * Bildirishnoma toifalari — turlarning yiriklashtirilgan guruhi (markazdagi filtr uchun).
 *
 * `satisfies Record<NotificationType, …>` tufayli enumga yangi tur qo'shilsa, toifasi ko'rsatilmaguncha
 * kod kompilyatsiya bo'lmaydi — tur hech bir toifaga tushmay "yo'qolib" qolmaydi.
 */
export const NOTIFICATION_CATEGORIES = ['SALES', 'FINANCE', 'ATTENDANCE', 'HOMEWORK', 'EXAM', 'ACADEMIC', 'SYSTEM'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_TYPE_CATEGORY = {
  NEW_LEAD: 'SALES',
  LEAD_ASSIGNED: 'SALES',
  FOLLOW_UP_REMINDER: 'SALES',
  FOLLOW_UP_OVERDUE: 'SALES',
  TRIAL_LESSON_REMINDER: 'SALES',
  NEW_STUDENT: 'SALES',
  NEW_PAYMENT: 'FINANCE',
  DEBT_REMINDER: 'FINANCE',
  EXPENSE_APPROVAL: 'FINANCE',
  PAYMENT_DUE_SOON: 'FINANCE',
  CHILD_ABSENT: 'ATTENDANCE',
  ATTENDANCE_LATE: 'ATTENDANCE',
  HOMEWORK_CREATED: 'HOMEWORK',
  HOMEWORK_GRADED: 'HOMEWORK',
  HOMEWORK_DEADLINE: 'HOMEWORK',
  HOMEWORK_RETURNED: 'HOMEWORK',
  EXAM_RESULT: 'EXAM',
  EXAM_SCHEDULED: 'EXAM',
  LOW_SCORE: 'EXAM',
  LEVEL_UP: 'ACADEMIC',
  CERTIFICATE_ISSUED: 'ACADEMIC',
  WEEKLY_REPORT: 'ACADEMIC',
  RISK_INCREASED: 'ACADEMIC',
  NEGATIVE_FEEDBACK: 'ACADEMIC',
  SYSTEM: 'SYSTEM',
  DAILY_DIGEST: 'SYSTEM',
} as const satisfies Record<NotificationType, NotificationCategory>;

/** Toifaga kiruvchi turlar */
export function notificationTypesOf(category: NotificationCategory): NotificationType[] {
  return NOTIFICATION_TYPES.filter((type) => NOTIFICATION_TYPE_CATEGORY[type] === category);
}

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(NOTIFICATION_TYPES, 'Bildirishnoma turi noto‘g‘ri').optional(),
  /** Toifa bo‘yicha filtr (bir nechta tur). `type` ham berilsa — ikkalasi birga qo‘llanadi */
  category: z.enum(NOTIFICATION_CATEGORIES, 'Bildirishnoma toifasi noto‘g‘ri').optional(),
  /** Muhimlik bo‘yicha filtr */
  priority: z.enum(NOTIFICATION_PRIORITIES, 'Muhimlik darajasi noto‘g‘ri').optional(),
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

/** Sozlamani saqlash — bir nechta turni birdaniga yuborish mumkin */
export const notificationSettingsSchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(NOTIFICATION_TYPES, 'Bildirishnoma turi noto‘g‘ri'),
        inApp: z.boolean(),
        telegram: z.boolean(),
      }),
    )
    .min(1, 'Kamida bitta sozlama yuboring')
    .max(NOTIFICATION_TYPES.length, 'Ro‘yxat juda uzun'),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
