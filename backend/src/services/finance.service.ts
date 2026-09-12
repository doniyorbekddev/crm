import { prisma } from '../config/database.js';
import type { AccountType, Prisma, TransactionStatus, TransactionType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, businessDateString, startOfBusinessDay, startOfBusinessMonth } from '../utils/dates.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  AccountInput,
  CashFlowQuery,
  FinanceRangeQuery,
  TransactionListQuery,
  TransferInput,
  UpdateAccountInput,
  VoidTransactionInput,
} from '../validators/finance.validator.js';
import { auditService } from './audit.service.js';
import { OPERATING_LEDGER_WHERE, recordTransaction, voidTransaction } from './ledger.js';

/** Maosh xarajatlari shu kategoriya nomi bilan yoziladi */
const SALARY_CATEGORY = 'O‘qituvchi maoshi';
const MARKETING_CATEGORY_KEY = 'ADVERTISEMENT';

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface AccountDto {
  id: string;
  key: string;
  name: string;
  type: AccountType;
  balance: number;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
  /** Tanlangan davrdagi harakat */
  income: number;
  expense: number;
  transactions: number;
}

export interface TransactionDto {
  id: string;
  number: number;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  occurredAt: string;
  description: string | null;
  categoryName: string | null;
  entityType: string | null;
  entityId: string | null;
  account: { id: string; name: string; type: AccountType } | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface FinanceSummaryDto {
  from: string;
  to: string;
  income: number;
  expense: number;
  netProfit: number;
  /** Foyda marjasi (%) */
  margin: number;
  teacherSalary: number;
  marketing: number;
  otherExpense: number;
  studentPayments: number;
  otherIncome: number;
  /** Barcha kassalardagi joriy qoldiq */
  totalBalance: number;
  totalDebt: number;
  incomeByCategory: Array<{ name: string; total: number; count: number }>;
  expenseByCategory: Array<{ name: string; total: number; count: number }>;
}

export interface CashFlowPointDto {
  date: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  /** Davr boshidan yig‘ilib boradigan qoldiq */
  balance: number;
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const transactionSelect = {
  id: true,
  number: true,
  type: true,
  status: true,
  amount: true,
  occurredAt: true,
  description: true,
  categoryName: true,
  entityType: true,
  entityId: true,
  voidedAt: true,
  voidReason: true,
  account: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  voidedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TransactionSelect;

type TransactionRecord = Prisma.TransactionGetPayload<{ select: typeof transactionSelect }>;

function toTransactionDto(transaction: TransactionRecord): TransactionDto {
  return {
    id: transaction.id,
    number: transaction.number,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount.toNumber(),
    occurredAt: transaction.occurredAt.toISOString(),
    description: transaction.description,
    categoryName: transaction.categoryName,
    entityType: transaction.entityType,
    entityId: transaction.entityId,
    account: transaction.account,
    createdBy: transaction.createdBy,
    voidedAt: transaction.voidedAt?.toISOString() ?? null,
    voidReason: transaction.voidReason,
    voidedBy: transaction.voidedBy,
  };
}

function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayStart(value: string): Date {
  return new Date(dayStart(value).getTime() + 86_400_000);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Oraliq berilmasa — joriy oy boshidan bugungacha */
export function resolveRange(query: FinanceRangeQuery): { start: Date; end: Date; from: string; to: string } {
  const today = startOfBusinessDay();
  const start = query.from ? dayStart(query.from) : startOfBusinessMonth();
  const end = query.to ? nextDayStart(query.to) : addDays(today, 1);
  return {
    start,
    end,
    from: query.from ?? businessDateString(start),
    to: query.to ?? businessDateString(today),
  };
}

function buildTransactionWhere(query: TransactionListQuery): Prisma.TransactionWhereInput {
  const conditions: Prisma.TransactionWhereInput[] = [];
  if (query.type) conditions.push({ type: query.type });
  if (query.status) conditions.push({ status: query.status });
  if (query.accountId) conditions.push({ accountId: query.accountId });
  if (query.entityType) conditions.push({ entityType: query.entityType });
  if (query.createdById) conditions.push({ createdById: query.createdById });
  if (query.from) conditions.push({ occurredAt: { gte: dayStart(query.from) } });
  if (query.to) conditions.push({ occurredAt: { lt: nextDayStart(query.to) } });

  const search = query.search?.trim();
  if (search) {
    const or: Prisma.TransactionWhereInput[] = [
      { description: { contains: search, mode: 'insensitive' } },
      { categoryName: { contains: search, mode: 'insensitive' } },
    ];
    const numberMatch = /^#?(\d{1,9})$/.exec(search);
    if (numberMatch?.[1]) or.push({ number: Number(numberMatch[1]) });
    conditions.push({ OR: or });
  }

  return { AND: conditions };
}

/** Kategoriya kesimi: eng kattadan kichikka */
function toCategoryRows(
  rows: Array<{ categoryName: string | null; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }>,
): Array<{ name: string; total: number; count: number }> {
  return rows
    .map((row) => ({
      name: row.categoryName ?? 'Boshqa',
      total: row._sum.amount?.toNumber() ?? 0,
      count: row._count._all,
    }))
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

export const financeService = {
  /** Kassalar va ulardagi qoldiq (+ tanlangan davrdagi harakat) */
  async accounts(query: FinanceRangeQuery): Promise<{ items: AccountDto[]; totalBalance: number }> {
    const { start, end } = resolveRange(query);
    const accounts = await prisma.financialAccount.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        type: true,
        balance: true,
        isActive: true,
        sortOrder: true,
        description: true,
      },
    });

    const movements = await prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { status: 'COMPLETED', occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const items = accounts.map((account) => {
      const rows = movements.filter((row) => row.accountId === account.id);
      const sumOf = (type: TransactionType) =>
        rows.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
      return {
        id: account.id,
        key: account.key,
        name: account.name,
        type: account.type,
        balance: account.balance.toNumber(),
        isActive: account.isActive,
        sortOrder: account.sortOrder,
        description: account.description,
        income: sumOf('INCOME') + sumOf('TRANSFER'),
        expense: sumOf('EXPENSE') + sumOf('REFUND'),
        transactions: rows.reduce((sum, row) => sum + row._count._all, 0),
      };
    });

    return {
      items,
      totalBalance: items.filter((item) => item.isActive).reduce((sum, item) => sum + item.balance, 0),
    };
  },

  async createAccount(actor: AuthUser, input: AccountInput, client: ClientInfo): Promise<AccountDto> {
    const existing = await prisma.financialAccount.findUnique({ where: { key: input.key }, select: { id: true } });
    if (existing) {
      throw AppError.conflict('Bunday kalitli hisob allaqachon mavjud', [{ field: 'key', message: 'Kalit band' }]);
    }

    const account = await prisma.financialAccount.create({
      data: {
        key: input.key,
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
      },
      select: { id: true },
    });
    await auditService.record({
      userId: actor.id,
      action: 'finance.account_created',
      entityType: 'account',
      entityId: account.id,
      metadata: { key: input.key, name: input.name, type: input.type },
      ...client,
    });

    const { items } = await this.accounts({});
    const created = items.find((item) => item.id === account.id);
    if (!created) throw AppError.notFound('Hisob topilmadi');
    return created;
  },

  async updateAccount(
    actor: AuthUser,
    id: string,
    input: UpdateAccountInput,
    client: ClientInfo,
  ): Promise<AccountDto> {
    const account = await prisma.financialAccount.findUnique({ where: { id }, select: { id: true, key: true, name: true } });
    if (!account) {
      throw AppError.notFound('Hisob topilmadi');
    }
    if (input.key && input.key !== account.key) {
      const duplicate = await prisma.financialAccount.findUnique({ where: { key: input.key }, select: { id: true } });
      if (duplicate) {
        throw AppError.conflict('Bunday kalitli hisob allaqachon mavjud', [{ field: 'key', message: 'Kalit band' }]);
      }
    }

    await prisma.financialAccount.update({
      where: { id },
      data: {
        ...(input.key === undefined ? {} : { key: input.key }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });
    await auditService.record({
      userId: actor.id,
      action: 'finance.account_updated',
      entityType: 'account',
      entityId: id,
      metadata: { name: input.name ?? account.name, isActive: input.isActive ?? null },
      ...client,
    });

    const { items } = await this.accounts({});
    const updated = items.find((item) => item.id === id);
    if (!updated) throw AppError.notFound('Hisob topilmadi');
    return updated;
  },

  async transactions(query: TransactionListQuery): Promise<{ items: TransactionDto[]; total: number }> {
    const where = buildTransactionWhere(query);
    const items = await prisma.transaction.findMany({
      where,
      select: transactionSelect,
      orderBy:
        query.sortBy === 'amount'
          ? [{ amount: query.sortOrder }, { id: 'asc' }]
          : query.sortBy === 'number'
            ? [{ number: query.sortOrder }]
            : [{ occurredAt: query.sortOrder }, { number: 'desc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.transaction.count({ where });
    return { items: items.map(toTransactionDto), total };
  },

  /** Moliyaviy panel: tushum, xarajat, sof foyda va kesimlar */
  async summary(query: FinanceRangeQuery): Promise<FinanceSummaryDto> {
    const { start, end, from, to } = resolveRange(query);
    // O'tkazma va boshlang'ich qoldiq tushum ham, xarajat ham emas — faqat qoldiqni siljitadi
    const where: Prisma.TransactionWhereInput = { ...OPERATING_LEDGER_WHERE, occurredAt: { gte: start, lt: end } };

    const byType = await prisma.transaction.groupBy({ by: ['type'], where, _sum: { amount: true } });
    const sumOf = (type: TransactionType) => byType.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
    const income = sumOf('INCOME');
    const expense = sumOf('EXPENSE') + sumOf('REFUND');

    const incomeRows = await prisma.transaction.groupBy({
      by: ['categoryName'],
      where: { ...where, type: 'INCOME' },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const expenseRows = await prisma.transaction.groupBy({
      by: ['categoryName'],
      where: { ...where, type: { in: ['EXPENSE', 'REFUND'] } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const incomeByCategory = toCategoryRows(incomeRows);
    const expenseByCategory = toCategoryRows(expenseRows);

    const marketingCategory = await prisma.expenseCategory.findUnique({
      where: { key: MARKETING_CATEGORY_KEY },
      select: { name: true },
    });
    const teacherSalary = expenseByCategory.find((row) => row.name === SALARY_CATEGORY)?.total ?? 0;
    const marketing = marketingCategory
      ? (expenseByCategory.find((row) => row.name === marketingCategory.name)?.total ?? 0)
      : 0;

    const studentPayments = incomeByCategory.find((row) => row.name === 'O‘quvchi to‘lovi')?.total ?? 0;
    const accounts = await prisma.financialAccount.aggregate({ where: { isActive: true }, _sum: { balance: true } });
    const debt = await prisma.debt.aggregate({ _sum: { remainingAmount: true } });

    return {
      from,
      to,
      income,
      expense,
      netProfit: income - expense,
      margin: income === 0 ? 0 : Math.round(((income - expense) / income) * 100),
      teacherSalary,
      marketing,
      otherExpense: Math.max(expense - teacherSalary - marketing, 0),
      studentPayments,
      otherIncome: Math.max(income - studentPayments, 0),
      totalBalance: accounts._sum.balance?.toNumber() ?? 0,
      totalDebt: debt._sum.remainingAmount?.toNumber() ?? 0,
      incomeByCategory,
      expenseByCategory,
    };
  },

  /** Kunlik / haftalik / oylik pul oqimi (davr boshidan yig‘iladigan qoldiq bilan) */
  async cashFlow(query: CashFlowQuery): Promise<CashFlowPointDto[]> {
    const { start, end } = resolveRange(query);
    const transactions = await prisma.transaction.findMany({
      where: { ...OPERATING_LEDGER_WHERE, occurredAt: { gte: start, lt: end } },
      select: { type: true, amount: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });

    const monthLabels = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    const buckets = new Map<string, CashFlowPointDto>();

    const keyOf = (date: Date): { key: string; label: string } => {
      if (query.period === 'month') {
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
        return { key, label: monthLabels[date.getUTCMonth()] ?? key };
      }
      if (query.period === 'week') {
        // Hafta dushanbadan boshlanadi
        const day = (date.getUTCDay() + 6) % 7;
        const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
        const key = toDateOnly(monday);
        return { key, label: key.slice(5) };
      }
      const key = toDateOnly(date);
      return { key, label: key.slice(5) };
    };

    for (const transaction of transactions) {
      const { key, label } = keyOf(transaction.occurredAt);
      const point = buckets.get(key) ?? { date: key, label, income: 0, expense: 0, net: 0, balance: 0 };
      const amount = transaction.amount.toNumber();
      if (transaction.type === 'INCOME' || transaction.type === 'TRANSFER') {
        point.income += amount;
      } else {
        point.expense += amount;
      }
      point.net = point.income - point.expense;
      buckets.set(key, point);
    }

    let running = 0;
    return [...buckets.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((point) => {
        running += point.net;
        return { ...point, balance: running };
      });
  },

  /** Kassadan kassaga o‘tkazma: ikkita yozuv (chiqim va kirim) */
  async transfer(actor: AuthUser, input: TransferInput, client: ClientInfo): Promise<TransactionDto[]> {
    const accounts = await prisma.financialAccount.findMany({
      where: { id: { in: [input.fromAccountId, input.toAccountId] }, isActive: true },
      select: { id: true, name: true, balance: true },
    });
    const from = accounts.find((account) => account.id === input.fromAccountId);
    const to = accounts.find((account) => account.id === input.toAccountId);
    if (!from || !to) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'fromAccountId', message: 'Hisob topilmadi' }]);
    }
    if (from.balance.toNumber() < input.amount) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'amount', message: `${from.name} hisobida yetarli mablag‘ yo‘q` },
      ]);
    }

    const occurredAt = input.occurredAt ? dayStart(input.occurredAt) : new Date();
    const description = input.description ?? `${from.name} → ${to.name}`;

    const ids = await prisma.$transaction(async (tx) => {
      const out = await recordTransaction(tx, {
        type: 'EXPENSE',
        amount: input.amount,
        accountId: from.id,
        occurredAt,
        description,
        categoryName: 'Kassalar o‘rtasida o‘tkazma',
        entityType: 'transfer',
        createdById: actor.id,
      });
      const incoming = await recordTransaction(tx, {
        type: 'TRANSFER',
        amount: input.amount,
        accountId: to.id,
        occurredAt,
        description,
        categoryName: 'Kassalar o‘rtasida o‘tkazma',
        entityType: 'transfer',
        entityId: out.id,
        createdById: actor.id,
      });
      await tx.transaction.update({ where: { id: out.id }, data: { entityId: incoming.id } });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'finance.transfer',
        entityType: 'transaction',
        entityId: out.id,
        metadata: { from: from.name, to: to.name, amount: input.amount },
        ...client,
      });

      return [out.id, incoming.id];
    });

    const items = await prisma.transaction.findMany({ where: { id: { in: ids } }, select: transactionSelect });
    return items.map(toTransactionDto);
  },

  /**
   * Yozuvni bekor qiladi. O‘quvchi to‘lovi va maosh to‘lovi o‘z modullarida
   * bekor qilinadi — daftardan alohida o‘chirib bo‘lmaydi.
   */
  async voidTransaction(
    actor: AuthUser,
    id: string,
    input: VoidTransactionInput,
    client: ClientInfo,
  ): Promise<TransactionDto> {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, entityType: true, amount: true, type: true },
    });
    if (!transaction) {
      throw AppError.notFound('Moliyaviy yozuv topilmadi');
    }
    if (transaction.status !== 'COMPLETED') {
      throw AppError.conflict('Bu yozuv allaqachon bekor qilingan');
    }
    if (transaction.entityType === 'payment') {
      throw AppError.unprocessable('O‘quvchi to‘lovi to‘lovlar bo‘limida bekor qilinadi');
    }
    if (transaction.entityType === 'teacherSalaryPayment') {
      throw AppError.unprocessable('Maosh to‘lovi maoshlar bo‘limida bekor qilinadi');
    }

    await prisma.$transaction(async (tx) => {
      await voidTransaction(tx, id, { userId: actor.id, reason: input.reason });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'finance.transaction_voided',
        entityType: 'transaction',
        entityId: id,
        metadata: {
          number: transaction.number,
          type: transaction.type,
          amount: transaction.amount.toNumber(),
          reason: input.reason,
        },
        ...client,
      });
    });

    const updated = await prisma.transaction.findUniqueOrThrow({ where: { id }, select: transactionSelect });
    return toTransactionDto(updated);
  },
};
