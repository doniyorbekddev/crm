/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Demo (yoki sinov) ma'lumotlarini tozalaydi — noldan boshlash uchun.
 *
 *   CONFIRM_CLEAR=yes npm run db:clear-demo
 *
 * O'chiriladi: leadlar va ularning qo'ng'iroq/follow-up/izohlari; o'quvchilar va ularga bog'liq hamma narsa
 * (to'lovlar, qaytarishlar, qarz, to'lov jadvali, guruh tarixi, davomat, uy vazifasi topshiriqlari, imtihon
 * natijalari, XP va nishonlar, ota-onalar, hujjatlar), o'quvchiga bog'langan tushumlar, o'qituvchi foizi,
 * bildirishnomalar va ogohlantirishlar; shu yozuvlarning moliyaviy daftardagi izlari va kassa qoldig'i.
 *
 * QOLADI: xodimlar va rollar, kurslar, guruhlar, o'qituvchi profillari va maosh qoidalari, lead manbalari,
 * tushum/xarajat kategoriyalari, kassalar, sozlamalar, XP qoidalari va daraja/nishon ro'yxati, audit jurnali.
 *
 * `EXTRAS=yes` bilan qo'shimcha demo yozuvlar ham ketadi: dars seanslari, uy vazifasi va imtihonlar,
 * maosh davrlari va to'lovlari (ularning xarajat yozuvlari bilan), o'quvchiga bog'lanmagan tushum va xarajatlar.
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
if (process.env.NODE_ENV === 'production') {
  console.error('Bu skript production bazasida ishlamaydi.');
  process.exit(1);
}
if (process.env.CONFIRM_CLEAR !== 'yes') {
  console.error('Tasdiqlash kerak: CONFIRM_CLEAR=yes npm run db:clear-demo');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const withExtras = process.env.EXTRAS === 'yes';

async function counts(): Promise<Record<string, number>> {
  const [leads, students, payments, debts, attendances, transactions, incomes, expenses, users, groups, courses, salaries] =
    await Promise.all([
      prisma.lead.count(),
      prisma.student.count(),
      prisma.payment.count(),
      prisma.debt.count(),
      prisma.attendance.count(),
      prisma.transaction.count(),
      prisma.income.count(),
      prisma.expense.count(),
      prisma.user.count(),
      prisma.group.count(),
      prisma.course.count(),
      prisma.teacherSalaryPeriod.count(),
    ]);
  return { leadlar: leads, oquvchilar: students, tolovlar: payments, qarzlar: debts, davomat: attendances, daftar: transactions, tushumlar: incomes, xarajatlar: expenses, xodimlar: users, guruhlar: groups, kurslar: courses, maoshlar: salaries };
}

async function main(): Promise<void> {
  const before = await counts();
  console.log('Oldin: ', before);

  await prisma.$transaction(async (tx) => {
    // --- O'quvchiga bog'liq yozuvlar ---
    await tx.xpTransaction.deleteMany({});
    await tx.studentBadge.deleteMany({});
    await tx.gamificationProfile.deleteMany({});
    await tx.streak.deleteMany({});
    await tx.studentProgressSnapshot.deleteMany({});
    await tx.homeworkSubmission.deleteMany({});
    await tx.examResult.deleteMany({});
    await tx.attendance.deleteMany({});
    await tx.studentParent.deleteMany({});
    await tx.parent.deleteMany({});
    await tx.paymentInstallment.deleteMany({});
    await tx.studentGroupChange.deleteMany({});
    await tx.commissionEntry.deleteMany({});

    // Moliyaviy daftar izlari: avval yozuv, keyin tranzaksiya
    const refundTransactions = (await tx.paymentRefund.findMany({ select: { transactionId: true } })).map((row) => row.transactionId);
    await tx.paymentRefund.deleteMany({});
    const paymentTransactions = (await tx.payment.findMany({ select: { transactionId: true } }))
      .map((row) => row.transactionId)
      .filter((id): id is string => Boolean(id));
    await tx.payment.deleteMany({});
    await tx.debt.deleteMany({});

    const studentIncomes = await tx.income.findMany({ where: { studentId: { not: null } }, select: { transactionId: true } });
    await tx.income.deleteMany({ where: { studentId: { not: null } } });

    await tx.document.deleteMany({ where: { OR: [{ studentId: { not: null } }, { leadId: { not: null } }] } });
    await tx.student.deleteMany({});

    // --- Leadlar ---
    await tx.call.deleteMany({});
    await tx.followUp.deleteMany({});
    await tx.leadNote.deleteMany({});
    await tx.leadActivity.deleteMany({});
    await tx.lead.deleteMany({});

    if (withExtras) {
      await tx.exam.deleteMany({});
      await tx.homework.deleteMany({});
      await tx.attendanceSession.deleteMany({});
      await tx.payrollAdjustment.deleteMany({});
      const salaryExpenses = await tx.expense.findMany({ where: { salaryPaymentId: { not: null } }, select: { transactionId: true } });
      await tx.expense.deleteMany({ where: { salaryPaymentId: { not: null } } });
      const salaryTransactions = (await tx.teacherSalaryPayment.findMany({ select: { id: true } })).map((row) => row.id);
      await tx.teacherSalaryPayment.deleteMany({});
      await tx.teacherSalaryPeriod.deleteMany({});
      const otherExpenses = await tx.expense.findMany({ select: { transactionId: true } });
      await tx.expense.deleteMany({});
      const otherIncomes = await tx.income.findMany({ select: { transactionId: true } });
      await tx.income.deleteMany({});
      const ids = [...salaryExpenses, ...otherExpenses, ...otherIncomes]
        .map((row) => row.transactionId)
        .filter((id): id is string => Boolean(id));
      await tx.transaction.deleteMany({ where: { OR: [{ id: { in: ids } }, { entityId: { in: salaryTransactions } }] } });
    }

    const ledgerIds = [...refundTransactions, ...paymentTransactions, ...studentIncomes.map((row) => row.transactionId)].filter(
      (id): id is string => Boolean(id),
    );
    await tx.transaction.deleteMany({ where: { OR: [{ id: { in: ledgerIds } }, { entityType: { in: ['payment', 'paymentRefund'] } }] } });

    await tx.notification.deleteMany({});
    await tx.alert.deleteMany({});
  });

  // --- Kassa qoldiqlari daftardagi qolgan yozuvlarga moslanadi ---
  const accounts = await prisma.financialAccount.findMany({ select: { id: true } });
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

  console.log('Keyin: ', await counts());
  console.log(`\n✔ Tozalandi${withExtras ? ' (qo‘shimcha demo yozuvlar bilan)' : ''}. Xodimlar, kurslar, guruhlar va sozlamalar saqlandi.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
