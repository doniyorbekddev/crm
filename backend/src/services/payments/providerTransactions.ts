import { prisma } from '../../config/database.js';
import type { PaymentProviderKey, Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../utils/logger.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { auditService } from '../audit.service.js';
import { paymentService } from '../payment.service.js';

/**
 * Click/Payme tranzaksiyalari uchun umumiy dvigatel (TZ 3.1 GAP-17). Protokol farqlari provayder faylida,
 * bu yerda — holatlar va pul yo'li:
 *
 * ```
 *  1 (yaratildi / prepare) ──perform──► 2 (bajarildi: kvitansiya, so'rov PAID)
 *     │                                    │
 *   cancel                              cancel (qaytarish: paymentService.refund, so'rov REFUNDED)
 *     ▼                                    ▼
 *  -1 (bekor, so'rov yana to'lanadi)    -2 (qaytarildi)
 * ```
 *
 * Idempotentlik: tranzaksiya `(provider, providerTxId)` bo'yicha unikal (parallel birinchi so'rov — P2002
 * ushlanadi, mavjudi qaytadi, audit S8); kvitansiya `idempotencyKey = <PROVIDER>-<providerTxId>` bilan —
 * takroriy "perform" ikkinchi to'lov yaratmaydi; holat o'tishlari shartli (`updateMany where state`).
 */

export const TX_STATE = { CREATED: 1, PERFORMED: 2, CANCELLED: -1, REFUNDED: -2 } as const;

const METHOD: Record<PaymentProviderKey, 'CLICK' | 'PAYME' | 'UZUM' | 'OTHER'> = { CLICK: 'CLICK', PAYME: 'PAYME', UZUM: 'UZUM', SANDBOX: 'OTHER' };

export const txSelect = {
  id: true,
  number: true,
  provider: true,
  providerTxId: true,
  providerRef: true,
  intentId: true,
  amount: true,
  state: true,
  providerTime: true,
  performedAt: true,
  cancelledAt: true,
  reason: true,
  paymentId: true,
  createdAt: true,
} satisfies Prisma.PaymentProviderTransactionSelect;

export type ProviderTx = Prisma.PaymentProviderTransactionGetPayload<{ select: typeof txSelect }>;

export type IntentCheck =
  | { ok: true; intent: { id: string; amount: number; studentId: string } }
  | { ok: false; reason: 'not_found' | 'paid' | 'closed' | 'busy' };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export const providerTransactions = {
  /** Buyurtma (to'lov so'rovi) to'lanishi mumkinmi: bor, shu provayderniki, PENDING, boshqa faol tranzaksiyasiz */
  async payableIntent(provider: PaymentProviderKey, intentId: string, options: { ignoreTxId?: string } = {}): Promise<IntentCheck> {
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId }, select: { id: true, provider: true, amount: true, status: true, studentId: true } });
    if (!intent || intent.provider !== provider) return { ok: false, reason: 'not_found' };
    if (intent.status === 'PAID') return { ok: false, reason: 'paid' };
    if (intent.status !== 'PENDING') return { ok: false, reason: 'closed' };
    const active = await prisma.paymentProviderTransaction.findFirst({
      where: { intentId, state: TX_STATE.CREATED, ...(options.ignoreTxId ? { providerTxId: { not: options.ignoreTxId } } : {}) },
      select: { id: true },
    });
    if (active) return { ok: false, reason: 'busy' };
    return { ok: true, intent: { id: intent.id, amount: intent.amount.toNumber(), studentId: intent.studentId } };
  },

  async find(provider: PaymentProviderKey, providerTxId: string): Promise<ProviderTx | null> {
    return prisma.paymentProviderTransaction.findUnique({ where: { provider_providerTxId: { provider, providerTxId } }, select: txSelect });
  },

  /** Yaratadi; parallel takror (P2002) — mavjudini qaytaradi */
  async create(input: {
    provider: PaymentProviderKey;
    providerTxId: string;
    intentId: string;
    amount: number;
    providerTime?: number | null;
    providerRef?: string | null;
  }): Promise<{ tx: ProviderTx; created: boolean }> {
    try {
      const tx = await prisma.paymentProviderTransaction.create({
        data: {
          provider: input.provider,
          providerTxId: input.providerTxId,
          intentId: input.intentId,
          amount: input.amount,
          state: TX_STATE.CREATED,
          providerTime: input.providerTime === undefined || input.providerTime === null ? null : BigInt(input.providerTime),
          providerRef: input.providerRef ?? null,
        },
        select: txSelect,
      });
      return { tx, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.find(input.provider, input.providerTxId);
      if (!existing) throw error;
      return { tx: existing, created: false };
    }
  },

  /**
   * Bajaradi: kvitansiya (mavjud `paymentService.create`, idempotent kalit bilan), tranzaksiya 2, so'rov PAID.
   * Allaqachon bajarilgan bo'lsa — o'zgarishsiz qaytadi. Kvitansiya yozilmasa (masalan moliyaviy oy yopiq) —
   * xato tashlanadi, holat 1 da qoladi (provayder qayta urinadi yoki bekor qiladi).
   */
  async perform(tx: ProviderTx, client: ClientInfo): Promise<ProviderTx> {
    if (tx.state === TX_STATE.PERFORMED) return tx;
    if (tx.state !== TX_STATE.CREATED) throw new Error(`Tranzaksiya holati ${tx.state} — bajarib bo'lmaydi`);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: tx.intentId }, select: { id: true, studentId: true } });
    const idempotencyKey = `${tx.provider}-${tx.providerTxId}`.slice(0, 64);

    let paymentId: string;
    try {
      const result = await paymentService.create(
        null,
        {
          studentId: intent.studentId,
          amount: tx.amount.toNumber(),
          method: METHOD[tx.provider],
          comment: `${tx.provider} orqali onlayn to‘lov (${tx.providerTxId})`,
          idempotencyKey,
        } as never,
        client,
      );
      paymentId = result.payment.id;
    } catch (error) {
      // Parallel "perform": ikkinchisi kvitansiyani idempotent kalit bo'yicha topadi
      if (!isUniqueViolation(error)) throw error;
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey }, select: { id: true } });
      if (!existing) throw error;
      paymentId = existing.id;
    }

    const now = new Date();
    const changed = await prisma.$transaction(async (db) => {
      const moved = await db.paymentProviderTransaction.updateMany({
        where: { id: tx.id, state: TX_STATE.CREATED },
        data: { state: TX_STATE.PERFORMED, performedAt: now, paymentId },
      });
      if (moved.count === 1) {
        await db.paymentIntent.update({ where: { id: intent.id }, data: { status: 'PAID', paymentId, paidAt: now, externalId: tx.providerTxId, failureText: null } });
        await auditService.recordInTransaction(db, {
          userId: null,
          action: 'payment.online_received',
          entityType: 'student',
          entityId: intent.studentId,
          metadata: { provider: tx.provider, externalId: tx.providerTxId, amount: tx.amount.toNumber(), paymentId, intentId: intent.id },
          ...client,
        });
      }
      return moved.count === 1;
    });
    if (changed) logger.info({ provider: tx.provider, providerTxId: tx.providerTxId }, 'Onlayn to‘lov bajarildi');
    return (await this.find(tx.provider, tx.providerTxId))!;
  },

  /**
   * Bekor qiladi. 1 → -1 (so'rov PENDING qoladi — yana to'lanadi). 2 → qaytarish (`paymentService.refund`,
   * tizim nomidan) → -2, so'rov REFUNDED; qaytarib bo'lmasa `{ refused }` (tranzaksiya 2 da qoladi).
   * Allaqachon bekor bo'lsa — o'zgarishsiz.
   */
  async cancel(tx: ProviderTx, reason: number | null, client: ClientInfo): Promise<{ tx: ProviderTx } | { refused: string }> {
    if (tx.state === TX_STATE.CANCELLED || tx.state === TX_STATE.REFUNDED) return { tx };
    const now = new Date();
    if (tx.state === TX_STATE.CREATED) {
      await prisma.paymentProviderTransaction.updateMany({ where: { id: tx.id, state: TX_STATE.CREATED }, data: { state: TX_STATE.CANCELLED, cancelledAt: now, reason } });
      return { tx: (await this.find(tx.provider, tx.providerTxId))! };
    }
    if (!tx.paymentId) return { refused: 'Kvitansiya topilmadi' };
    try {
      await paymentService.refund(
        null,
        tx.paymentId,
        { amount: tx.amount.toNumber(), method: METHOD[tx.provider], reason: `${tx.provider} bekor qildi (${tx.providerTxId}${reason === null ? '' : `, sabab ${reason}`})` } as never,
        client,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ provider: tx.provider, providerTxId: tx.providerTxId, err: error }, 'Onlayn to‘lovni qaytarib bo‘lmadi');
      return { refused: message };
    }
    await prisma.$transaction([
      prisma.paymentProviderTransaction.update({ where: { id: tx.id }, data: { state: TX_STATE.REFUNDED, cancelledAt: now, reason } }),
      prisma.paymentIntent.update({ where: { id: tx.intentId }, data: { status: 'REFUNDED' } }),
    ]);
    return { tx: (await this.find(tx.provider, tx.providerTxId))! };
  },
};
