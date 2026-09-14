import { prisma } from '../config/database.js';
import type { PaymentMethod, Prisma } from '../generated/prisma/client.js';

/**
 * Sof tushum yordamchilari.
 *
 * Qaytarilgan pul kassa usulida hisoblanadi: to‘lov sanasi emas, qaytarish sanasi bo‘yicha
 * ayriladi. Sof tushum = davrda qabul qilingan to‘lovlar − shu davrda qaytarilgan summa.
 * O‘chirilgan to‘lovlarning qaytarishlari ham hisobga olinmaydi — to‘lovning o‘zi ham kirmaydi.
 */

function refundWhere(
  refundedAt: Prisma.DateTimeFilter | undefined,
  payment: Prisma.PaymentWhereInput,
): Prisma.PaymentRefundWhereInput {
  return {
    ...(refundedAt ? { refundedAt } : {}),
    transaction: { status: 'COMPLETED' },
    payment: { deletedAt: null, ...payment },
  };
}

/** Davrda qaytarilgan jami summa */
export async function refundTotal(
  refundedAt: Prisma.DateTimeFilter | undefined,
  payment: Prisma.PaymentWhereInput = {},
): Promise<number> {
  const aggregate = await prisma.paymentRefund.aggregate({
    where: refundWhere(refundedAt, payment),
    _sum: { amount: true },
  });
  return aggregate._sum.amount?.toNumber() ?? 0;
}

export type RefundGroupKey = 'managerId' | 'courseId' | 'teacherId' | 'studentId';

/** Qaytarilgan summa to‘lovning manager / kurs / o‘qituvchi / o‘quvchisi bo‘yicha */
export async function refundsBy(
  key: RefundGroupKey,
  refundedAt: Prisma.DateTimeFilter | undefined,
  payment: Prisma.PaymentWhereInput = {},
): Promise<Map<string, number>> {
  const rows = await prisma.paymentRefund.findMany({
    where: refundWhere(refundedAt, payment),
    select: { amount: true, payment: { select: { managerId: true, courseId: true, teacherId: true, studentId: true } } },
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    const id = row.payment[key];
    if (!id) continue;
    totals.set(id, (totals.get(id) ?? 0) + row.amount.toNumber());
  }
  return totals;
}

/** Davrlarga taqsimlash uchun qaytarishlar ro‘yxati */
export async function refundRows(
  refundedAt: Prisma.DateTimeFilter | undefined,
  payment: Prisma.PaymentWhereInput = {},
): Promise<Array<{ refundedAt: Date; amount: number; method: PaymentMethod }>> {
  const rows = await prisma.paymentRefund.findMany({
    where: refundWhere(refundedAt, payment),
    select: { refundedAt: true, amount: true, method: true },
  });
  return rows.map((row) => ({ refundedAt: row.refundedAt, amount: row.amount.toNumber(), method: row.method }));
}
