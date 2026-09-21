/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Moliya yozuvlarini tozalaydi — moliyani noldan boshlash uchun.
 *
 *   CONFIRM_CLEAR=yes npm run db:clear-finance
 *
 * O'CHIRILADI: tushumlar (o'quvchi to'loviga bog'lanmaganlari), xarajatlar, maosh davrlari,
 * maosh to'lovlari va ularning xarajat yozuvlari, payroll tuzatishlari, shu davrlarga tegishli
 * o'qituvchi foizi yozuvlari, chek/hujjat fayl yozuvlari, hamda bularning moliyaviy daftardagi
 * izlari (kassa o'tkazmalari va demo "Boshlang'ich qoldiq" yozuvlari bilan birga).
 * Oxirida har bir kassa qoldig'i qolgan yozuvlar bo'yicha qayta hisoblanadi.
 *
 * QOLADI: o'quvchilar, leadlar, to'lovlar va ularga bog'liq tushumlar, guruhlar, kurslar,
 * xodimlar, kategoriyalar, kassalar ro'yxati, sozlamalar, audit jurnali.
 *
 * Qo'shimcha:
 *   KEEP_OPENING=yes — "Boshlang'ich qoldiq" yozuvlari saqlanadi (kassa qoldig'i nolga tushmaydi)
 *   BUDGETS=yes      — byudjet rejalari ham o'chiriladi
 *   DRY_RUN=yes      — hech narsa o'chirilmaydi, faqat nima o'chishi ko'rsatiladi
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ quiet: true });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL topilmadi. backend/.env faylini tekshiring.');
  process.exit(1);
}

const dryRun = process.env.DRY_RUN === 'yes';
if (!dryRun && process.env.CONFIRM_CLEAR !== 'yes') {
  console.error('Tasdiqlash kerak: CONFIRM_CLEAR=yes npm run db:clear-finance');
  console.error('Avval ko‘rib chiqish uchun: DRY_RUN=yes npm run db:clear-finance');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const keepOpening = process.env.KEEP_OPENING === 'yes';
const withBudgets = process.env.BUDGETS === 'yes';

/** O'quvchi to'lovlaridan kelgan daftar yozuvlari hech qachon o'chirilmaydi */
const OPENING_BALANCE = 'opening-balance';

async function counts(): Promise<Record<string, number>> {
  const [incomes, studentIncomes, expenses, periods, salaryPayments, adjustments, transactions, budgets, students, payments] =
    await Promise.all([
      prisma.income.count(),
      prisma.income.count({ where: { studentId: { not: null } } }),
      prisma.expense.count(),
      prisma.teacherSalaryPeriod.count(),
      prisma.teacherSalaryPayment.count(),
      prisma.payrollAdjustment.count(),
      prisma.transaction.count(),
      prisma.budget.count(),
      prisma.student.count(),
      prisma.payment.count(),
    ]);
  return {
    tushumlar: incomes,
    'tushum (o‘quvchiga bog‘liq)': studentIncomes,
    xarajatlar: expenses,
    'maosh davrlari': periods,
    'maosh to‘lovlari': salaryPayments,
    'payroll tuzatishlari': adjustments,
    daftar: transactions,
    byudjetlar: budgets,
    'o‘quvchilar (tegilmaydi)': students,
    'to‘lovlar (tegilmaydi)': payments,
  };
}

async function main(): Promise<void> {
  const before = await counts();
  console.log('\nOldin:', before);

  if (dryRun) {
    const [expenses, incomes, transactions] = await Promise.all([
      prisma.expense.count(),
      prisma.income.count({ where: { studentId: null } }),
      prisma.transaction.count({
        where: {
          OR: [
            { entityType: { in: ['expense', 'income', 'teacherSalaryPayment', 'transfer'] } },
            ...(keepOpening ? [] : [{ entityType: OPENING_BALANCE }]),
          ],
        },
      }),
    ]);
    console.log(
      `\nO‘chirilardi: ${expenses} ta xarajat, ${incomes} ta tushum, ${transactions} ta daftar yozuvi` +
        `${withBudgets ? `, ${before.byudjetlar} ta byudjet` : ''}.`,
    );
    console.log('Haqiqatan o‘chirish uchun: CONFIRM_CLEAR=yes npm run db:clear-finance\n');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Chek va hujjat yozuvlari (fayllar uploads papkasida qoladi)
    await tx.document.deleteMany({ where: { OR: [{ expenseId: { not: null } }, { incomeId: { not: null } }] } });

    // --- Maosh: tuzatishlar → foiz yozuvlari → maosh xarajatlari → to'lovlar → davrlar ---
    await tx.payrollAdjustment.deleteMany({});
    await tx.commissionEntry.deleteMany({ where: { salaryPeriodId: { not: null } } });

    const salaryExpenses = await tx.expense.findMany({ where: { salaryPaymentId: { not: null } }, select: { transactionId: true } });
    await tx.expense.deleteMany({ where: { salaryPaymentId: { not: null } } });

    const salaryPaymentIds = (await tx.teacherSalaryPayment.findMany({ select: { id: true } })).map((row) => row.id);
    await tx.teacherSalaryPayment.deleteMany({});
    await tx.teacherSalaryPeriod.deleteMany({});

    // --- Xarajatlar va tushumlar ---
    const otherExpenses = await tx.expense.findMany({ select: { transactionId: true } });
    await tx.expense.deleteMany({});

    // O'quvchi to'loviga bog'langan tushumlar saqlanadi — ular real to'lovlarning bir qismi
    const incomes = await tx.income.findMany({ where: { studentId: null }, select: { transactionId: true } });
    await tx.income.deleteMany({ where: { studentId: null } });

    // --- Moliyaviy daftar izlari ---
    const ledgerIds = [...salaryExpenses, ...otherExpenses, ...incomes]
      .map((row) => row.transactionId)
      .filter((id): id is string => Boolean(id));
    const entityTypes = ['teacherSalaryPayment', 'transfer', ...(keepOpening ? [] : [OPENING_BALANCE])];
    await tx.transaction.deleteMany({
      where: { OR: [{ id: { in: ledgerIds } }, { entityId: { in: salaryPaymentIds } }, { entityType: { in: entityTypes } }] },
    });

    if (withBudgets) {
      await tx.budgetLine.deleteMany({});
      await tx.budget.deleteMany({});
    }
  });

  // --- Kassa qoldiqlari qolgan yozuvlarga moslanadi ---
  const accounts = await prisma.financialAccount.findMany({ select: { id: true, name: true } });
  for (const account of accounts) {
    const rows = await prisma.transaction.groupBy({
      by: ['type'],
      where: { accountId: account.id, status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const balance = rows.reduce((sum, row) => {
      const amount = row._sum.amount?.toNumber() ?? 0;
      return sum + (row.type === 'INCOME' || row.type === 'TRANSFER' ? amount : -amount);
    }, 0);
    await prisma.financialAccount.update({ where: { id: account.id }, data: { balance } });
  }

  console.log('\nKeyin: ', await counts());
  const balances = await prisma.financialAccount.findMany({ select: { name: true, balance: true }, orderBy: { sortOrder: 'asc' } });
  console.log('\nKassa qoldiqlari:');
  for (const account of balances) console.log(`  ${account.name.padEnd(16)} ${account.balance.toString()}`);
  console.log('\n✔ Moliya tozalandi. O‘quvchilar, leadlar, guruhlar va xodimlarga tegilmadi.\n');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
