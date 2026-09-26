import { env } from '../../config/env.js';
import { hmacSha256Hex, safeEquals } from './provider.js';
import type { ParsedWebhook, SignedWebhookProvider } from './provider.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Sinov provayderi.
 *
 * Click/Payme kalitlari kelgunicha butun oqimni (imzo → takror tekshiruvi → kvitansiya →
 * qarz qayta hisobi → bildirishnoma → audit) haqiqiy tarzda sinab ko'rish uchun kerak.
 * Imzo — `X-Signature` sarlavhasidagi HMAC-SHA256(xom tana, maxfiy kalit).
 *
 * Kalit sozlanmagan bo'lsa provayder o'chiq: webhook 503 qaytaradi.
 */
export const sandboxProvider: SignedWebhookProvider = {
  key: 'SANDBOX',
  kind: 'signed',

  isConfigured: () => Boolean(env.PAYMENT_SANDBOX_SECRET),
  mode: () => 'sandbox',

  verifySignature(rawBody, headers) {
    const secret = env.PAYMENT_SANDBOX_SECRET;
    if (!secret) return false;
    const signature = headers['x-signature'];
    if (!signature) return false;
    return safeEquals(signature, hmacSha256Hex(secret, rawBody));
  },

  parseWebhook(body): ParsedWebhook {
    const data = body as Record<string, unknown>;
    const externalId = typeof data.transactionId === 'string' ? data.transactionId : '';
    const amount = typeof data.amount === 'number' ? Math.round(data.amount) : Number.NaN;
    const outcomeRaw = typeof data.status === 'string' ? data.status : '';

    if (!externalId || !Number.isFinite(amount) || amount <= 0) {
      throw AppError.unprocessable('Webhook ma’lumoti to‘liq emas');
    }
    const outcome = outcomeRaw === 'paid' ? 'paid' : outcomeRaw === 'cancelled' ? 'cancelled' : 'failed';

    return {
      externalId,
      amount,
      outcome,
      ...(typeof data.intentId === 'string' ? { intentId: data.intentId } : {}),
      ...(typeof data.studentId === 'string' ? { studentId: data.studentId } : {}),
      ...(typeof data.reason === 'string' ? { failureText: data.reason } : {}),
    };
  },

  successResponse: () => ({ ok: true }),
};
