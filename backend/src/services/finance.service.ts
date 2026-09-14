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
import { OPERATING_LEDGER_WHERE, balanceDelta, recordTransaction, voidTransaction } from './ledger.js';
import { assertFinancialPeriodOpen } from './financialPeriod.service.js';

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
  /** Qaytarilgan to‘lovlar — tushumdan ayrilgan */
  refunds: number;
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
  /** Davr oxiridagi haqiqiy kassa qoldig‘i (barcha hisoblar, o‘tkazmalar bilan) */
  cashBalance: number;
}

export interface CashFlowStatementDto {
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  /** closingBalance − openingBalance */
  netChange: number;
  /** Faoliyatdan sof oqim: o‘tkazmalarsiz kirim − chiqim */
  operatingNet: number;
  /** Kassaga bog‘lanmagan yozuvlarning sof summasi — qoldiqqa ta’sir qilmaydi */
  unassigned: number;
  inflow: { studentPayments: number; otherIncome: number; transfers: number; other: number; total: number };
  outflow: { expenses: number; salaries: number; refunds: number; transfers: number; other: number; total: number };
  accounts: Array<{
    id: string;
    name: string;
    type: AccountType;
    isActive: boolean;
    opening: number;
    inflow: number;
    outflow: number;
    closing: number;
  }>;
  forecast: {
    days: number;
    /** Faol kassalardagi joriy qoldiq */
    currentBalance: number;
    /** Kutilayotgan, tasdiq kutayotgan va tasdiqlangan (to‘lanmagan) xarajatlar — muddati o‘tganlari ham */
    upcomingExpenses: number;
    upcomingExpenseCount: number;
    /** Hisoblangan, lekin to‘liq to‘lanmagan maoshlar */
    unpaidSalaries: number;
    /** O‘quvchilar qarzi — tushishi mumkin, prognozga qo‘shilmaydi */
    receivables: number;
    projectedBalance: number;
  };
}

const FORECAST_DAYS = 30;

export interface ProfitLossLineDto {
  name: string;
  amount: number;
  /** Sof tushumga nisbatan ulushi (%) */
  share: number;
}

export interface ProfitLossDto {
  from: string;
  to: string;
  revenue: {
    studentPayments: number;
    refunds: number;
    netStudentRevenue: number;
    otherIncome: ProfitLossLineDto[];
    otherIncomeTotal: number;
    netRevenue: number;
  };
  /** Bevosita xarajat — o‘qituvchi maoshi */
  directCosts: { teacherSalaries: number; total: number };
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: { lines: ProfitLossLineDto[]; total: number };
  netProfit: number;
  netMargin: number;
  /** Shu uzunlikdagi oldingi davr */
  previous: { from: string; to: string; netRevenue: number; grossProfit: number; operatingExpenses: number; netProfit: number; netMargin: number };
  /** Oldingi davrga nisbatan o‘zgarish (%); oldingi davr nol bo‘lsa null */
  change: { netRevenue: number | null; grossProfit: number | null; netProfit: number | null };
  months: Array<{ key: string; label: string; netRevenue: number; directCosts: number; operatingExpenses: number; netProfit: number }>;
}

interface ProfitLossAccumulator {
  studentPayments: number;
  refunds: number;
  otherIncome: Map<string, number>;
  teacherSalaries: number;
  operating: Map<string, number>;
}

const MONTH_SHORT_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));
const changeOf = (current: number, previous: number) =>
  previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 100);

function emptyProfitLoss(): ProfitLossAccumulator {
  return { studentPayments: 0, refunds: 0, otherIncome: new Map(), teacherSalaries: 0, operating: new Map() };
}

/** Daftar yozuvini foyda-zarar moddasiga joylaydi (kassa usuli) */
function addToProfitLoss(
  acc: ProfitLossAccumulator,
  row: { type: TransactionType; entityType: string | null; categoryName: string | null; amount: number },
): void {
  const add = (map: Map<string, number>, name: string) => map.set(name, (map.get(name) ?? 0) + row.amount);
  if (row.type === 'REFUND') acc.refunds += row.amount;
  else if (row.type === 'INCOME' || row.type === 'TRANSFER') {
    if (row.entityType === 'payment') acc.studentPayments += row.amount;
    else add(acc.otherIncome, row.categoryName ?? 'Boshqa tushum');
  } else if (row.categoryName === SALARY_CATEGORY) acc.teacherSalaries += row.amount;
  else add(acc.operating, row.categoryName ?? 'Boshqa xarajat');
}

function profitLossTotals(acc: ProfitLossAccumulator) {
  const sumOf = (map: Map<string, number>) => [...map.values()].reduce((sum, value) => sum + value, 0);
  const otherIncomeTotal = sumOf(acc.otherIncome);
  const netRevenue = acc.studentPayments - acc.refunds + otherIncomeTotal;
  const operatingExpenses = sumOf(acc.operating);
  const grossProfit = netRevenue - acc.teacherSalaries;
  const netProfit = grossProfit - operatingExpenses;
  return { otherIncomeTotal, netRevenue, operatingExpenses, grossProfit, netProfit };
}

async function loadProfitLossRows(start: Date, end: Date) {
  const rows = await prisma.transaction.findMany({
    where: { ...OPERATING_LEDGER_WHERE, occurredAt: { gte: start, lt: end } },
    select: { type: true, entityType: true, categoryName: true, amount: true, occurredAt: true },
  });
  return rows.map((row) => ({ ...row, amount: row.amount.toNumber() }));
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

/** "2026-08-01" → shu kunning boshlanishi o‘quv markaz vaqti bo‘yicha */
function businessDayStart(value: string): Date {
  return startOfBusinessDay(new Date(`${value}T12:00:00.000Z`));
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Oraliq berilmasa — joriy oy boshidan bugungacha */
export function resolveRange(query: FinanceRangeQuery): { start: Date; end: Date; from: string; to: string } {
  const today = startOfBusinessDay();
  const start = query.from ? businessDayStart(query.from) : startOfBusinessMonth();
  const end = query.to ? addDays(businessDayStart(query.to), 1) : addDays(today, 1);
  return {
    start,
    end,
    from: query.from ?? businessDateString(start),
    to: query.to ?? businessDateString(today),
  };
}

/** Berilgan vaqtdagi barcha kassalar qoldig‘i: joriy qoldiqdan shu vaqtdan keyingi harakatlar ayriladi */
async function cashBalanceAt(date: Date): Promise<number> {
  const total = await prisma.financialAccount.aggregate({ _sum: { balance: true } });
  const since = await prisma.transaction.groupBy({
    by: ['type'],
    where: { status: 'COMPLETED', accountId: { not: null }, occurredAt: { gte: date } },
    _sum: { amount: true },
  });
  const delta = since.reduce((sum, row) => sum + balanceDelta(row.type, row._sum.amount?.toNumber() ?? 0), 0);
  return (total._sum.balance?.toNumber() ?? 0) - delta;
}

function buildTransactionWhere(query: TransactionListQuery): Prisma.TransactionWhereInput {
  const conditions: Prisma.TransactionWhereInput[] = [];
  if (query.type) conditions.push({ type: query.type });
  if (query.status) conditions.push({ status: query.status });
  if (query.accountId) conditions.push({ accountId: query.accountId });
  if (query.entityType) conditions.push({ entityType: query.entityType });
  if (query.createdById) conditions.push({ createdById: query.createdById });
  if (query.from) conditions.push({ occurredAt: { gte: businessDayStart(query.from) } });
  if (query.to) conditions.push({ occurredAt: { lt: addDays(businessDayStart(query.to), 1) } });

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
    // Qaytarilgan to'lov xarajat emas — tushumdan ayriladi (sof tushum)
    const refunds = sumOf('REFUND');
    const income = sumOf('INCOME') - refunds;
    const expense = sumOf('EXPENSE');

    const incomeRows = await prisma.transaction.groupBy({
      by: ['categoryName'],
      where: { ...where, type: 'INCOME' },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const expenseRows = await prisma.transaction.groupBy({
      by: ['categoryName'],
      where: { ...where, type: 'EXPENSE' },
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

    const studentPayments = (incomeByCategory.find((row) => row.name === 'O‘quvchi to‘lovi')?.total ?? 0) - refunds;
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
      refunds,
      otherIncome: Math.max(income - studentPayments, 0),
      totalBalance: accounts._sum.balance?.toNumber() ?? 0,
      totalDebt: debt._sum.remainingAmount?.toNumber() ?? 0,
      incomeByCategory,
      expenseByCategory,
    };
  },

  /** Kunlik / haftalik / oylik pul oqimi (davr boshidan yig‘iladigan qoldiq va haqiqiy kassa qoldig‘i bilan) */
  async cashFlow(query: CashFlowQuery): Promise<CashFlowPointDto[]> {
    const { start, end } = resolveRange(query);
    const transactions = await prisma.transaction.findMany({
      where: { ...OPERATING_LEDGER_WHERE, occurredAt: { gte: start, lt: end } },
      select: { type: true, amount: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });
    // Kassa qoldig'i barcha yozuvlardan (o'tkazma va boshlang'ich qoldiq ham) hisoblanadi
    const movements = await prisma.transaction.findMany({
      where: { status: 'COMPLETED', accountId: { not: null }, occurredAt: { gte: start, lt: end } },
      select: { type: true, amount: true, occurredAt: true },
    });
    const openingCash = await cashBalanceAt(start);

    const monthLabels = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    const buckets = new Map<string, CashFlowPointDto & { cashDelta: number }>();

    // Guruhlash o'quv markaz sanasi bo'yicha: 31-avgust 20:00 UTC — bu 1-sentabr
    const keyOf = (date: Date): { key: string; label: string } => {
      const local = businessDateString(date);
      if (query.period === 'month') {
        const month = Number(local.slice(5, 7));
        return { key: `${local.slice(0, 7)}-01`, label: monthLabels[month - 1] ?? local.slice(0, 7) };
      }
      if (query.period === 'week') {
        // Hafta dushanbadan boshlanadi
        const day = new Date(`${local}T00:00:00.000Z`);
        const monday = addDays(day, -((day.getUTCDay() + 6) % 7));
        const key = toDateOnly(monday);
        return { key, label: key.slice(5) };
      }
      return { key: local, label: local.slice(5) };
    };
    const bucketOf = (date: Date) => {
      const { key, label } = keyOf(date);
      const point = buckets.get(key) ?? { date: key, label, income: 0, expense: 0, net: 0, balance: 0, cashBalance: 0, cashDelta: 0 };
      buckets.set(key, point);
      return point;
    };

    for (const transaction of transactions) {
      const point = bucketOf(transaction.occurredAt);
      const amount = transaction.amount.toNumber();
      if (transaction.type === 'INCOME' || transaction.type === 'TRANSFER') {
        point.income += amount;
      } else {
        point.expense += amount;
      }
      point.net = point.income - point.expense;
    }
    for (const movement of movements) {
      bucketOf(movement.occurredAt).cashDelta += balanceDelta(movement.type, movement.amount.toNumber());
    }

    let running = 0;
    let cash = openingCash;
    return [...buckets.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ cashDelta, ...point }) => {
        running += point.net;
        cash += cashDelta;
        return { ...point, balance: running, cashBalance: cash, hasMovement: point.income !== 0 || point.expense !== 0 || cashDelta !== 0 };
      })
      .filter((point) => point.hasMovement)
      .map(({ hasMovement: _hasMovement, ...point }) => point);
  },

  /** Pul harakati hisoboti: davr boshidagi va oxiridagi qoldiq, kirim-chiqim tarkibi, kassalar kesimi, 30 kunlik prognoz */
  async cashFlowStatement(query: FinanceRangeQuery): Promise<CashFlowStatementDto> {
    const { start, end, from, to } = resolveRange(query);

    const accounts = await prisma.financialAccount.findMany({
      select: { id: true, name: true, type: true, isActive: true, balance: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const deltaSince = async (date: Date) => {
      const rows = await prisma.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { status: 'COMPLETED', accountId: { not: null }, occurredAt: { gte: date } },
        _sum: { amount: true },
      });
      const byAccount = new Map<string, number>();
      for (const row of rows) {
        if (!row.accountId) continue;
        byAccount.set(row.accountId, (byAccount.get(row.accountId) ?? 0) + balanceDelta(row.type, row._sum.amount?.toNumber() ?? 0));
      }
      return byAccount;
    };
    const sinceStart = await deltaSince(start);
    const sinceEnd = await deltaSince(end);

    const groups = await prisma.transaction.groupBy({
      by: ['accountId', 'type', 'entityType'],
      where: { status: 'COMPLETED', occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    const inflow = { studentPayments: 0, otherIncome: 0, transfers: 0, other: 0, total: 0 };
    const outflow = { expenses: 0, salaries: 0, refunds: 0, transfers: 0, other: 0, total: 0 };
    const accountFlow = new Map<string, { inflow: number; outflow: number }>();
    let unassigned = 0;

    for (const group of groups) {
      const amount = group._sum.amount?.toNumber() ?? 0;
      const incoming = balanceDelta(group.type, amount) > 0;
      if (group.entityType === 'transfer') {
        if (incoming) inflow.transfers += amount;
        else outflow.transfers += amount;
      } else if (incoming) {
        if (group.entityType === 'payment') inflow.studentPayments += amount;
        else if (group.entityType === 'income') inflow.otherIncome += amount;
        else inflow.other += amount;
      } else if (group.type === 'REFUND') {
        outflow.refunds += amount;
      } else if (group.entityType === 'teacherSalaryPayment') {
        outflow.salaries += amount;
      } else if (group.entityType === 'expense') {
        outflow.expenses += amount;
      } else {
        outflow.other += amount;
      }

      if (incoming) inflow.total += amount;
      else outflow.total += amount;

      if (group.accountId) {
        const flow = accountFlow.get(group.accountId) ?? { inflow: 0, outflow: 0 };
        if (incoming) flow.inflow += amount;
        else flow.outflow += amount;
        accountFlow.set(group.accountId, flow);
      } else {
        unassigned += incoming ? amount : -amount;
      }
    }

    const accountRows = accounts
      .map((account) => {
        const balance = account.balance.toNumber();
        const flow = accountFlow.get(account.id) ?? { inflow: 0, outflow: 0 };
        return {
          id: account.id,
          name: account.name,
          type: account.type,
          isActive: account.isActive,
          opening: balance - (sinceStart.get(account.id) ?? 0),
          inflow: flow.inflow,
          outflow: flow.outflow,
          closing: balance - (sinceEnd.get(account.id) ?? 0),
        };
      })
      // Faolsiz kassa faqat davrda qoldig'i yoki harakati bo'lsa ko'rsatiladi
      .filter((row) => row.isActive || row.opening !== 0 || row.closing !== 0 || row.inflow !== 0 || row.outflow !== 0);

    const openingBalance = accountRows.reduce((sum, row) => sum + row.opening, 0);
    const closingBalance = accountRows.reduce((sum, row) => sum + row.closing, 0);

    // Prognoz — tanlangan davrdan qat'i nazar bugundan boshlab
    const horizon = addDays(startOfBusinessDay(), FORECAST_DAYS + 1);
    const upcoming = await prisma.expense.aggregate({
      where: { status: { in: ['UPCOMING', 'PENDING', 'APPROVED'] }, spentAt: { lt: horizon } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const salaries = await prisma.teacherSalaryPeriod.aggregate({
      where: { status: { in: ['CALCULATED', 'APPROVED', 'PARTIALLY_PAID'] }, remainingAmount: { gt: 0 } },
      _sum: { remainingAmount: true },
    });
    const debts = await prisma.debt.aggregate({ where: { remainingAmount: { gt: 0 } }, _sum: { remainingAmount: true } });
    const currentBalance = accounts.filter((account) => account.isActive).reduce((sum, account) => sum + account.balance.toNumber(), 0);
    const upcomingExpenses = upcoming._sum.amount?.toNumber() ?? 0;
    const unpaidSalaries = salaries._sum.remainingAmount?.toNumber() ?? 0;

    return {
      from,
      to,
      openingBalance,
      closingBalance,
      netChange: closingBalance - openingBalance,
      operatingNet: inflow.total - inflow.transfers - (outflow.total - outflow.transfers),
      unassigned,
      inflow,
      outflow,
      accounts: accountRows,
      forecast: {
        days: FORECAST_DAYS,
        currentBalance,
        upcomingExpenses,
        upcomingExpenseCount: upcoming._count._all,
        unpaidSalaries,
        receivables: debts._sum.remainingAmount?.toNumber() ?? 0,
        projectedBalance: currentBalance - upcomingExpenses - unpaidSalaries,
      },
    };
  },

  /** Foyda va zarar hisoboti: sof tushum → yalpi foyda → operatsion xarajatlar → sof foyda, oldingi davr bilan */
  async profitLoss(query: FinanceRangeQuery): Promise<ProfitLossDto> {
    const { start, end, from, to } = resolveRange(query);
    const length = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - length);

    const current = emptyProfitLoss();
    const monthly = new Map<string, ProfitLossAccumulator>();
    // Oylar tartibi davr boshidan oxirigacha — harakat bo'lmagan oy ham ko'rinadi
    for (let cursor = businessDateString(start).slice(0, 7); cursor <= businessDateString(addDays(end, -1)).slice(0, 7); ) {
      monthly.set(cursor, emptyProfitLoss());
      const [year, month] = cursor.split('-').map(Number) as [number, number];
      cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    }
    for (const row of await loadProfitLossRows(start, end)) {
      addToProfitLoss(current, row);
      const bucket = monthly.get(businessDateString(row.occurredAt).slice(0, 7));
      if (bucket) addToProfitLoss(bucket, row);
    }
    const previous = emptyProfitLoss();
    for (const row of await loadProfitLossRows(previousStart, start)) addToProfitLoss(previous, row);

    const totals = profitLossTotals(current);
    const previousTotals = profitLossTotals(previous);
    const lines = (map: Map<string, number>) =>
      [...map.entries()]
        .filter(([, amount]) => amount !== 0)
        .map(([name, amount]) => ({ name, amount, share: percentOf(amount, totals.netRevenue) }))
        .sort((a, b) => b.amount - a.amount);

    return {
      from,
      to,
      revenue: {
        studentPayments: current.studentPayments,
        refunds: current.refunds,
        netStudentRevenue: current.studentPayments - current.refunds,
        otherIncome: lines(current.otherIncome),
        otherIncomeTotal: totals.otherIncomeTotal,
        netRevenue: totals.netRevenue,
      },
      directCosts: { teacherSalaries: current.teacherSalaries, total: current.teacherSalaries },
      grossProfit: totals.grossProfit,
      grossMargin: percentOf(totals.grossProfit, totals.netRevenue),
      operatingExpenses: { lines: lines(current.operating), total: totals.operatingExpenses },
      netProfit: totals.netProfit,
      netMargin: percentOf(totals.netProfit, totals.netRevenue),
      previous: {
        from: businessDateString(previousStart),
        to: businessDateString(addDays(start, -1)),
        netRevenue: previousTotals.netRevenue,
        grossProfit: previousTotals.grossProfit,
        operatingExpenses: previousTotals.operatingExpenses,
        netProfit: previousTotals.netProfit,
        netMargin: percentOf(previousTotals.netProfit, previousTotals.netRevenue),
      },
      change: {
        netRevenue: changeOf(totals.netRevenue, previousTotals.netRevenue),
        grossProfit: changeOf(totals.grossProfit, previousTotals.grossProfit),
        netProfit: changeOf(totals.netProfit, previousTotals.netProfit),
      },
      months: [...monthly.entries()].map(([key, acc]) => {
        const monthTotals = profitLossTotals(acc);
        return {
          key,
          label: `${MONTH_SHORT_LABELS[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`,
          netRevenue: monthTotals.netRevenue,
          directCosts: acc.teacherSalaries,
          operatingExpenses: monthTotals.operatingExpenses,
          netProfit: monthTotals.netProfit,
        };
      }),
    };
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
    await assertFinancialPeriodOpen(prisma, occurredAt);
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
      select: { id: true, number: true, status: true, entityType: true, amount: true, type: true, occurredAt: true },
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
    if (transaction.entityType === 'paymentRefund') {
      throw AppError.unprocessable('Qaytarilgan pul bekor qilinmaydi — kerak bo‘lsa o‘quvchidan yangi to‘lov qabul qiling');
    }
    await assertFinancialPeriodOpen(prisma, transaction.occurredAt);

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
