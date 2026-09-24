import { prisma } from '../../config/database.js';
import type { PaymentIntentStatus, PaymentProviderKey, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { moneyUz } from '../../utils/money.js';
import { toSkipTake } from '../../utils/pagination.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { auditService } from '../audit.service.js';
import { paymentService } from '../payment.service.js';
import { sandboxProvider } from './sandbox.provider.js';
import type { PaymentProvider } from './provider.js';

/**
 * Onlayn to'lov oqimi.
 *
 * ```
 * So'rov (intent)  →  Provayder  →  Webhook  →  Imzo tekshiruvi
 *                                            →  Takrorlanish tekshiruvi
 *                                            →  Kvitansiya (mavjud paymentService)
 *                                            →  Qarz qayta hisobi + bildirishnoma + audit
 * ```
 *
 * Tamoyillar:
 *  - **Pul yo'li bitta:** kvitansiya va daftar yozuvini mavjud `paymentService.create` yaratadi.
 *    Shu sababli qarz, komissiya, bildirishnoma va audit oddiy to'lov bilan bir xil ishlaydi.
 *  - **Takroriy webhook xavfsiz:** `(provider, externalId)` unikal va `Payment.idempotencyKey`
 *    ham shu kalitdan tuziladi — xabar necha marta kelsa ham kvitansiya bitta bo'ladi.
 *  - **Imzosiz so'rov o'tmaydi:** provayder sozlanmagan bo'lsa yo'l umuman yopiq (503).
 *  - **To'lov o'chirilmaydi:** bekor qilingan so'rov `CANCELLED` bo'lib qoladi, kvitansiya esa
 *    mavjud `paymentService` qoidasi bo'yicha bekor qilinadi (yozuv qolади).
 */

/** Ro'yxatga olingan provayderlar. Click/Payme qo'shilganda shu ro'yxatga bitta qator qo'shiladi. */
const PROVIDERS = new Map<PaymentProviderKey, PaymentProvider>([[sandboxProvider.key, sandboxProvider]]);

export function findProvider(key: string): PaymentProvider | undefined {
  return PROVIDERS.get(key.toUpperCase() as PaymentProviderKey);
}

/** Provayder kalitini CRM to'lov usuliga bog'laydi */
const METHOD_BY_PROVIDER: Record<PaymentProviderKey, 'CLICK' | 'PAYME' | 'UZUM' | 'OTHER'> = {
  CLICK: 'CLICK',
  PAYME: 'PAYME',
  UZUM: 'UZUM',
  SANDBOX: 'OTHER',
};

const intentSelect = {
  id: true,
  provider: true,
  externalId: true,
  amount: true,
  status: true,
  paymentId: true,
  failureText: true,
  paidAt: true,
  createdAt: true,
  student: { select: { id: true, number: true, firstName: true, lastName: true } },
} satisfies Prisma.PaymentIntentSelect;

type IntentRecord = Prisma.PaymentIntentGetPayload<{ select: typeof intentSelect }>;

export interface PaymentIntentDto {
  id: string;
  provider: PaymentProviderKey;
  externalId: string;
  amount: number;
  status: PaymentIntentStatus;
  paymentId: string | null;
  failureText: string | null;
  paidAt: string | null;
  createdAt: string;
  student: { id: string; number: number; name: string };
}

function toDto(record: IntentRecord): PaymentIntentDto {
  return {
    id: record.id,
    provider: record.provider,
    externalId: record.externalId,
    amount: record.amount.toNumber(),
    status: record.status,
    paymentId: record.paymentId,
    failureText: record.failureText,
    paidAt: record.paidAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    student: {
      id: record.student.id,
      number: record.student.number,
      name: `${record.student.firstName} ${record.student.lastName}`,
    },
  };
}

/** Webhook natijasi — controller shu asosida javob qaytaradi */
export interface WebhookOutcome {
  status: 'ok' | 'duplicate' | 'rejected';
  intent: PaymentIntentDto | null;
  message: string;
}

export const onlinePaymentService = {
  /** Sozlangan provayderlar ro'yxati (UI "onlayn to'lov yoqilganmi?" deb so'raganda) */
  providers(): Array<{ key: PaymentProviderKey; configured: boolean }> {
    return [...PROVIDERS.values()].map((provider) => ({ key: provider.key, configured: provider.isConfigured() }));
  },

  async list(query: { page: number; limit: number; status?: PaymentIntentStatus | undefined; studentId?: string | undefined }): Promise<{
    items: PaymentIntentDto[];
    total: number;
  }> {
    const where: Prisma.PaymentIntentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.paymentIntent.findMany({ where, select: intentSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query.page, query.limit) }),
      prisma.paymentIntent.count({ where }),
    ]);
    return { items: items.map(toDto), total };
  },

  /**
   * CRM ichidan to'lov so'rovi yaratish (masalan o'quvchiga havola yuborish uchun).
   * Provayder bilan haqiqiy so'rov almashinuvi provayder ulangach shu yerga qo'shiladi.
   */
  async createIntent(
    actor: AuthUser,
    input: { provider: PaymentProviderKey; studentId: string; amount: number; externalId?: string | undefined },
    client: ClientInfo,
  ): Promise<PaymentIntentDto> {
    const provider = PROVIDERS.get(input.provider);
    if (!provider) throw AppError.unprocessable('Bunday to‘lov provayderi yo‘q');
    if (!provider.isConfigured()) throw AppError.unprocessable(`${input.provider} provayderi sozlanmagan`);

    const student = await prisma.student.findFirst({ where: { id: input.studentId, deletedAt: null }, select: { id: true } });
    if (!student) throw AppError.unprocessable('O‘quvchi topilmadi', [{ field: 'studentId', message: 'O‘quvchi topilmadi' }]);

    // Provayder o'z raqamini bermaguncha vaqtincha kalit ishlatiladi
    const externalId = input.externalId ?? `crm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.paymentIntent.create({
        data: {
          provider: input.provider,
          externalId,
          studentId: input.studentId,
          amount: input.amount,
          createdById: actor.id,
        },
        select: intentSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'payment.intent_created',
        entityType: 'student',
        entityId: input.studentId,
        metadata: { intentId: record.id, provider: input.provider, amount: input.amount },
        ...client,
      });
      return record;
    });
    return toDto(created);
  },

  /**
   * Webhookni qayta ishlaydi. Imzo **controllerda** tekshiriladi (u xom tanani ko'radi),
   * bu yerda esa takrorlanish, so'rovni topish va kvitansiya yaratish bajariladi.
   */
  async handleWebhook(provider: PaymentProvider, body: unknown, client: ClientInfo): Promise<WebhookOutcome> {
    const parsed = provider.parseWebhook(body);

    // 1) Takroriy webhook — provayder javobni olmagan bo'lsa qayta yuboradi
    const existing = await prisma.paymentIntent.findUnique({
      where: { provider_externalId: { provider: provider.key, externalId: parsed.externalId } },
      select: intentSelect,
    });
    if (existing && existing.status !== 'PENDING') {
      logger.info({ provider: provider.key, externalId: parsed.externalId }, 'Takroriy to‘lov webhooki — o‘tkazib yuborildi');
      return { status: 'duplicate', intent: toDto(existing), message: 'Bu to‘lov allaqachon qayta ishlangan' };
    }

    // 2) So'rovni topamiz yoki provayder to'g'ridan-to'g'ri to'lov yuborgan bo'lsa yaratamiz
    let intent = existing;
    if (!intent) {
      const studentId = parsed.studentId ?? (parsed.intentId ? undefined : undefined);
      if (parsed.intentId) {
        const byId = await prisma.paymentIntent.findUnique({ where: { id: parsed.intentId }, select: intentSelect });
        if (!byId) throw AppError.unprocessable('To‘lov so‘rovi topilmadi');
        if (byId.status !== 'PENDING') {
          return { status: 'duplicate', intent: toDto(byId), message: 'Bu to‘lov allaqachon qayta ishlangan' };
        }
        // Provayder o'z raqamini shu yerda bildiradi
        intent = await prisma.paymentIntent.update({
          where: { id: byId.id },
          data: { externalId: parsed.externalId },
          select: intentSelect,
        });
      } else {
        if (!studentId) throw AppError.unprocessable('To‘lov qaysi o‘quvchiga tegishli ekani ko‘rsatilmagan');
        const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { id: true } });
        if (!student) throw AppError.unprocessable('O‘quvchi topilmadi');
        intent = await prisma.paymentIntent.create({
          data: { provider: provider.key, externalId: parsed.externalId, studentId, amount: parsed.amount },
          select: intentSelect,
        });
      }
    }

    // 3) Summa mos kelishi shart — provayder boshqa summa yuborsa to'lov yozilmaydi
    if (Math.round(intent.amount.toNumber()) !== parsed.amount) {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureText: `Summa mos kelmadi: kutilgan ${intent.amount.toNumber()}, kelgan ${parsed.amount}` },
      });
      throw AppError.unprocessable('To‘lov summasi so‘rovdagi summaga mos kelmadi');
    }

    // 4) Muvaffaqiyatsiz natija — kvitansiya yaratilmaydi
    if (parsed.outcome !== 'paid') {
      const updated = await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: parsed.outcome === 'cancelled' ? 'CANCELLED' : 'FAILED',
          failureText: parsed.failureText ?? null,
          payload: body as Prisma.InputJsonValue,
        },
        select: intentSelect,
      });
      return { status: 'rejected', intent: toDto(updated), message: 'To‘lov amalga oshmadi' };
    }

    // 5) Kvitansiya — mavjud servis orqali (qarz, komissiya, bildirishnoma, audit o'sha yerda).
    //    `actor = null`: pulni xodim qo'lda qabul qilmagan.
    let payment: { id: string };
    try {
      const result = await paymentService.create(
        null,
        {
          studentId: intent.student.id,
          amount: parsed.amount,
          method: METHOD_BY_PROVIDER[provider.key],
          comment: `${provider.key} orqali onlayn to‘lov (${parsed.externalId})`,
          // Kalit provayder raqamidan tuziladi: webhook takrorlansa ikkinchi kvitansiya yaratilmaydi
          idempotencyKey: `${provider.key}-${parsed.externalId}`.slice(0, 64),
        } as never,
        client,
      );
      payment = result.payment;
    } catch (error) {
      // Kvitansiya yozilmadi (masalan moliyaviy oy yopilgan). Pul provayderda — shuning uchun
      // so'rov "muvaffaqiyatsiz" deb belgilanadi va xodim uni ro'yxatda ko'radi.
      // Provayderga 200 qaytariladi: qayta yuborish ham xuddi shu xatoga uchraydi.
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, provider: provider.key, externalId: parsed.externalId }, 'Onlayn to‘lov kvitansiyasi yozilmadi');
      const failed = await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureText: message.slice(0, 255), payload: body as Prisma.InputJsonValue },
        select: intentSelect,
      });
      return { status: 'rejected', intent: toDto(failed), message: `To‘lov yozilmadi: ${message}` };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PAID', paymentId: payment.id, paidAt: new Date(), payload: body as Prisma.InputJsonValue, failureText: null },
        select: intentSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: null,
        action: 'payment.online_received',
        entityType: 'student',
        entityId: intent.student.id,
        metadata: {
          provider: provider.key,
          externalId: parsed.externalId,
          amount: parsed.amount,
          paymentId: payment.id,
          intentId: intent.id,
        },
        ...client,
      });
      return record;
    });

    logger.info(
      { provider: provider.key, externalId: parsed.externalId, amount: parsed.amount },
      `Onlayn to‘lov qabul qilindi: ${moneyUz(parsed.amount)}`,
    );
    return { status: 'ok', intent: toDto(updated), message: 'To‘lov qabul qilindi' };
  },
};
