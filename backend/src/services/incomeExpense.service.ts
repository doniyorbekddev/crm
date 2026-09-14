import { prisma } from '../config/database.js';
import type { ExpenseStatus, PaymentMethod, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  BudgetQuery,
  CategoryInput,
  CreateExpenseInput,
  CreateIncomeInput,
  MoneyListQuery,
  SaveBudgetInput,
  UpdateCategoryInput,
  VoidMoneyInput,
} from '../validators/incomeExpense.validator.js';
import { auditService } from './audit.service.js';
import { accountIdForMethod, recordTransaction, voidTransaction } from './ledger.js';
import { assertFinancialPeriodOpen } from './financialPeriod.service.js';
import { getApprovalThreshold, notifyApprovers, requiresApproval } from './expenseWorkflow.service.js';

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface MoneyEntryDto {
  id: string;
  number: number;
  amount: number;
  method: PaymentMethod;
  /** Tushum uchun receivedAt, xarajat uchun spentAt */
  date: string;
  description: string | null;
  attachmentPath: string | null;
  isVoided: boolean;
  voidReason: string | null;
  category: { id: string; key: string; name: string };
  account: { id: string; name: string } | null;
  responsible: { id: string; firstName: string; lastName: string } | null;
  student: { id: string; firstName: string; lastName: string } | null;
  /** To‘lanmagan xarajatda daftar yozuvi yo‘q */
  transactionId: string | null;
  /** Tushum har doim PAID; xarajat: UPCOMING / PENDING / APPROVED / REJECTED / PAID */
  status: ExpenseStatus;
  vendor: string | null;
  dueDate: string | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  approvedAt: string | null;
  rejectReason: string | null;
  recurring: { id: string; name: string } | null;
  /** Biriktirilgan cheklar soni */
  attachments: number;
  createdAt: string;
}

export interface MoneyStatsDto {
  total: number;
  count: number;
  byCategory: Array<{ id: string; name: string; total: number; count: number }>;
}

export interface CategoryDto {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Nechta yozuvda ishlatilgan */
  usage: number;
}

export interface BudgetLineDto {
  categoryId: string;
  categoryName: string;
  planned: number;
  actual: number;
  /** Rejaga nisbatan bajarilish (%) */
  usage: number;
  remaining: number;
}

export interface BudgetDto {
  year: number;
  month: number;
  note: string | null;
  totalPlanned: number;
  totalActual: number;
  lines: BudgetLineDto[];
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const incomeSelect = {
  id: true,
  number: true,
  amount: true,
  method: true,
  receivedAt: true,
  description: true,
  createdAt: true,
  transactionId: true,
  category: { select: { id: true, key: true, name: true } },
  account: { select: { id: true, name: true } },
  responsible: { select: { id: true, firstName: true, lastName: true } },
  student: { select: { id: true, firstName: true, lastName: true } },
  transaction: { select: { status: true, voidReason: true } },
  _count: { select: { documents: { where: { deletedAt: null } } } },
} satisfies Prisma.IncomeSelect;

const expenseSelect = {
  id: true,
  number: true,
  amount: true,
  method: true,
  spentAt: true,
  description: true,
  attachmentPath: true,
  createdAt: true,
  transactionId: true,
  status: true,
  vendor: true,
  dueDate: true,
  approvedAt: true,
  rejectReason: true,
  category: { select: { id: true, key: true, name: true } },
  account: { select: { id: true, name: true } },
  responsible: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  recurringExpense: { select: { id: true, name: true } },
  transaction: { select: { status: true, voidReason: true } },
  _count: { select: { documents: { where: { deletedAt: null } } } },
} satisfies Prisma.ExpenseSelect;

type IncomeRecord = Prisma.IncomeGetPayload<{ select: typeof incomeSelect }>;
type ExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;

function toIncomeDto(income: IncomeRecord): MoneyEntryDto {
  return {
    id: income.id,
    number: income.number,
    amount: income.amount.toNumber(),
    method: income.method,
    date: income.receivedAt.toISOString(),
    description: income.description,
    attachmentPath: null,
    isVoided: income.transaction.status !== 'COMPLETED',
    voidReason: income.transaction.voidReason,
    category: income.category,
    account: income.account,
    responsible: income.responsible,
    student: income.student,
    transactionId: income.transactionId,
    status: 'PAID',
    vendor: null,
    dueDate: null,
    approvedBy: null,
    approvedAt: null,
    rejectReason: null,
    recurring: null,
    attachments: income._count.documents,
    createdAt: income.createdAt.toISOString(),
  };
}

function toExpenseDto(expense: ExpenseRecord): MoneyEntryDto {
  return {
    id: expense.id,
    number: expense.number,
    amount: expense.amount.toNumber(),
    method: expense.method,
    date: expense.spentAt.toISOString(),
    description: expense.description,
    attachmentPath: expense.attachmentPath,
    isVoided: expense.transaction !== null && expense.transaction.status !== 'COMPLETED',
    voidReason: expense.transaction?.voidReason ?? null,
    category: expense.category,
    account: expense.account,
    responsible: expense.responsible,
    student: null,
    transactionId: expense.transactionId,
    status: expense.status,
    vendor: expense.vendor,
    dueDate: expense.dueDate ? expense.dueDate.toISOString().slice(0, 10) : null,
    approvedBy: expense.approvedBy,
    approvedAt: expense.approvedAt?.toISOString() ?? null,
    rejectReason: expense.rejectReason,
    recurring: expense.recurringExpense,
    attachments: expense._count.documents,
    createdAt: expense.createdAt.toISOString(),
  };
}

function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayStart(value: string): Date {
  return new Date(dayStart(value).getTime() + 86_400_000);
}

/** Sana faqat kun bo‘lsa — o‘sha kunning peshini olamiz (vaqt mintaqasi chalkashmasligi uchun) */
function toOccurredAt(value: string | undefined): Date {
  return value ? new Date(`${value}T12:00:00.000Z`) : new Date();
}

function buildWhere(query: MoneyListQuery, dateField: 'receivedAt' | 'spentAt'): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];
  if (query.categoryId) conditions.push({ categoryId: query.categoryId });
  if (query.accountId) conditions.push({ accountId: query.accountId });
  if (query.method) conditions.push({ method: query.method });
  if (query.responsibleId) conditions.push({ responsibleId: query.responsibleId });
  if (query.from) conditions.push({ [dateField]: { gte: dayStart(query.from) } });
  if (query.to) conditions.push({ [dateField]: { lt: nextDayStart(query.to) } });

  const search = query.search?.trim();
  if (search) {
    const or: Record<string, unknown>[] = [
      { description: { contains: search, mode: 'insensitive' } },
      { category: { name: { contains: search, mode: 'insensitive' } } },
    ];
    const numberMatch = /^#?(\d{1,9})$/.exec(search);
    if (numberMatch?.[1]) or.push({ number: Number(numberMatch[1]) });
    conditions.push({ OR: or });
  }

  return { AND: conditions };
}

function orderBy(query: MoneyListQuery, dateField: 'receivedAt' | 'spentAt'): Record<string, unknown>[] {
  if (query.sortBy === 'amount') return [{ amount: query.sortOrder }, { id: 'asc' }];
  if (query.sortBy === 'number') return [{ number: query.sortOrder }];
  return [{ [dateField]: query.sortOrder }, { number: 'desc' }];
}

async function resolveAccountId(
  tx: Prisma.TransactionClient,
  accountId: string | undefined,
  method: PaymentMethod,
): Promise<string | null> {
  if (!accountId) return accountIdForMethod(tx, method);
  const account = await tx.financialAccount.findFirst({ where: { id: accountId, isActive: true }, select: { id: true } });
  if (!account) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'accountId', message: 'Hisob topilmadi' }]);
  }
  return account.id;
}

// ---------------------------------------------------------------------
// Tushumlar
// ---------------------------------------------------------------------

export const incomeService = {
  async list(query: MoneyListQuery): Promise<{ items: MoneyEntryDto[]; total: number }> {
    const where = buildWhere(query, 'receivedAt') as Prisma.IncomeWhereInput;
    const items = await prisma.income.findMany({
      where,
      select: incomeSelect,
      orderBy: orderBy(query, 'receivedAt') as Prisma.IncomeOrderByWithRelationInput[],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.income.count({ where });
    return { items: items.map(toIncomeDto), total };
  },

  /** Filtrga mos tushumlar yig‘indisi (bekor qilinganlar hisobga olinmaydi) */
  async stats(query: MoneyListQuery): Promise<MoneyStatsDto> {
    const where = { ...(buildWhere(query, 'receivedAt') as Prisma.IncomeWhereInput), transaction: { status: 'COMPLETED' as const } };
    const grouped = await prisma.income.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const categories = await prisma.incomeCategory.findMany({ select: { id: true, name: true } });
    const nameById = new Map(categories.map((category) => [category.id, category.name]));

    const byCategory = grouped
      .map((row) => ({
        id: row.categoryId,
        name: nameById.get(row.categoryId) ?? 'Boshqa',
        total: row._sum.amount?.toNumber() ?? 0,
        count: row._count._all,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      total: byCategory.reduce((sum, row) => sum + row.total, 0),
      count: byCategory.reduce((sum, row) => sum + row.count, 0),
      byCategory,
    };
  },

  async create(actor: AuthUser, input: CreateIncomeInput, client: ClientInfo): Promise<MoneyEntryDto> {
    const category = await prisma.incomeCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
      select: { id: true, name: true },
    });
    if (!category) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'categoryId', message: 'Kategoriya topilmadi' },
      ]);
    }
    if (input.studentId) {
      const student = await prisma.student.findFirst({ where: { id: input.studentId, deletedAt: null }, select: { id: true } });
      if (!student) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'studentId', message: 'O‘quvchi topilmadi' },
        ]);
      }
    }

    const occurredAt = toOccurredAt(input.date);
    await assertFinancialPeriodOpen(prisma, occurredAt);
    const id = await prisma.$transaction(async (tx) => {
      const accountId = await resolveAccountId(tx, input.accountId, input.method);
      const transaction = await recordTransaction(tx, {
        type: 'INCOME',
        amount: input.amount,
        accountId,
        occurredAt,
        description: input.description ?? category.name,
        categoryName: category.name,
        entityType: 'income',
        createdById: actor.id,
      });

      const income = await tx.income.create({
        data: {
          categoryId: category.id,
          amount: input.amount,
          method: input.method,
          accountId,
          receivedAt: occurredAt,
          description: input.description ?? null,
          studentId: input.studentId ?? null,
          responsibleId: actor.id,
          transactionId: transaction.id,
        },
        select: { id: true, number: true },
      });
      await tx.transaction.update({ where: { id: transaction.id }, data: { entityId: income.id } });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'income.created',
        entityType: 'income',
        entityId: income.id,
        metadata: { number: income.number, amount: input.amount, category: category.name, method: input.method },
        ...client,
      });
      return income.id;
    });

    return toIncomeDto(await prisma.income.findUniqueOrThrow({ where: { id }, select: incomeSelect }));
  },

  /** Tushum bekor qilinadi: yozuv qoladi, daftardagi tranzaksiya VOID bo‘ladi */
  async void(actor: AuthUser, id: string, input: VoidMoneyInput, client: ClientInfo): Promise<MoneyEntryDto> {
    const income = await prisma.income.findUnique({
      where: { id },
      select: { id: true, number: true, amount: true, transactionId: true, transaction: { select: { status: true, occurredAt: true } } },
    });
    if (!income) {
      throw AppError.notFound('Tushum topilmadi');
    }
    if (income.transaction.status !== 'COMPLETED') {
      throw AppError.conflict('Bu tushum allaqachon bekor qilingan');
    }

    await assertFinancialPeriodOpen(prisma, income.transaction.occurredAt);
    await prisma.$transaction(async (tx) => {
      await voidTransaction(tx, income.transactionId, { userId: actor.id, reason: input.reason });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'income.voided',
        entityType: 'income',
        entityId: id,
        metadata: { number: income.number, amount: income.amount.toNumber(), reason: input.reason },
        ...client,
      });
    });

    return toIncomeDto(await prisma.income.findUniqueOrThrow({ where: { id }, select: incomeSelect }));
  },
};

// ---------------------------------------------------------------------
// Xarajatlar
// ---------------------------------------------------------------------

export const expenseService = {
  async getById(id: string): Promise<MoneyEntryDto> {
    const expense = await prisma.expense.findUnique({ where: { id }, select: expenseSelect });
    if (!expense) {
      throw AppError.notFound('Xarajat topilmadi');
    }
    return toExpenseDto(expense);
  },

  async list(query: MoneyListQuery): Promise<{ items: MoneyEntryDto[]; total: number }> {
    const where = {
      ...(buildWhere(query, 'spentAt') as Prisma.ExpenseWhereInput),
      ...(query.status ? { status: query.status } : {}),
    };
    const items = await prisma.expense.findMany({
      where,
      select: expenseSelect,
      orderBy: orderBy(query, 'spentAt') as Prisma.ExpenseOrderByWithRelationInput[],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.expense.count({ where });
    return { items: items.map(toExpenseDto), total };
  },

  async stats(query: MoneyListQuery): Promise<MoneyStatsDto> {
    const where = { ...(buildWhere(query, 'spentAt') as Prisma.ExpenseWhereInput), transaction: { status: 'COMPLETED' as const } };
    const grouped = await prisma.expense.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const categories = await prisma.expenseCategory.findMany({ select: { id: true, name: true } });
    const nameById = new Map(categories.map((category) => [category.id, category.name]));

    const byCategory = grouped
      .map((row) => ({
        id: row.categoryId,
        name: nameById.get(row.categoryId) ?? 'Boshqa',
        total: row._sum.amount?.toNumber() ?? 0,
        count: row._count._all,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      total: byCategory.reduce((sum, row) => sum + row.total, 0),
      count: byCategory.reduce((sum, row) => sum + row.count, 0),
      byCategory,
    };
  },

  async create(actor: AuthUser, input: CreateExpenseInput, client: ClientInfo): Promise<MoneyEntryDto> {
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
      select: { id: true, name: true },
    });
    if (!category) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'categoryId', message: 'Kategoriya topilmadi' },
      ]);
    }

    const occurredAt = toOccurredAt(input.date);
    // Chegara summadan katta va tasdiqlash ruxsati yo'q — rahbar tasdig'i kutiladi, pul yechilmaydi
    if (await requiresApproval(actor, input.amount)) {
      const pendingId = await prisma.$transaction(async (tx) => {
        const accountId = input.accountId ? await resolveAccountId(tx, input.accountId, input.method) : null;
        const expense = await tx.expense.create({
          data: {
            categoryId: category.id,
            amount: input.amount,
            method: input.method,
            accountId,
            spentAt: occurredAt,
            description: input.description ?? null,
            vendor: input.vendor ?? null,
            responsibleId: actor.id,
            status: 'PENDING',
          },
          select: { id: true, number: true },
        });
        await notifyApprovers(
          tx,
          { id: expense.id, number: expense.number, amount: input.amount, categoryName: category.name, description: input.description ?? null },
          actor.id,
        );
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'expense.requested',
          entityType: 'expense',
          entityId: expense.id,
          metadata: { number: expense.number, amount: input.amount, category: category.name, vendor: input.vendor ?? null },
          ...client,
        });
        return expense.id;
      });
      return toExpenseDto(await prisma.expense.findUniqueOrThrow({ where: { id: pendingId }, select: expenseSelect }));
    }
    await assertFinancialPeriodOpen(prisma, occurredAt);
    const approvedByActor = (await getApprovalThreshold()) > 0 && input.amount >= (await getApprovalThreshold());
    const id = await prisma.$transaction(async (tx) => {
      const accountId = await resolveAccountId(tx, input.accountId, input.method);
      const transaction = await recordTransaction(tx, {
        type: 'EXPENSE',
        amount: input.amount,
        accountId,
        occurredAt,
        description: input.description ?? category.name,
        categoryName: category.name,
        entityType: 'expense',
        createdById: actor.id,
      });

      const expense = await tx.expense.create({
        data: {
          categoryId: category.id,
          amount: input.amount,
          method: input.method,
          accountId,
          spentAt: occurredAt,
          description: input.description ?? null,
          vendor: input.vendor ?? null,
          responsibleId: actor.id,
          transactionId: transaction.id,
          status: 'PAID',
          ...(approvedByActor ? { approvedById: actor.id, approvedAt: new Date() } : {}),
        },
        select: { id: true, number: true },
      });
      await tx.transaction.update({ where: { id: transaction.id }, data: { entityId: expense.id } });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.created',
        entityType: 'expense',
        entityId: expense.id,
        metadata: { number: expense.number, amount: input.amount, category: category.name, method: input.method },
        ...client,
      });
      return expense.id;
    });

    return toExpenseDto(await prisma.expense.findUniqueOrThrow({ where: { id }, select: expenseSelect }));
  },

  async void(actor: AuthUser, id: string, input: VoidMoneyInput, client: ClientInfo): Promise<MoneyEntryDto> {
    const expense = await prisma.expense.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        amount: true,
        transactionId: true,
        salaryPaymentId: true,
        transaction: { select: { status: true, occurredAt: true } },
      },
    });
    if (!expense) {
      throw AppError.notFound('Xarajat topilmadi');
    }
    if (expense.salaryPaymentId) {
      throw AppError.unprocessable('Maosh to‘lovi maoshlar bo‘limida bekor qilinadi');
    }
    if (!expense.transaction || !expense.transactionId) {
      throw AppError.unprocessable('Xarajat hali to‘lanmagan — bekor qilish uchun “Rad etish”dan foydalaning');
    }
    if (expense.transaction.status !== 'COMPLETED') {
      throw AppError.conflict('Bu xarajat allaqachon bekor qilingan');
    }

    await assertFinancialPeriodOpen(prisma, expense.transaction.occurredAt);
    await prisma.$transaction(async (tx) => {
      await voidTransaction(tx, expense.transactionId!, { userId: actor.id, reason: input.reason });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'expense.voided',
        entityType: 'expense',
        entityId: id,
        metadata: { number: expense.number, amount: expense.amount.toNumber(), reason: input.reason },
        ...client,
      });
    });

    return toExpenseDto(await prisma.expense.findUniqueOrThrow({ where: { id }, select: expenseSelect }));
  },
};

// ---------------------------------------------------------------------
// Kategoriyalar va budjet
// ---------------------------------------------------------------------

export const financeCategoryService = {
  async incomeCategories(): Promise<CategoryDto[]> {
    const categories = await prisma.incomeCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        _count: { select: { incomes: true } },
      },
    });
    return categories.map((category) => ({
      id: category.id,
      key: category.key,
      name: category.name,
      isSystem: category.isSystem,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      usage: category._count.incomes,
    }));
  },

  async expenseCategories(): Promise<CategoryDto[]> {
    const categories = await prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        _count: { select: { expenses: true } },
      },
    });
    return categories.map((category) => ({
      id: category.id,
      key: category.key,
      name: category.name,
      isSystem: category.isSystem,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      usage: category._count.expenses,
    }));
  },

  async createCategory(
    actor: AuthUser,
    kind: 'income' | 'expense',
    input: CategoryInput,
    client: ClientInfo,
  ): Promise<CategoryDto[]> {
    const data = { key: input.key, name: input.name, sortOrder: input.sortOrder };
    const existing =
      kind === 'income'
        ? await prisma.incomeCategory.findUnique({ where: { key: input.key }, select: { id: true } })
        : await prisma.expenseCategory.findUnique({ where: { key: input.key }, select: { id: true } });
    if (existing) {
      throw AppError.conflict('Bunday kalitli kategoriya mavjud', [{ field: 'key', message: 'Kalit band' }]);
    }

    const created =
      kind === 'income'
        ? await prisma.incomeCategory.create({ data, select: { id: true } })
        : await prisma.expenseCategory.create({ data, select: { id: true } });
    await auditService.record({
      userId: actor.id,
      action: 'finance.category_created',
      entityType: kind,
      entityId: created.id,
      metadata: { kind, key: input.key, name: input.name },
      ...client,
    });

    return kind === 'income' ? this.incomeCategories() : this.expenseCategories();
  },

  async updateCategory(
    actor: AuthUser,
    kind: 'income' | 'expense',
    id: string,
    input: UpdateCategoryInput,
    client: ClientInfo,
  ): Promise<CategoryDto[]> {
    const category =
      kind === 'income'
        ? await prisma.incomeCategory.findUnique({ where: { id }, select: { id: true, isSystem: true, name: true } })
        : await prisma.expenseCategory.findUnique({ where: { id }, select: { id: true, isSystem: true, name: true } });
    if (!category) {
      throw AppError.notFound('Kategoriya topilmadi');
    }
    if (category.isSystem && input.isActive === false) {
      throw AppError.unprocessable('Tizim kategoriyasini o‘chirib bo‘lmaydi');
    }

    const data = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    };
    if (kind === 'income') {
      await prisma.incomeCategory.update({ where: { id }, data });
    } else {
      await prisma.expenseCategory.update({ where: { id }, data });
    }
    await auditService.record({
      userId: actor.id,
      action: 'finance.category_updated',
      entityType: kind,
      entityId: id,
      metadata: { kind, name: input.name ?? category.name, isActive: input.isActive ?? null },
      ...client,
    });

    return kind === 'income' ? this.incomeCategories() : this.expenseCategories();
  },
};

export const budgetService = {
  /** Oylik budjet: reja va haqiqiy xarajat (kategoriya kesimida) */
  async get(query: BudgetQuery): Promise<BudgetDto> {
    const budget = await prisma.budget.findUnique({
      where: { year_month: { year: query.year, month: query.month } },
      select: {
        note: true,
        lines: { select: { categoryId: true, plannedAmount: true, category: { select: { name: true } } } },
      },
    });

    const start = new Date(Date.UTC(query.year, query.month - 1, 1));
    const end = new Date(Date.UTC(query.year, query.month, 1));
    const actuals = await prisma.expense.groupBy({
      by: ['categoryId'],
      where: { spentAt: { gte: start, lt: end }, transaction: { status: 'COMPLETED' } },
      _sum: { amount: true },
    });
    const actualById = new Map(actuals.map((row) => [row.categoryId, row._sum.amount?.toNumber() ?? 0]));

    const categories = await prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
    const plannedById = new Map((budget?.lines ?? []).map((line) => [line.categoryId, line.plannedAmount.toNumber()]));

    const lines: BudgetLineDto[] = categories.map((category) => {
      const planned = plannedById.get(category.id) ?? 0;
      const actual = actualById.get(category.id) ?? 0;
      return {
        categoryId: category.id,
        categoryName: category.name,
        planned,
        actual,
        usage: planned === 0 ? 0 : Math.round((actual / planned) * 100),
        remaining: planned - actual,
      };
    });

    return {
      year: query.year,
      month: query.month,
      note: budget?.note ?? null,
      totalPlanned: lines.reduce((sum, line) => sum + line.planned, 0),
      totalActual: lines.reduce((sum, line) => sum + line.actual, 0),
      lines,
    };
  },

  /** Budjetni saqlaydi: nol bo‘lgan qatorlar o‘chiriladi */
  async save(actor: AuthUser, input: SaveBudgetInput, client: ClientInfo): Promise<BudgetDto> {
    const categoryIds = input.lines.map((line) => line.categoryId);
    if (categoryIds.length > 0) {
      const found = await prisma.expenseCategory.count({ where: { id: { in: categoryIds } } });
      if (found !== new Set(categoryIds).size) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'lines', message: 'Kategoriya topilmadi' },
        ]);
      }
    }

    await prisma.$transaction(async (tx) => {
      const budget = await tx.budget.upsert({
        where: { year_month: { year: input.year, month: input.month } },
        update: { note: input.note ?? null },
        create: { year: input.year, month: input.month, note: input.note ?? null, createdById: actor.id },
        select: { id: true },
      });

      await tx.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      const lines = input.lines.filter((line) => line.plannedAmount > 0);
      if (lines.length > 0) {
        await tx.budgetLine.createMany({
          data: lines.map((line) => ({
            budgetId: budget.id,
            categoryId: line.categoryId,
            plannedAmount: line.plannedAmount,
          })),
        });
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'budget.saved',
        entityType: 'budget',
        entityId: budget.id,
        metadata: {
          period: `${input.year}-${String(input.month).padStart(2, '0')}`,
          lines: lines.length,
          total: lines.reduce((sum, line) => sum + line.plannedAmount, 0),
        },
        ...client,
      });
    });

    return this.get({ year: input.year, month: input.month });
  },
};
