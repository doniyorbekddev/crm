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
