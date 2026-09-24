import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProviderKey } from '../../generated/prisma/client.js';

/**
 * To'lov provayderi abstraksiyasi.
 *
 * Maqsad — Click yoki Payme ulanganda **faqat shu interfeysni** bajaradigan fayl yozilsin,
 * qolgan hamma narsa (webhook yo'li, imzo tekshiruvi, takrorlanishdan himoya, kvitansiya,
 * qarz qayta hisobi, bildirishnoma, audit) o'zgarishsiz qolsin.
 *
 * Tamoyillar:
 *  - **Imzo majburiy:** imzosiz yoki noto'g'ri imzoli so'rov hech qachon to'lov yaratmaydi.
 *  - **Provayder sozlanmagan bo'lsa — o'chiq:** maxfiy kaliti yo'q provayder webhookni qabul
 *    qilmaydi (503). Bu "tasodifan ochiq qolgan endpoint" xavfini yo'qotadi.
 *  - **Provayder pulga tegmaydi:** u faqat "shu tranzaksiya to'landi" deb xabar beradi;
 *    kvitansiya va daftar yozuvini mavjud `paymentService` yaratadi.
 */

/** Webhookdan o'qilgan, provayderdan mustaqil ma'lumot */
export interface ParsedWebhook {
  /** Provayderdagi tranzaksiya raqami — takroriy webhookni aniqlash kaliti */
  externalId: string;
  /** So'm (butun son) */
  amount: number;
  /** Qaysi to'lov so'roviga tegishli (CRM tomonda yaratilgan) */
  intentId?: string | undefined;
  /** So'rovsiz to'g'ridan-to'g'ri to'lov bo'lsa — o'quvchi */
  studentId?: string | undefined;
  outcome: 'paid' | 'cancelled' | 'failed';
  /** Rad etilgan bo'lsa sababi */
  failureText?: string | undefined;
}

export interface PaymentProvider {
  key: PaymentProviderKey;
  /** Maxfiy kalit sozlanganmi — bo'lmasa webhook qabul qilinmaydi */
  isConfigured: () => boolean;
  /**
   * Imzoni tekshiradi. **Xom tana** (`rawBody`) ishlatiladi: JSON qayta serializatsiya qilinsa
   * baytlar o'zgarib, imzo mos kelmay qoladi.
   */
  verifySignature: (rawBody: string, headers: Record<string, string | undefined>) => boolean;
  /** Xom tanani provayderdan mustaqil ko'rinishga o'giradi */
  parseWebhook: (body: unknown) => ParsedWebhook;
  /** Provayder kutadigan javob (har biri o'zicha) */
  successResponse: () => unknown;
}

/** Vaqt bo'yicha barqaror solishtirish — imzoni belgima-belgi taqqoslash yo'li bilan topib bo'lmaydi */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
