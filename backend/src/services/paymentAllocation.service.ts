import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { autoAllocate, parsePeriodKey, periodKeyOf } from '../utils/billingLedger.js';
import { moneyUz } from '../utils/money.js';
import type { AllocationItemInput } from '../validators/payment.validator.js';
import { openMonthCapacity } from './billingLedger.service.js';

/**
 * To'lovni oy majburiyatlariga biriktirish (`payment_allocations`). Hammasi chaqiruvchining tranzaksiyasida va
 * o'quvchining qarz qatori qulfi (`lockDebt`) ostida — parallel to'lovlar bir oy sig'imini ikki marta egallamaydi.
 */

type Tx = Prisma.TransactionClient;

export interface PlannedAllocation {
  key: string;
  amount: number;
}

const label = (key: string) => {
  const { year, month } = parsePeriodKey(key);
  return formatSalaryPeriod(year, month);
};

const invalid = (message: string) => AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'allocations', message }]);

/**
 * Yangi to'lov taqsimoti. `requested` bo'lmasa — eng eski ochiq oydan (sig'imdan ortgani biriktirilmaydi va
 * umumiy muddat tartibiga tushadi); bo'lsa — har oy sig'imi va yig'indi = to'lov summasi tekshiriladi.
 */
export async function planAllocations(
  tx: Tx,
  studentId: string,
  amount: number,
  requested: AllocationItemInput[] | undefined,
  excludePayment?: { id: string; net: number },
): Promise<PlannedAllocation[]> {
  const capacity = await openMonthCapacity(tx, studentId, excludePayment);
  if (!requested) return autoAllocate(capacity, amount);

  const total = requested.reduce((sum, item) => sum + item.amount, 0);
  if (total !== amount) {
    throw invalid(`Oylarga taqsimlangan summa (${moneyUz(total)}) to‘lov summasiga (${moneyUz(amount)}) teng bo‘lishi kerak`);
  }
  const open = new Map(capacity.map((item) => [item.key, item.remaining]));
  for (const item of requested) {
    const remaining = open.get(item.period);
    if (remaining === undefined) {
      throw invalid(`${label(item.period)} uchun ochiq to‘lov majburiyati yo‘q (to‘langan, bekor qilingan yoki jadvalda yo‘q)`);
    }
    if (item.amount > remaining) {
      throw invalid(`${label(item.period)} qoldig‘i ${moneyUz(remaining)} — undan ko‘p biriktirib bo‘lmaydi`);
    }
  }
  return requested.map((item) => ({ key: item.period, amount: item.amount }));
}

export async function writeAllocations(
  tx: Tx,
  input: { paymentId: string; studentId: string; effectiveAt: Date; createdById: string | null; refundId?: string },
  plan: PlannedAllocation[],
): Promise<void> {
  if (plan.length === 0) return;
  await tx.paymentAllocation.createMany({
    data: plan.map((item) => {
      const { year, month } = parsePeriodKey(item.key);
      return {
        paymentId: input.paymentId,
        studentId: input.studentId,
        periodYear: year,
        periodMonth: month,
        amount: item.amount,
        refundId: input.refundId ?? null,
        effectiveAt: input.effectiveAt,
        createdById: input.createdById,
      };
    }),
  });
}

/** To'lovning hozirgi sof taqsimoti (bekor belgilanmagan qatorlar, qaytarishlar ayrilgan): oy → summa */
export async function paymentAllocationNet(tx: Tx, paymentId: string): Promise<Map<string, number>> {
  const rows = await tx.paymentAllocation.groupBy({
    by: ['periodYear', 'periodMonth'],
    where: { paymentId, voidedAt: null },
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [periodKeyOf(row.periodYear, row.periodMonth), row._sum.amount?.toNumber() ?? 0]));
}

/**
 * Qaytarish taqsimoti: avval to'lovning biriktirilmagan qismi, keyin shu to'lovning eng kech oyidan boshlab
 * (manfiy qatorlar). `netBefore` — qaytarishdan oldingi sof to'lov (summa − avvalgi qaytarishlar).
 */
export async function allocateRefund(
  tx: Tx,
  input: { paymentId: string; studentId: string; refundId: string; amount: number; netBefore: number; refundedAt: Date; createdById: string | null },
): Promise<PlannedAllocation[]> {
  const net = await paymentAllocationNet(tx, input.paymentId);
  const allocated = [...net.values()].reduce((sum, value) => sum + value, 0);
  const unallocated = Math.max(input.netBefore - allocated, 0);
  let left = Math.max(input.amount - unallocated, 0);
  const plan: PlannedAllocation[] = [];
  for (const [key, value] of [...net].sort((a, b) => b[0].localeCompare(a[0]))) {
    if (left <= 0) break;
    const take = Math.min(value, left);
    if (take > 0) {
      plan.push({ key, amount: -take });
      left -= take;
    }
  }
  await writeAllocations(
    tx,
    { paymentId: input.paymentId, studentId: input.studentId, effectiveAt: input.refundedAt, createdById: input.createdById, refundId: input.refundId },
    plan,
  );
  return plan;
}
