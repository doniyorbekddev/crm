/* eslint-disable no-console -- CLI skript: o‘lchov natijasi terminalga chiqariladi */
/**
 * Og‘ir servislar vaqtini o‘lchash (roadmap phase 16).
 *
 *   DATABASE_URL="postgresql://crm:...@localhost:5432/crm_perf?schema=public" PERF_OUT=before.json npm run perf:bench
 *
 * Har bir o‘lchov: 1 ta qizdirish + 5 ta takror, median ko‘rsatiladi. `PERF_OUT` berilsa natija JSON faylga
 * yoziladi — indeks yoki kod o‘zgarishidan oldingi va keyingi natijani solishtirish uchun.
 * Xavfsizlik: faqat nomida "perf" bo‘lgan bazada ishlaydi (alerts.evaluate yozuv qiladi).
 */
import { writeFile } from 'node:fs/promises';

process.env.LOG_LEVEL = 'silent';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('perf')) {
    console.error('DATABASE_URL perf bazasini ko‘rsatishi kerak (masalan, .../crm_perf).');
    process.exit(1);
  }

  // Muhit tekshirilgandan keyin yuklanadi — servislar shu bazaga ulanadi
  const { prisma } = await import('../src/config/database.js');
  const { dashboardService } = await import('../src/services/dashboard.service.js');
  const { executiveService } = await import('../src/services/executive.service.js');
  const { activityService } = await import('../src/services/activity.service.js');
  const { financeService } = await import('../src/services/finance.service.js');
  const { budgetService } = await import('../src/services/incomeExpense.service.js');
  const { analyticsService } = await import('../src/services/analytics.service.js');
  const { digestService } = await import('../src/services/digest.service.js');
  const { alertService } = await import('../src/services/alert.service.js');
  const { reportService } = await import('../src/services/report.service.js');
  const { auditLogService } = await import('../src/services/audit.service.js');
  const { notificationService } = await import('../src/services/notification.service.js');
  const { currentBusinessMonth } = await import('../src/utils/dates.js');
  const { reportQuerySchema } = await import('../src/validators/report.validator.js');
  const { auditListQuerySchema } = await import('../src/validators/audit.validator.js');
  const { notificationListQuerySchema } = await import('../src/validators/notification.validator.js');
  const { cashFlowQuerySchema, financeRangeQuerySchema } = await import('../src/validators/finance.validator.js');
  const { activityQuerySchema } = await import('../src/validators/activity.validator.js');
  const { analyticsRangeQuerySchema, cohortQuerySchema, profitabilityQuerySchema } = await import('../src/validators/analytics.validator.js');

  const owner = await prisma.user.findFirstOrThrow({
    where: { role: { key: 'OWNER' } },
    select: { id: true, email: true, firstName: true, lastName: true, roleId: true, branchId: true, role: { select: { key: true } } },
  });
  const actor = { id: owner.id, email: owner.email, firstName: owner.firstName, lastName: owner.lastName, roleId: owner.roleId, roleKey: owner.role.key, branchId: owner.branchId };

  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const range12 = { from: iso(new Date(today.getFullYear(), today.getMonth() - 11, 1)), to: iso(today) };

  const counts = {
    transactions: await prisma.transaction.count(),
    payments: await prisma.payment.count(),
    expenses: await prisma.expense.count(),
    students: await prisma.student.count(),
    attendances: await prisma.attendance.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log('Hajm:', counts);

  const firstPage = await activityService.feed(actor, activityQuerySchema.parse({ limit: '30' }));

  const cases: Array<[string, () => Promise<unknown>, number?]> = [
    ['dashboard.summary', () => dashboardService.summary(actor)],
    ['executive: joriy oy', () => executiveService.summary({})],
    ['executive: 12 oy', () => executiveService.summary(range12)],
    ['activity: 1-sahifa', () => activityService.feed(actor, activityQuerySchema.parse({ limit: '30' }))],
    ['activity: 2-sahifa', () => activityService.feed(actor, activityQuerySchema.parse({ limit: '30', cursor: firstPage.nextCursor ?? undefined }))],
    ['finance.summary: 12 oy', () => financeService.summary(financeRangeQuerySchema.parse(range12))],
    ['finance.cashFlow oylik: 12 oy', () => financeService.cashFlow(cashFlowQuerySchema.parse({ ...range12, period: 'month' }))],
    ['finance.cashFlowStatement: 12 oy', () => financeService.cashFlowStatement(financeRangeQuerySchema.parse(range12))],
    ['finance.profitLoss: 12 oy', () => financeService.profitLoss(financeRangeQuerySchema.parse(range12))],
    ['budget: joriy oy', () => budgetService.get(currentBusinessMonth())],
    ['analytics.unitEconomics: 12 oy', () => analyticsService.unitEconomics(analyticsRangeQuerySchema.parse(range12))],
    ['analytics.profitability kurs', () => analyticsService.profitability(profitabilityQuerySchema.parse({ ...range12, dimension: 'course' }))],
    ['analytics.profitability o‘qituvchi', () => analyticsService.profitability(profitabilityQuerySchema.parse({ ...range12, dimension: 'teacher' }))],
    ['analytics.cohorts: 12 oy', () => analyticsService.cohorts(cohortQuerySchema.parse({ months: '12' }))],
    ['analytics.sources: 12 oy', () => analyticsService.sources(analyticsRangeQuerySchema.parse(range12))],
    ['digest.build', () => digestService.build()],
    ['alerts.evaluate', () => alertService.evaluate(new Date()), 3],
    ['report profit oylik', () => reportService.build('profit', reportQuerySchema.parse({ ...range12, groupBy: 'month' }))],
    ['report payments kunlik', () => reportService.build('payments', reportQuerySchema.parse({ ...range12, groupBy: 'day' }))],
    ['report teachers', () => reportService.build('teachers', reportQuerySchema.parse(range12))],
    ['report debts', () => reportService.build('debts', reportQuerySchema.parse({}))],
    // PHASE 14: qo'ng'iroqcha har sahifada chaqiriladi — sekinlashsa butun ilova sekinlashadi
    ['notification: qo‘ng‘iroqcha xulosasi', () => notificationService.summary(actor)],
    ['notification: 1-sahifa', () => notificationService.list(actor, notificationListQuerySchema.parse({}))],
    ['audit: 1-sahifa', () => auditLogService.list(auditListQuerySchema.parse({}))],
    ['audit: filtrlar', () => auditLogService.filters()],
    [
      'login blok: email bo‘yicha hisob',
      () =>
        prisma.auditLog.count({
          where: {
            action: 'auth.login_failed',
            userId: null,
            createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
            metadata: { path: ['email'], equals: 'ghost1@perf.local' },
          },
        }),
    ],
  ];

  const results: Record<string, { median: number; min: number; max: number }> = {};
  for (const [label, run, repeats = 5] of cases) {
    await run();
    const times: number[] = [];
    for (let index = 0; index < repeats; index += 1) {
      const started = performance.now();
      await run();
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const result = { median: Math.round(times[Math.floor(times.length / 2)]!), min: Math.round(times[0]!), max: Math.round(times[times.length - 1]!) };
    results[label] = result;
    console.log(`${label.padEnd(38)} ${String(result.median).padStart(6)} ms  (min ${result.min}, max ${result.max})`);
  }

  if (process.env.PERF_OUT) {
    await writeFile(process.env.PERF_OUT, JSON.stringify({ at: new Date().toISOString(), counts, results }, null, 2));
    console.log(`\nNatija yozildi: ${process.env.PERF_OUT}`);
  }
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
