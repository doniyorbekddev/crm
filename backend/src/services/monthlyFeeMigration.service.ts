import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { parsePeriodKey, periodKeyOf } from '../utils/billingLedger.js';
import { planMonthlyFeeMigration } from '../utils/monthlyFeeMigration.js';
import type { MonthlyFeeMigrationPlan } from '../utils/monthlyFeeMigration.js';
import { BILLING_START_MONTH } from '../utils/paymentSchedule.js';
import { auditService } from './audit.service.js';
import { syncContractTotal } from './paymentSchedule.service.js';

/**
 * Mavjud o'quvchilarni oylik to'lov modeliga o'tkazish (bir martalik, 2026-11). Har o'quvchi alohida tranzaksiyada:
 * reja ({@link planMonthlyFeeMigration}) → qismlar summasi/bekor qilish → eski oy taqsimoti bekor (`voidedAt`, o'chirilmaydi)
 * → yangi taqsimot → shartnoma jami summasi (`syncContractTotal`) → audit. To'lovlar va to'langan summa o'zgarmaydi.
 * Takror ishga tushirilsa — o'zgarish bo'lmagan o'quvchi o'tkazib yuboriladi.
 */

const CANCEL_REASON = 'To‘lov hisobi 2026-yil oktyabrdan boshlanadi';

export interface MonthlyFeeMigrationRow {
  studentId: string;
  name: string;
  monthly: number;
  paid: number;
  plan: MonthlyFeeMigrationPlan;
  changed: boolean;
}

type Tx = Prisma.TransactionClient;

async function loadStudent(client: Tx | typeof prisma, studentId: string) {
  return client.student.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      contractPrice: true,
      debt: { select: { paidAmount: true } },
      installments: { select: { id: true, dueDate: true, amount: true, cancelledAt: true } },
      payments: { where: { deletedAt: null }, select: { id: true, amount: true, paidAt: true, refunds: { select: { amount: true } } } },
      allocations: { where: { voidedAt: null }, select: { paymentId: true, periodYear: true, periodMonth: true, amount: true } },
    },
  });
}

function planFor(student: Awaited<ReturnType<typeof loadStudent>>, closedMonths: ReadonlySet<string>): MonthlyFeeMigrationRow {
  const plan = planMonthlyFeeMigration({
    monthly: student.contractPrice.toNumber(),
    installments: student.installments.map((row) => ({
      id: row.id,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      amount: row.amount.toNumber(),
      cancelled: row.cancelledAt !== null,
    })),
    payments: student.payments.map((payment) => ({
      id: payment.id,
      paidAt: payment.paidAt.toISOString(),
      net: payment.amount.toNumber() - payment.refunds.reduce((sum, refund) => sum + refund.amount.toNumber(), 0),
    })),
    closedMonths,
    startMonth: BILLING_START_MONTH,
  });
  // Taqsimot o'zgardimi: joriy (bekor qilinmagan) qatorlarning sof yig'indisi to'lov × oy bo'yicha solishtiriladi
  const current = new Map<string, number>();
  for (const row of student.allocations) {
    const key = `${row.paymentId}|${periodKeyOf(row.periodYear, row.periodMonth)}`;
    current.set(key, (current.get(key) ?? 0) + row.amount.toNumber());
  }
  const next = new Map(plan.allocations.map((item) => [`${item.paymentId}|${item.key}`, item.amount]));
  const sameAllocations = [...current].filter(([, amount]) => amount !== 0).length === next.size && [...next].every(([key, amount]) => current.get(key) === amount);
  return {
    studentId: student.id,
    name: `${student.lastName} ${student.firstName}`,
    monthly: student.contractPrice.toNumber(),
    paid: student.debt?.paidAmount.toNumber() ?? 0,
    plan,
    changed: plan.cancel.length > 0 || plan.reprice.length > 0 || !sameAllocations,
  };
}

async function closedMonthKeys(client: Tx | typeof prisma): Promise<Set<string>> {
  const rows = await client.financialPeriod.findMany({ where: { status: { not: 'OPEN' } }, select: { year: true, month: true } });
  return new Set(rows.map((row) => periodKeyOf(row.year, row.month)));
}

export async function migrateToMonthlyFee(options: { apply: boolean; actorId: string | null; now?: Date }): Promise<MonthlyFeeMigrationRow[]> {
  const now = options.now ?? new Date();
  const closed = await closedMonthKeys(prisma);
  const students = await prisma.student.findMany({ where: { deletedAt: null, debt: { isNot: null } }, select: { id: true }, orderBy: { number: 'asc' } });
  const rows: MonthlyFeeMigrationRow[] = [];

  for (const { id } of students) {
    if (!options.apply) {
      rows.push(planFor(await loadStudent(prisma, id), closed));
      continue;
    }
    const row = await prisma.$transaction(async (tx) => {
      // Qarz qatori qulfi: parallel to'lov bilan poyga bo'lmasin
      await tx.$queryRaw`SELECT "id" FROM "debts" WHERE "studentId" = ${id} FOR UPDATE`;
      const result = planFor(await loadStudent(tx, id), closed);
      if (!result.changed) return result;
      const { plan } = result;
      if (plan.cancel.length > 0) {
        await tx.paymentInstallment.updateMany({
          where: { id: { in: plan.cancel.map((item) => item.id) }, cancelledAt: null },
          data: { cancelledAt: now, cancelledById: options.actorId, cancelReason: CANCEL_REASON },
        });
      }
      for (const item of plan.reprice) {
        await tx.paymentInstallment.update({ where: { id: item.id }, data: { amount: item.to } });
      }
      const voided = await tx.paymentAllocation.updateMany({ where: { studentId: id, voidedAt: null }, data: { voidedAt: now, voidedById: options.actorId } });
      const paidAt = new Map((await tx.payment.findMany({ where: { studentId: id }, select: { id: true, paidAt: true } })).map((payment) => [payment.id, payment.paidAt]));
      if (plan.allocations.length > 0) {
        await tx.paymentAllocation.createMany({
          data: plan.allocations.map((item) => {
            const { year, month } = parsePeriodKey(item.key);
            return {
              paymentId: item.paymentId,
              studentId: id,
              periodYear: year,
              periodMonth: month,
              amount: item.amount,
              effectiveAt: paidAt.get(item.paymentId) ?? now,
              createdById: options.actorId,
            };
          }),
        });
      }
      const total = await syncContractTotal(tx, id);
      await auditService.recordInTransaction(tx, {
        userId: options.actorId,
        action: 'billing.monthly_fee_migrated',
        entityType: 'student',
        entityId: id,
        metadata: {
          monthly: result.monthly,
          totalBefore: plan.totalBefore,
          totalAfter: total,
          cancelledMonths: plan.cancel.map((item) => item.key),
          repriced: plan.reprice.length,
          untouched: plan.untouched,
          allocationsVoided: voided.count,
          allocationsCreated: plan.allocations.length,
          unallocated: plan.unallocated,
        },
        ip: null,
        userAgent: 'cli: monthlyFeeMigration',
      });
      return result;
    });
    rows.push(row);
  }
  return rows;
}
