import { NotificationPriority, NotificationType } from '../generated/prisma/enums.js';

/**
 * Bildirishnoma turining muhimligi.
 *
 * Daraja **turga bog'langan**, chaqiruvchi uni yozmaydi: aks holda bir xil hodisa turli
 * joylarda turlicha baholanib, ro'yxatdagi tartib ishonchsiz bo'lib qolardi.
 *
 *  - `HIGH`  — kechiktirib bo'lmaydigan ish yoki pul masalasi (qarz, muddati o'tgan follow-up,
 *              tasdiq kutayotgan xarajat, past baho, bolaning darsga kelmagani, tizim xabari);
 *  - `LOW`   — kunlik xulosa kabi ma'lumot uchun xabar;
 *  - `NORMAL`— qolgan hammasi.
 */
export const NOTIFICATION_PRIORITY: Record<NotificationType, NotificationPriority> = {
  NEW_LEAD: NotificationPriority.NORMAL,
  LEAD_ASSIGNED: NotificationPriority.NORMAL,
  NEW_PAYMENT: NotificationPriority.NORMAL,
  FOLLOW_UP_REMINDER: NotificationPriority.NORMAL,
  FOLLOW_UP_OVERDUE: NotificationPriority.HIGH,
  NEW_STUDENT: NotificationPriority.NORMAL,
  DEBT_REMINDER: NotificationPriority.HIGH,
  TRIAL_LESSON_REMINDER: NotificationPriority.NORMAL,
  EXPENSE_APPROVAL: NotificationPriority.HIGH,
  SYSTEM: NotificationPriority.HIGH,
  DAILY_DIGEST: NotificationPriority.LOW,
  CHILD_ABSENT: NotificationPriority.HIGH,
  PAYMENT_DUE_SOON: NotificationPriority.NORMAL,
  NEGATIVE_FEEDBACK: NotificationPriority.HIGH,
  HOMEWORK_CREATED: NotificationPriority.NORMAL,
  HOMEWORK_GRADED: NotificationPriority.NORMAL,
  EXAM_RESULT: NotificationPriority.NORMAL,
  LEVEL_UP: NotificationPriority.LOW,
  CERTIFICATE_ISSUED: NotificationPriority.NORMAL,
  WEEKLY_REPORT: NotificationPriority.LOW,
  HOMEWORK_DEADLINE: NotificationPriority.HIGH,
  HOMEWORK_RETURNED: NotificationPriority.HIGH,
  EXAM_SCHEDULED: NotificationPriority.NORMAL,
  LOW_SCORE: NotificationPriority.HIGH,
  ATTENDANCE_LATE: NotificationPriority.NORMAL,
  RISK_INCREASED: NotificationPriority.HIGH,
};

/**
 * O'chirib bo'lmaydigan turlar.
 *
 * `SYSTEM` — hisob va xavfsizlik xabarlari (parol o'zgardi, ruxsat berildi va h.k.).
 * Xodim uni o'chirib qo'ysa, muhim ogohlantirish unga yetib bormay qolardi, shuning uchun
 * sozlamada bu tur **ko'rinadi, lekin o'zgartirilmaydi**.
 */
export const ALWAYS_ON_NOTIFICATION_TYPES: readonly NotificationType[] = [NotificationType.SYSTEM];

export function isMutableNotificationType(type: NotificationType): boolean {
  return !ALWAYS_ON_NOTIFICATION_TYPES.includes(type);
}

/**
 * Bildirishnoma toifalari (TZ 3.1 GAP-13) — sozlamada tur o'rniga toifa bo'yicha yoqish/o'chirish.
 * Yangi saqlash tizimi yo'q: toifa — mavjud `NotificationSetting` (userId + tur) qatorlari to'plami.
 * `Record` tufayli yangi tur qo'shilsa, toifasi berilmaguncha kompilyatsiya o'tmaydi.
 */
export const NOTIFICATION_CATEGORIES = ['ATTENDANCE', 'PAYMENT', 'HOMEWORK', 'EXAM', 'ACHIEVEMENT', 'MARKETING', 'SYSTEM'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  ATTENDANCE: '📚 Davomat',
  PAYMENT: '💳 To‘lov',
  HOMEWORK: '📝 Vazifa',
  EXAM: '🎯 Imtihon',
  ACHIEVEMENT: '🏆 Yutuqlar',
  MARKETING: '📣 Marketing',
  SYSTEM: '⚙️ Tizim',
};

export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory> = {
  CHILD_ABSENT: 'ATTENDANCE',
  ATTENDANCE_LATE: 'ATTENDANCE',
  RISK_INCREASED: 'ATTENDANCE',
  NEW_PAYMENT: 'PAYMENT',
  DEBT_REMINDER: 'PAYMENT',
  PAYMENT_DUE_SOON: 'PAYMENT',
  EXPENSE_APPROVAL: 'PAYMENT',
  HOMEWORK_CREATED: 'HOMEWORK',
  HOMEWORK_GRADED: 'HOMEWORK',
  HOMEWORK_DEADLINE: 'HOMEWORK',
  HOMEWORK_RETURNED: 'HOMEWORK',
  EXAM_RESULT: 'EXAM',
  EXAM_SCHEDULED: 'EXAM',
  LOW_SCORE: 'EXAM',
  LEVEL_UP: 'ACHIEVEMENT',
  CERTIFICATE_ISSUED: 'ACHIEVEMENT',
  NEW_LEAD: 'MARKETING',
  LEAD_ASSIGNED: 'MARKETING',
  FOLLOW_UP_REMINDER: 'MARKETING',
  FOLLOW_UP_OVERDUE: 'MARKETING',
  TRIAL_LESSON_REMINDER: 'MARKETING',
  NEW_STUDENT: 'MARKETING',
  SYSTEM: 'SYSTEM',
  DAILY_DIGEST: 'SYSTEM',
  WEEKLY_REPORT: 'SYSTEM',
  NEGATIVE_FEEDBACK: 'SYSTEM',
};

export function isNotificationCategory(value: string | null | undefined): value is NotificationCategory {
  return NOTIFICATION_CATEGORIES.includes(value as NotificationCategory);
}
