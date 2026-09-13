import { prisma } from '../config/database.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { FinancialPeriodStatus, Prisma, TransactionType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessMonthRange, currentBusinessMonth } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { ClosePeriodInput, PeriodListQuery, ReopenPeriodInput } from '../validators/finance.validator.js';
import { auditService } from './audit.service.js';
import { OPERATING_LEDGER_WHERE } from './ledger.js';

/**
 * Moliyaviy oylar (promt 26-bo‘lim): oy yopilgandan keyin shu oy sanasi bilan pul yozuvi
 * qo‘shilmaydi va bekor qilinmaydi. Tuzatish ochiq oyda teskari yozuv (qaytarish, yangi xarajat) bilan.
 * Qayta ochish — alohida ruxsat (finance.reopen) va sabab bilan, auditga yoziladi.
 */

type Db = Prisma.TransactionClient;
type PersonRef = { id: string; firstName: string; lastName: string };

export interface PeriodTotalsDto {
  income: number;
  expense: number;
  refunds: number;
  /** tushum − xarajat − qaytarishlar */
  net: number;
  transactions: number;
}

export interface FinancialPeriodDto {
  year: number;
  month: number;
  label: string;
  status: FinancialPeriodStatus;
  isCurrent: boolean;
  /** Oy tugagan va ochiq */
  canClose: boolean;
  totals: PeriodTotalsDto;
  closedAt: string | null;
  closedBy: PersonRef | null;
  reopenedAt: string | null;
  reopenedBy: PersonRef | null;
  reopenReason: string | null;
}

const monthIndex = (year: number, month: number) => year * 12 + month;

/** Sana tushadigan moliyaviy oy yopilgan bo‘lsa — amal rad etiladi (409) */
export async function assertFinancialPeriodOpen(db: Db, date: Date): Promise<void> {
  const { year, month } = currentBusinessMonth(date);
  const period = await db.financialPeriod.findUnique({ where: { year_month: { year, month } }, select: { status: true } });
  if (period?.status === 'CLOSED') {
    throw AppError.conflict(
      `${formatSalaryPeriod(year, month)} moliyaviy oyi yopilgan — bu sana bilan pul yozuvini qo‘shib yoki bekor qilib bo‘lmaydi. Tuzatishni ochiq oyda qaytarish yoki yangi yozuv bilan kiriting`,
    );
  }
}

async function monthTotals(db: Db, year: number, month: number): Promise<PeriodTotalsDto> {
  const { start, end } = businessMonthRange(year, month);
  const grouped = await db.transaction.groupBy({
    by: ['type'],
    where: { ...OPERATING_LEDGER_WHERE, occurredAt: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const sum = (type: TransactionType) => grouped.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
  const income = sum('INCOME');
  const expense = sum('EXPENSE');
  const refunds = sum('REFUND');
  return {
    income,
    expense,
    refunds,
    net: income - expense - refunds,
    transactions: grouped.reduce((total, row) => total + row._count._all, 0),
  };
}

/**
 * Oy oxiridagi kassa qoldiqlari: hozirgi qoldiqdan oy tugagandan keyingi yozuvlar ayiriladi.
 * Keyinchalik bekor qilingan eski yozuvlar hisobga olinmaydi (ular yopilgan oyda bekor qilinmaydi).
 */
async function balancesAt(db: Db, end: Date): Promise<Array<{ id: string; name: string; balance: number }>> {
  const accounts = await db.financialAccount.findMany({ select: { id: true, name: true, balance: true }, orderBy: { sortOrder: 'asc' } });
  const later = await db.transaction.groupBy({
    by: ['accountId', 'type'],
    where: { status: 'COMPLETED', occurredAt: { gte: end }, accountId: { not: null } },
    _sum: { amount: true },
  });
  return accounts.map((account) => {
    const delta = later
      .filter((row) => row.accountId === account.id)
      .reduce((total, row) => {
        const amount = row._sum.amount?.toNumber() ?? 0;
        return total + (row.type === 'INCOME' || row.type === 'TRANSFER' ? amount : -amount);
      }, 0);
    return { id: account.id, name: account.name, balance: account.balance.toNumber() - delta };
  });
}

const periodSelect = {
  year: true,
  month: true,
  status: true,
  closedAt: true,
  reopenedAt: true,
  reopenReason: true,
  closedBy: { select: { id: true, firstName: true, lastName: true } },
  reopenedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.FinancialPeriodSelect;

type PeriodRecord = Prisma.FinancialPeriodGetPayload<{ select: typeof periodSelect }>;

function toDto(year: number, month: number, record: PeriodRecord | undefined, totals: PeriodTotalsDto): FinancialPeriodDto {
  const now = currentBusinessMonth();
  const status = record?.status ?? 'OPEN';
  return {
    year,
    month,
    label: formatSalaryPeriod(year, month),
    status,
    isCurrent: now.year === year && now.month === month,
    canClose: status === 'OPEN' && monthIndex(year, month) < monthIndex(now.year, now.month),
    totals,
    closedAt: record?.closedAt?.toISOString() ?? null,
    closedBy: record?.closedBy ?? null,
    reopenedAt: record?.reopenedAt?.toISOString() ?? null,
    reopenedBy: record?.reopenedBy ?? null,
    reopenReason: record?.reopenReason ?? null,
  };
}

export const financialPeriodService = {
  /** Yil bo‘yicha 12 oy: holat va yakunlar */
  async list(query: PeriodListQuery): Promise<FinancialPeriodDto[]> {
    const records = await prisma.financialPeriod.findMany({ where: { year: query.year }, select: periodSelect });
    const items: FinancialPeriodDto[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const totals = await monthTotals(prisma, query.year, month);
      items.push(toDto(query.year, month, records.find((record) => record.month === month), totals));
    }
    return items;
  },

  async close(actor: AuthUser, input: ClosePeriodInput, client: ClientInfo): Promise<FinancialPeriodDto> {
    const now = currentBusinessMonth();
    if (monthIndex(input.year, input.month) >= monthIndex(now.year, now.month)) {
      throw AppError.unprocessable('Faqat tugagan oyni yopish mumkin');
    }
    const existing = await prisma.financialPeriod.findUnique({
      where: { year_month: { year: input.year, month: input.month } },
      select: { status: true },
    });
    if (existing?.status === 'CLOSED') {
      throw AppError.conflict('Bu oy allaqachon yopilgan');
    }

    const label = formatSalaryPeriod(input.year, input.month);
    await prisma.$transaction(async (tx) => {
      const totals = await monthTotals(tx, input.year, input.month);
      const balances = await balancesAt(tx, businessMonthRange(input.year, input.month).end);
      const closedAt = new Date();
      const summary = { ...totals, balances, closedAt: closedAt.toISOString() };
      await tx.financialPeriod.upsert({
        where: { year_month: { year: input.year, month: input.month } },
        create: { year: input.year, month: input.month, status: 'CLOSED', summary, closedAt, closedById: actor.id },
        update: { status: 'CLOSED', summary, closedAt, closedById: actor.id },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'finance.period_closed',
        entityType: 'financialPeriod',
        entityId: `${input.year}-${String(input.month).padStart(2, '0')}`,
        metadata: { period: label, ...totals },
        ...client,
      });
    });

    return this.one(input.year, input.month);
  },

  async reopen(actor: AuthUser, input: ReopenPeriodInput, client: ClientInfo): Promise<FinancialPeriodDto> {
    const existing = await prisma.financialPeriod.findUnique({
      where: { year_month: { year: input.year, month: input.month } },
      select: { status: true, summary: true },
    });
    if (existing?.status !== 'CLOSED') {
      throw AppError.conflict('Bu oy yopilmagan');
    }

    await prisma.$transaction(async (tx) => {
      await tx.financialPeriod.update({
        where: { year_month: { year: input.year, month: input.month } },
        data: { status: 'OPEN', reopenedAt: new Date(), reopenedById: actor.id, reopenReason: input.reason },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'finance.period_reopened',
        entityType: 'financialPeriod',
        entityId: `${input.year}-${String(input.month).padStart(2, '0')}`,
        metadata: { period: formatSalaryPeriod(input.year, input.month), reason: input.reason, summaryAtClose: existing.summary },
        ...client,
      });
    });

    return this.one(input.year, input.month);
  },

  async one(year: number, month: number): Promise<FinancialPeriodDto> {
    const record = await prisma.financialPeriod.findUnique({ where: { year_month: { year, month } }, select: periodSelect });
    return toDto(year, month, record ?? undefined, await monthTotals(prisma, year, month));
  },
};
