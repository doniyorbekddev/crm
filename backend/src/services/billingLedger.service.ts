import { prisma } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';
import { computeStudentLedger, periodKeyOf } from '../utils/billingLedger.js';
import type {
  LedgerAllocationInput,
  LedgerInstallmentInput,
  LedgerPaymentInput,
  LedgerRefundInput,
  StudentLedger,
} from '../utils/billingLedger.js';

/**
 * Oylik hisob uchun bazadan o'qish (qoida — `utils/billingLedger.ts`). Ko'p o'quvchi bir martada yuklanadi.
 */

type Client = Prisma.TransactionClient | typeof prisma;

export interface LedgerInputs {
  installments: LedgerInstallmentInput[];
  payments: LedgerPaymentInput[];
  refunds: LedgerRefundInput[];
  allocations: LedgerAllocationInput[];
  /** `Debt.paidAmount` — hozirgi holat uchun (qarzdorlar ro'yxati va jadval bilan bir xil manba) */
  debtPaid: number | null;
}

const emptyInputs = (): LedgerInputs => ({ installments: [], payments: [], refunds: [], allocations: [], debtPaid: null });

export async function loadLedgerInputs(client: Client, studentIds: string[]): Promise<Map<string, LedgerInputs>> {
  const result = new Map<string, LedgerInputs>(studentIds.map((id) => [id, emptyInputs()]));
  if (studentIds.length === 0) return result;
  const where = { studentId: { in: studentIds } };
  // Ketma-ket: tranzaksiya mijozida parallel so'rov navbatga tushadi va pg ogohlantiradi
  const installments = await client.paymentInstallment.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }],
    select: { id: true, studentId: true, sequence: true, dueDate: true, amount: true, note: true, cancelledAt: true, cancelReason: true },
  });
  const payments = await client.payment.findMany({
    where,
    select: { id: true, studentId: true, number: true, amount: true, paidAt: true, deletedAt: true },
  });
  const refunds = await client.paymentRefund.findMany({
    where: { payment: where },
    select: { id: true, paymentId: true, amount: true, refundedAt: true, payment: { select: { studentId: true } } },
  });
  const allocations = await client.paymentAllocation.findMany({
    where,
    select: { studentId: true, paymentId: true, periodYear: true, periodMonth: true, amount: true, refundId: true, effectiveAt: true, voidedAt: true },
  });
  const debts = await client.debt.findMany({ where, select: { studentId: true, paidAmount: true } });
  const of = (studentId: string) => {
    let entry = result.get(studentId);
    if (!entry) {
      entry = emptyInputs();
      result.set(studentId, entry);
    }
    return entry;
  };
  for (const row of installments) {
    of(row.studentId).installments.push({
      id: row.id,
      sequence: row.sequence,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      amount: row.amount.toNumber(),
      cancelled: row.cancelledAt !== null,
      note: row.note,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
    });
  }
  for (const row of payments) {
    of(row.studentId).payments.push({ id: row.id, number: row.number, amount: row.amount.toNumber(), paidAt: row.paidAt, deletedAt: row.deletedAt });
  }
  for (const row of refunds) {
    of(row.payment.studentId).refunds.push({ id: row.id, paymentId: row.paymentId, amount: row.amount.toNumber(), refundedAt: row.refundedAt });
  }
  for (const row of allocations) {
    of(row.studentId).allocations.push({
      paymentId: row.paymentId,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      amount: row.amount.toNumber(),
      refundId: row.refundId,
      effectiveAt: row.effectiveAt,
      voidedAt: row.voidedAt,
    });
  }
  for (const row of debts) of(row.studentId).debtPaid = row.paidAmount.toNumber();
  return result;
}

/**
 * O'quvchi hisobi. `asOf` berilmasa — hozirgi holat va jami to'langan `Debt.paidAmount` dan (jadval va qarzdorlar
 * ro'yxati bilan bir manba); berilsa — o'sha paytdagi to'lov, qaytarish, biriktirish va bekor qilishlardan.
 */
export function ledgerOf(inputs: LedgerInputs, asOf: Date | null = null): StudentLedger {
  const ledger = computeStudentLedger({ ...inputs, asOf });
  if (asOf !== null || inputs.debtPaid === null || inputs.debtPaid === ledger.paidTotal) return ledger;
  // To'lovlar tarixidan farq qilsa (qo'lda tuzatilgan eski yozuv) — hozirgi holat qarz qatoriga moslanadi
  return computeStudentLedger({
    ...inputs,
    asOf: null,
    payments: [
      ...inputs.payments,
      { id: '__balance__', number: 0, amount: inputs.debtPaid - ledger.paidTotal, paidAt: new Date(0), deletedAt: null },
    ],
  });
}

/**
 * Bitta o'quvchining oylari bo'yicha hozirgi ochiq sig'im (bekor qilinmagan, qolgan summa > 0).
 * `excludePayment` — qayta taqsimlanayotgan to'lov hisobdan butunlay chiqariladi (uning puli boshqa oylarni egallamasin).
 */
export async function openMonthCapacity(
  client: Client,
  studentId: string,
  excludePayment?: { id: string; net: number },
): Promise<Array<{ key: string; remaining: number }>> {
  let inputs = (await loadLedgerInputs(client, [studentId])).get(studentId)!;
  if (excludePayment) {
    inputs = {
      ...inputs,
      payments: inputs.payments.filter((payment) => payment.id !== excludePayment.id),
      refunds: inputs.refunds.filter((refund) => refund.paymentId !== excludePayment.id),
      allocations: inputs.allocations.filter((row) => row.paymentId !== excludePayment.id),
      debtPaid: inputs.debtPaid === null ? null : inputs.debtPaid - excludePayment.net,
    };
  }
  return ledgerOf(inputs)
    .months.filter((month) => month.remaining > 0)
    .map((month) => ({ key: month.key, remaining: month.remaining }));
}

/** Oyga aniq biriktirilgan sof summa (hozir): "2026-10" → so'm */
export async function explicitByMonth(client: Client, studentId: string): Promise<Map<string, number>> {
  const rows = await client.paymentAllocation.groupBy({
    by: ['periodYear', 'periodMonth'],
    where: { studentId, voidedAt: null, payment: { deletedAt: null } },
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [periodKeyOf(row.periodYear, row.periodMonth), row._sum.amount?.toNumber() ?? 0]));
}

/**
 * Qismlar holati SQL da (ko'p o'quvchi — qarzdorlar ro'yxati, alertlar): `distributePaid` bilan bir xil qoida.
 * `filter` — `i."studentId"` bo'yicha shart.
 */
export function installmentPositionsSql(filter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    WITH inst AS (
      SELECT i."id", i."studentId", i."dueDate", i."sequence", i."amount",
        EXTRACT(YEAR FROM i."dueDate")::int AS "y", EXTRACT(MONTH FROM i."dueDate")::int AS "m"
      FROM "payment_installments" i
      JOIN "students" s ON s."id" = i."studentId" AND s."deletedAt" IS NULL
      WHERE i."cancelledAt" IS NULL ${filter}
    ), explicit AS (
      SELECT a."studentId", a."periodYear" AS "y", a."periodMonth" AS "m", GREATEST(SUM(a."amount"), 0) AS "amt"
      FROM "payment_allocations" a
      JOIN "payments" p ON p."id" = a."paymentId" AND p."deletedAt" IS NULL
      WHERE a."voidedAt" IS NULL AND a."studentId" IN (SELECT "studentId" FROM inst)
      GROUP BY a."studentId", a."periodYear", a."periodMonth"
    ), within AS (
      SELECT inst.*, COALESCE(e."amt", 0) AS "emonth",
        SUM(inst."amount") OVER (PARTITION BY inst."studentId", inst."y", inst."m" ORDER BY inst."dueDate", inst."sequence") AS "mcum"
      FROM inst
      LEFT JOIN explicit e ON e."studentId" = inst."studentId" AND e."y" = inst."y" AND e."m" = inst."m"
    ), applied AS (
      SELECT w.*, LEAST(w."amount", GREATEST(w."emonth" - (w."mcum" - w."amount"), 0)) AS "epaid" FROM within w
    ), pool AS (
      SELECT d."studentId", GREATEST(d."paidAmount" - COALESCE(SUM(ap."epaid"), 0), 0) AS "pool"
      FROM "debts" d
      JOIN applied ap ON ap."studentId" = d."studentId"
      GROUP BY d."studentId", d."paidAmount"
    ), capacity AS (
      SELECT ap.*, ap."amount" - ap."epaid" AS "cap",
        SUM(ap."amount" - ap."epaid") OVER (PARTITION BY ap."studentId" ORDER BY ap."dueDate", ap."sequence") AS "ccum"
      FROM applied ap
    )
    SELECT c."studentId", c."dueDate", c."amount",
      c."cap" - LEAST(c."cap", GREATEST(pl."pool" - (c."ccum" - c."cap"), 0)) AS "remaining"
    FROM capacity c
    JOIN pool pl ON pl."studentId" = c."studentId"
  `;
}

/**
 * Muddati kelgan (bugun yoki oldin), to'lanmagan oy majburiyatlari yig'indisi va qarzdorlar soni — "qarz" ning
 * qarzdorlik sahifasidagi ma'nosi (qaror 1). Jadvali yo'q eski shartnomada — shartnoma qoldig'i. `branchId` — filial doirasi.
 */
export async function dueDebtTotals(today: string, branchId: string | null): Promise<{ total: number; debtors: number }> {
  const filter = branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty;
  const [row] = await prisma.$queryRaw<Array<{ total: unknown; debtors: unknown }>>`
    WITH positions AS (${installmentPositionsSql(filter)}),
    scheduled AS (
      SELECT COALESCE(SUM(p."remaining") FILTER (WHERE p."dueDate" <= ${today}::date AND p."remaining" > 0), 0) AS "total",
        COUNT(DISTINCT p."studentId") FILTER (WHERE p."dueDate" <= ${today}::date AND p."remaining" > 0) AS "debtors"
      FROM positions p
    ),
    -- Jadvali umuman yo'q (eski) shartnoma: qarz = shartnoma qoldig'i (o'quvchi kartasidagi qoida bilan bir xil)
    unscheduled AS (
      SELECT COALESCE(SUM(d."remainingAmount"), 0) AS "total", COUNT(*) AS "debtors"
      FROM "debts" d
      JOIN "students" s ON s."id" = d."studentId" AND s."deletedAt" IS NULL
      WHERE d."remainingAmount" > 0 ${filter}
        AND NOT EXISTS (SELECT 1 FROM "payment_installments" i WHERE i."studentId" = d."studentId")
    )
    SELECT scheduled."total" + unscheduled."total" AS "total", scheduled."debtors" + unscheduled."debtors" AS "debtors"
    FROM scheduled, unscheduled
  `;
  return { total: Number(row?.total ?? 0), debtors: Number(row?.debtors ?? 0) };
}
