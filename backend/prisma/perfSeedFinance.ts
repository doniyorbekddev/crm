/* eslint-disable no-console -- CLI skript: jarayon natijasi terminalga chiqariladi */
/**
 * Moliya, kadrlar va audit modullari uchun qo‘shimcha katta hajm (roadmap phase 16).
 *
 *   PERF_DATABASE_URL="postgresql://crm:...@localhost:5432/crm_perf" npm run db:perf-seed:finance
 *
 * Oldin `db:perf-seed` ishga tushirilgan bo‘lishi kerak (o‘quvchilar, guruhlar, o‘qituvchilar).
 * Xavfsizlik: faqat nomida "perf" bo‘lgan, DATABASE_URL dan farqli bazada ishlaydi.
 * Takror ishga tushirilsa o‘tkazib yuboriladi (daftarda 60 000 dan ortiq yozuv bo‘lsa).
 *
 * Hajm (24 oy): +60 000 to‘lov, 3 000 tushum, 12 000 xarajat, 400 kutilayotgan xarajat, 600 qaytarish,
 * 400 o‘tkazma, 25 xodim va 600 maosh davri (to‘lovlari bilan), o‘qituvchi maosh to‘lovlari,
 * 150 000 audit yozuvi, 3 000 ogohlantirish, 600 xodim hujjati, 24 oylik budjet.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  AlertSeverity,
  AlertType,
  DocumentCategory,
  EmployeePosition,
  ExpenseStatus,
  PaymentMethod,
  TransactionType,
} from '../src/generated/prisma/client.js';

config({ quiet: true });

const url = process.env.PERF_DATABASE_URL?.trim();
if (!url || !url.includes('perf') || url === process.env.DATABASE_URL?.trim()) {
  console.error('PERF_DATABASE_URL alohida "perf" bazasini ko‘rsatishi kerak (DATABASE_URL bilan bir xil bo‘lmasin).');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const SCALE = {
  months: 24,
  payments: 60_000,
  incomes: 3_000,
  expenses: 12_000,
  pendingExpenses: 400,
  refunds: 600,
  transfers: 400,
  employees: 25,
  auditLogs: 150_000,
  alerts: 3_000,
  documents: 600,
};

const DAY = 86_400_000;

/** Takrorlanadigan tasodifiy sonlar */
let seed = 20260914;
function random(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}
function between(min: number, max: number): number {
  return Math.floor(min + random() * (max - min + 1));
}

async function insert<T>(label: string, rows: T[], write: (chunk: T[]) => Promise<unknown>, size = 4_000): Promise<void> {
  for (let index = 0; index < rows.length; index += size) {
    await write(rows.slice(index, index + size));
  }
  console.log(`✔ ${label}: ${rows.length.toLocaleString('uz-UZ')}`);
}

type LedgerRow = {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: string | null;
  occurredAt: Date;
  categoryName: string;
  entityType: string;
  entityId: string | null;
  description: string;
};

const AUDIT_ACTIONS: ReadonlyArray<[string, string]> = [
  ['auth.login', 'user'],
  ['auth.login', 'user'],
  ['auth.login_failed', 'user'],
  ['lead.created', 'lead'],
  ['lead.status_changed', 'lead'],
  ['payment.created', 'payment'],
  ['student.updated', 'student'],
  ['expense.created', 'expense'],
  ['salary.calculated', 'salaryPeriod'],
  ['homework.graded', 'homework'],
  ['group.updated', 'group'],
];

const ALERT_TYPES: readonly AlertType[] = ['HIGH_DEBT', 'LOW_ATTENDANCE', 'HIGH_DROPOUT', 'OVERDUE_FOLLOWUPS', 'BUDGET_EXCEEDED', 'LOW_GROUP_CAPACITY', 'CONVERSION_DROP', 'CASH_SHORTAGE'];
const ALERT_SEVERITIES: readonly AlertSeverity[] = ['INFO', 'WARNING', 'WARNING', 'CRITICAL'];

async function main(): Promise<void> {
  const existing = await prisma.transaction.count();
  if (existing > 60_000) {
    console.log(`Daftarda allaqachon ${existing} yozuv bor — moliya perf seed o‘tkazib yuborildi.`);
    return;
  }

  const now = new Date();
  const start = new Date(now.getTime() - SCALE.months * 30 * DAY);
  const inRange = (from: Date = start, to: Date = now) => new Date(from.getTime() + random() * (to.getTime() - from.getTime()));

  const students = await prisma.student.findMany({ select: { id: true, courseId: true, groupId: true, group: { select: { teacherId: true } } } });
  if (students.length === 0) throw new Error('O‘quvchilar yo‘q — avval db:perf-seed ishga tushiring');
  const users = await prisma.user.findMany({ select: { id: true, role: { select: { key: true } } } });
  const managers = users.filter((user) => user.role.key === 'SALES_MANAGER');
  const accounts = await prisma.financialAccount.findMany({ select: { id: true, key: true } });
  const accountFor = (key: string) => accounts.find((account) => account.key === key)?.id ?? accounts[0]!.id;
  const cash = accountFor('CASH');
  const bank = accountFor('BANK');
  const allExpenseCategories = await prisma.expenseCategory.findMany({ select: { id: true, key: true, name: true } });
  const expenseCategories = allExpenseCategories.filter((category) => category.key !== 'TEACHER_SALARY' && category.key !== 'EMPLOYEE_SALARY');
  const incomeCategories = (await prisma.incomeCategory.findMany({ select: { id: true, key: true, name: true } })).filter((category) => category.key !== 'STUDENT_PAYMENT');
  // Maosh to'lovi haqiqiy oqimdagidek xarajat yozuvi ham oladi (salary.service pay)
  const employeeSalaryCategory = await prisma.expenseCategory.upsert({
    where: { key: 'EMPLOYEE_SALARY' },
    update: {},
    create: { key: 'EMPLOYEE_SALARY', name: 'Xodim maoshi', isSystem: true, sortOrder: 2 },
    select: { id: true },
  });
  const teacherSalaryCategory = await prisma.expenseCategory.upsert({
    where: { key: 'TEACHER_SALARY' },
    update: {},
    create: { key: 'TEACHER_SALARY', name: 'O‘qituvchi maoshi', isSystem: true, sortOrder: 1 },
    select: { id: true },
  });

  const ledger: LedgerRow[] = [];
  const balance = new Map<string, number>();
  const move = (accountId: string | null, type: TransactionType, amount: number) => {
    if (!accountId) return;
    const delta = type === 'INCOME' || type === 'TRANSFER' ? amount : -amount;
    balance.set(accountId, (balance.get(accountId) ?? 0) + delta);
  };
  const record = (row: Omit<LedgerRow, 'id'> & { id?: string }): string => {
    const id = row.id ?? randomUUID();
    ledger.push({ ...row, id });
    move(row.accountId, row.type, row.amount);
    return id;
  };

  // --- O'quvchi to'lovlari (24 oy) ---
  const methods: readonly PaymentMethod[] = ['CASH', 'CASH', 'CARD', 'CLICK', 'PAYME'];
  const payments: Array<Record<string, unknown> & { id: string; amount: number; paidAt: Date }> = [];
  for (let index = 0; index < SCALE.payments; index += 1) {
    const student = pick(students);
    const method = pick(methods);
    const amount = pick([500_000, 800_000, 1_000_000, 1_000_000, 1_500_000]);
    const paidAt = inRange();
    const id = randomUUID();
    const transactionId = record({
      type: 'INCOME',
      amount,
      accountId: accountFor(method),
      occurredAt: paidAt,
      categoryName: 'O‘quvchi to‘lovi',
      entityType: 'payment',
      entityId: id,
      description: 'Perf to‘lov (moliya)',
    });
    payments.push({
      id,
      studentId: student.id,
      courseId: student.courseId,
      groupId: student.groupId,
      teacherId: student.group?.teacherId ?? null,
      amount,
      method,
      paidAt,
      managerId: managers.length ? pick(managers).id : null,
      transactionId,
      createdAt: paidAt,
    });
  }

  // --- Qaytarishlar ---
  const refunds: Array<Record<string, unknown>> = [];
  const refunded = new Set<string>();
  while (refunds.length < SCALE.refunds) {
    const payment = pick(payments);
    if (refunded.has(payment.id)) continue;
    refunded.add(payment.id);
    const id = randomUUID();
    const amount = Math.min(payment.amount, 500_000);
    const refundedAt = inRange(payment.paidAt, new Date(Math.min(payment.paidAt.getTime() + 30 * DAY, now.getTime())));
    const transactionId = record({ type: 'REFUND', amount, accountId: cash, occurredAt: refundedAt, categoryName: 'Qaytarilgan to‘lov', entityType: 'paymentRefund', entityId: id, description: 'Perf qaytarish' });
    refunds.push({ id, paymentId: payment.id, amount, method: 'CASH', accountId: cash, refundedAt, reason: 'Perf qaytarish', transactionId, createdAt: refundedAt });
  }

  // --- Boshqa tushumlar ---
  const incomes: Array<Record<string, unknown>> = [];
  for (let index = 0; index < SCALE.incomes; index += 1) {
    const category = pick(incomeCategories);
    const id = randomUUID();
    const amount = pick([100_000, 200_000, 350_000]);
    const receivedAt = inRange();
    const transactionId = record({ type: 'INCOME', amount, accountId: cash, occurredAt: receivedAt, categoryName: category.name, entityType: 'income', entityId: id, description: 'Perf tushum' });
    incomes.push({ id, categoryId: category.id, amount, method: 'CASH', accountId: cash, receivedAt, transactionId, createdAt: receivedAt });
  }

  // --- Xarajatlar ---
  const expenses: Array<Record<string, unknown>> = [];
  for (let index = 0; index < SCALE.expenses; index += 1) {
    const category = pick(expenseCategories);
    const id = randomUUID();
    const amount = pick([150_000, 400_000, 900_000, 2_500_000, 6_000_000]);
    const spentAt = inRange();
    const transactionId = record({ type: 'EXPENSE', amount, accountId: pick([cash, cash, bank]), occurredAt: spentAt, categoryName: category.name, entityType: 'expense', entityId: id, description: 'Perf xarajat' });
    expenses.push({ id, categoryId: category.id, amount, method: 'CASH', accountId: cash, spentAt, transactionId, status: 'PAID', vendor: 'Perf yetkazib beruvchi', createdAt: spentAt });
  }
  const openStatuses: readonly ExpenseStatus[] = ['PENDING', 'APPROVED', 'UPCOMING'];
  for (let index = 0; index < SCALE.pendingExpenses; index += 1) {
    const createdAt = inRange(new Date(now.getTime() - 60 * DAY));
    expenses.push({
      id: randomUUID(),
      categoryId: pick(expenseCategories).id,
      amount: pick([500_000, 1_200_000, 3_000_000]),
      method: 'CASH',
      spentAt: new Date(createdAt.getTime() + between(0, 45) * DAY),
      status: pick(openStatuses),
      createdAt,
    });
  }

  // --- Kassalar o'rtasida o'tkazma ---
  for (let index = 0; index < SCALE.transfers; index += 1) {
    const occurredAt = inRange();
    const amount = pick([1_000_000, 3_000_000, 5_000_000]);
    const outId = randomUUID();
    const inId = randomUUID();
    record({ id: outId, type: 'EXPENSE', amount, accountId: cash, occurredAt, categoryName: 'Kassalar o‘rtasida o‘tkazma', entityType: 'transfer', entityId: inId, description: 'Perf o‘tkazma' });
    record({ id: inId, type: 'TRANSFER', amount, accountId: bank, occurredAt, categoryName: 'Kassalar o‘rtasida o‘tkazma', entityType: 'transfer', entityId: outId, description: 'Perf o‘tkazma' });
  }

  // --- Xodimlar va ularning maoshi ---
  const positions: readonly EmployeePosition[] = ['ADMINISTRATOR', 'MANAGER', 'ACCOUNTANT', 'CLEANER', 'SECURITY', 'CALL_CENTER'];
  const employees = Array.from({ length: SCALE.employees }, (_, index) => ({
    id: randomUUID(),
    firstName: `Xodim${index + 1}`,
    lastName: 'Perf',
    position: pick(positions),
    baseSalary: pick([3_000_000, 4_000_000, 5_500_000]),
    hireDate: new Date(`${start.toISOString().slice(0, 10)}T00:00:00.000Z`),
  }));
  const employeePeriods: Array<Record<string, unknown> & { id: string }> = [];
  const salaryPayments: Array<Record<string, unknown>> = [];
  const salaryExpenses: Array<Record<string, unknown>> = [];
  for (const employee of employees) {
    for (let offset = 0; offset < SCALE.months; offset += 1) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const settled = offset > 0;
      const id = randomUUID();
      employeePeriods.push({
        id,
        employeeId: employee.id,
        year: monthStart.getUTCFullYear(),
        month: monthStart.getUTCMonth() + 1,
        salaryType: 'FIXED',
        baseAmount: employee.baseSalary,
        totalAmount: employee.baseSalary,
        paidAmount: settled ? employee.baseSalary : 0,
        remainingAmount: settled ? 0 : employee.baseSalary,
        status: settled ? 'PAID' : 'CALCULATED',
      });
      if (!settled) continue;
      const paymentId = randomUUID();
      const paidAt = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 5, 6));
      const transactionId = record({ type: 'EXPENSE', amount: employee.baseSalary, accountId: cash, occurredAt: paidAt, categoryName: 'Xodim maoshi', entityType: 'teacherSalaryPayment', entityId: paymentId, description: 'Perf xodim maoshi' });
      salaryPayments.push({ id: paymentId, periodId: id, amount: employee.baseSalary, kind: 'SALARY', method: 'CASH', accountId: cash, paidAt, createdAt: paidAt });
      salaryExpenses.push({ categoryId: employeeSalaryCategory.id, amount: employee.baseSalary, method: 'CASH', accountId: cash, spentAt: paidAt, transactionId, salaryPaymentId: paymentId, status: 'PAID', createdAt: paidAt });
    }
  }
  const teacherPeriods = await prisma.teacherSalaryPeriod.findMany({
    where: { status: 'PAID', teacherProfileId: { not: null }, payments: { none: {} } },
    select: { id: true, year: true, month: true, totalAmount: true },
  });
  for (const period of teacherPeriods) {
    const paymentId = randomUUID();
    const amount = period.totalAmount.toNumber();
    const paidAt = new Date(Date.UTC(period.year, period.month, 5, 6));
    const transactionId = record({ type: 'EXPENSE', amount, accountId: cash, occurredAt: paidAt, categoryName: 'O‘qituvchi maoshi', entityType: 'teacherSalaryPayment', entityId: paymentId, description: 'Perf o‘qituvchi maoshi' });
    salaryPayments.push({ id: paymentId, periodId: period.id, amount, kind: 'SALARY', method: 'CASH', accountId: cash, paidAt, createdAt: paidAt });
    salaryExpenses.push({ categoryId: teacherSalaryCategory.id, amount, method: 'CASH', accountId: cash, spentAt: paidAt, transactionId, salaryPaymentId: paymentId, status: 'PAID', createdAt: paidAt });
  }

  await insert('moliyaviy daftar', ledger, (chunk) => prisma.transaction.createMany({ data: chunk }));
  await insert('to‘lovlar', payments, (chunk) => prisma.payment.createMany({ data: chunk as never }));
  await insert('qaytarishlar', refunds, (chunk) => prisma.paymentRefund.createMany({ data: chunk as never }));
  await insert('tushumlar', incomes, (chunk) => prisma.income.createMany({ data: chunk as never }));
  await insert('xarajatlar', expenses, (chunk) => prisma.expense.createMany({ data: chunk as never }));
  await insert('xodimlar', employees, (chunk) => prisma.employee.createMany({ data: chunk }));
  await insert('xodim maosh davrlari', employeePeriods, (chunk) => prisma.teacherSalaryPeriod.createMany({ data: chunk as never }));
  await insert('maosh to‘lovlari', salaryPayments, (chunk) => prisma.teacherSalaryPayment.createMany({ data: chunk as never }));
  await insert('maosh xarajatlari', salaryExpenses, (chunk) => prisma.expense.createMany({ data: chunk as never }));

  for (const [accountId, delta] of balance) {
    await prisma.financialAccount.update({ where: { id: accountId }, data: { balance: { increment: delta } } });
  }
  console.log('✔ kassa qoldiqlari daftarga moslandi');

  // --- Budjet (har oy 6 kategoriya) ---
  let budgets = 0;
  for (let offset = 0; offset < SCALE.months; offset += 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const year = month.getUTCFullYear();
    const monthNumber = month.getUTCMonth() + 1;
    const exists = await prisma.budget.findUnique({ where: { year_month: { year, month: monthNumber } }, select: { id: true } });
    if (exists) continue;
    await prisma.budget.create({
      data: {
        year,
        month: monthNumber,
        lines: { create: expenseCategories.slice(0, 6).map((category) => ({ categoryId: category.id, plannedAmount: pick([2_000_000, 5_000_000, 10_000_000]) })) },
      },
    });
    budgets += 1;
  }
  console.log(`✔ budjet oylari: ${budgets}`);

  // --- Audit jurnali ---
  const userIds = users.map((user) => user.id);
  const audit = Array.from({ length: SCALE.auditLogs }, (_, index) => {
    const [action, entityType] = pick(AUDIT_ACTIONS);
    const unknownEmail = action === 'auth.login_failed' && random() < 0.3;
    return {
      userId: unknownEmail ? null : pick(userIds),
      action,
      entityType,
      entityId: randomUUID().slice(0, 25),
      ip: `10.0.${between(0, 255)}.${between(1, 254)}`,
      userAgent: 'perf-seed',
      metadata: unknownEmail ? { email: `ghost${index % 500}@perf.local`, reason: 'unknown_email' } : { perf: true },
      createdAt: inRange(),
    };
  });
  await insert('audit yozuvlari', audit, (chunk) => prisma.auditLog.createMany({ data: chunk }), 5_000);

  // --- Ogohlantirishlar tarixi (arxivlangan kalit bilan — dvigatel ularni qayta ishlamaydi) ---
  const alerts = Array.from({ length: SCALE.alerts }, (_, index) => {
    const createdAt = inRange();
    const resolved = random() < 0.85;
    return {
      type: pick(ALERT_TYPES),
      severity: pick(ALERT_SEVERITIES),
      title: `Perf ogohlantirish ${index + 1}`,
      message: 'Unumdorlik sinovi uchun tarixiy ogohlantirish',
      entityType: 'analytics',
      dedupeKey: `perf-history-${index}#${createdAt.getTime()}`,
      createdAt,
      resolvedAt: resolved ? new Date(createdAt.getTime() + between(1, 10) * DAY) : null,
      readAt: resolved || random() < 0.5 ? createdAt : null,
    };
  });
  await insert('ogohlantirishlar', alerts, (chunk) => prisma.alert.createMany({ data: chunk }));

  // --- Xodim va o'qituvchi hujjatlari (faqat yozuv — fayl diskda emas) ---
  const profiles = await prisma.teacherProfile.findMany({ select: { id: true } });
  const categories: readonly DocumentCategory[] = ['CONTRACT', 'PASSPORT', 'CERTIFICATE', 'OTHER'];
  const documents = Array.from({ length: SCALE.documents }, (_, index) => {
    const forTeacher = profiles.length > 0 && random() < 0.5;
    const createdAt = inRange();
    return {
      ...(forTeacher ? { teacherProfileId: pick(profiles).id } : { employeeId: pick(employees).id }),
      originalName: `hujjat-${index + 1}.pdf`,
      mimeType: 'application/pdf',
      size: 120_000,
      storagePath: `perf/${randomUUID()}.pdf`,
      category: pick(categories),
      expiresAt: random() < 0.6 ? new Date(now.getTime() + between(-60, 720) * DAY) : null,
      createdAt,
    };
  });
  await insert('hujjatlar', documents, (chunk) => prisma.document.createMany({ data: chunk }));

  console.log('\nMoliya perf seed yakunlandi.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
