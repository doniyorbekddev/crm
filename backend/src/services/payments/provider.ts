import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProviderKey } from '../../generated/prisma/client.js';
import type { ClientInfo } from '../../utils/requestContext.js';

/**
 * To'lov provayderi abstraksiyasi.
 *
 * Maqsad — Click yoki Payme ulanganda **faqat shu interfeysni** bajaradigan fayl yozilsin,
 * qolgan hamma narsa (webhook yo'li, imzo tekshiruvi, takrorlanishdan himoya, kvitansiya,
 * qarz qayta hisobi, bildirishnoma, audit) o'zgarishsiz qolsin.
 *
 * Ikki xil provayder (TZ 3.1 GAP-17):
 *  - **signed** — bitta imzolangan webhook ("to'landi"), masalan sinov provayderi;
 *  - **protocol** — ko'p bosqichli protokol: Click (Prepare → Complete), Payme (JSON-RPC: Check → Create →
 *    Perform / Cancel). Provayder so'rovni o'zi o'qiydi va o'z formatida javob beradi (Click va Payme
 *    xatoni ham HTTP 200 da, tanada kod bilan kutadi).
 *
 * Tamoyillar:
 *  - **Imzo/kalit majburiy:** imzosiz yoki noto'g'ri so'rov hech qachon to'lov yaratmaydi.
 *  - **Provayder sozlanmagan bo'lsa — o'chiq:** kaliti yo'q provayder webhookni qabul qilmaydi (503).
 *  - **Sinov rejimi yashirilmaydi:** `mode()` — `test` bo'lsa UI va bot "sinov" deb ko'rsatadi.
 *  - **Provayder pulga tegmaydi:** kvitansiya, qarz, qaytarish — mavjud `paymentService` orqali.
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

export type ProviderMode = 'sandbox' | 'test' | 'production';

interface ProviderBase {
  key: PaymentProviderKey;
  /** Kalitlar sozlanganmi — bo'lmasa webhook qabul qilinmaydi (503) va havola yaratilmaydi */
  isConfigured: () => boolean;
  mode: () => ProviderMode;
  /** To'lov sahifasi havolasi (o'quvchi/ota-onaga) — provayder ulanmagan bo'lsa null */
  checkoutUrl?: (intent: { id: string; amount: number }) => string | null;
}

export interface SignedWebhookProvider extends ProviderBase {
  kind: 'signed';
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

export interface ProviderRequest {
  body: unknown;
  headers: Record<string, string | undefined>;
  client: ClientInfo;
}

export interface ProviderResponse {
  status: number;
  body: unknown;
  /** Metrika uchun natija */
  result: 'ok' | 'duplicate' | 'rejected' | 'unauthorized' | 'error';
}

export interface ProtocolProvider extends ProviderBase {
  kind: 'protocol';
  handle: (request: ProviderRequest) => Promise<ProviderResponse>;
}

export type PaymentProvider = SignedWebhookProvider | ProtocolProvider;

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

export function md5Hex(payload: string): string {
  return createHash('md5').update(payload).digest('hex');
}

export function sha1Hex(payload: string): string {
  return createHash('sha1').update(payload).digest('hex');
}
