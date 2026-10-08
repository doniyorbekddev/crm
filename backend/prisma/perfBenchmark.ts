/* eslint-disable no-console -- CLI skript: o‘lchov natijasi terminalga chiqariladi */
/**
 * Og‘ir servislar vaqtini o‘lchash (roadmap phase 16).
 *
 *   DATABASE_URL="postgresql://crm:...@localhost:5432/crm_perf?schema=public" PERF_OUT=before.json npm run perf:bench
 *
 * Har bir o‘lchov: 1 ta qizdirish + 5 ta takror, median ko‘rsatiladi. `PERF_OUT` berilsa natija JSON faylga
 * yoziladi — indeks yoki kod o‘zgarishidan oldingi va keyingi natijani solishtirish uchun.
 * Xavfsizlik: faqat nomida "perf" bo‘lgan bazada ishlaydi (alerts.evaluate yozuv qiladi).
 *
 * `PERF_BUDGET=1` (CI): median chegaradan oshsa skript xato bilan tugaydi. Chegaralar ataylab keng
 * (~5 000 o‘quvchi, sekin CI mashinasi) — maqsad millisekundlarni poylash emas, "har qatorga alohida so‘rov"
 * kabi tartib o‘zgarishini (yuzlab ms → o‘nlab soniya) ushlash.
 */
import { writeFile } from 'node:fs/promises';

process.env.LOG_LEVEL = 'silent';

/** Alohida ko‘rsatilmagan har bir o‘lchov uchun chegara (ms) */
const DEFAULT_BUDGET_MS = 2_000;
/** Fon hisoblari butun jadvalni qayta yozadi — ularga alohida chegara */
const BUDGETS_MS: Record<string, number> = {
  'F1 studentRisk.recalculateAll': 8_000,
  'F1 leadScore.recalculateAll': 5_000,
};

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
  const { currentBusinessMonth, startOfBusinessWeek } = await import('../src/utils/dates.js');
  // CRM 4.0 Faza 1 nishonlari
  const { studentRiskService } = await import('../src/services/studentRisk.service.js');
  const { leadScoreService } = await import('../src/services/leadScore.service.js');
  const { debtService } = await import('../src/services/debt.service.js');
  const { studentService } = await import('../src/services/student.service.js');
  const { paymentService } = await import('../src/services/payment.service.js');
  const { leadService } = await import('../src/services/lead.service.js');
  const { weeklyReportService } = await import('../src/services/weeklyReport.service.js');
  const { attendanceAnalyticsService } = await import('../src/services/attendanceAnalytics.service.js');
  // CRM 4.0 Faza 2 — ish qatlami
  const { myWorkService } = await import('../src/services/myWork.service.js');
  const { taskService } = await import('../src/services/task.service.js');
  const { taskListQuerySchema } = await import('../src/validators/task.validator.js');
  const { debtListQuerySchema, paymentListQuerySchema } = await import('../src/validators/payment.validator.js');
  const { studentListQuerySchema } = await import('../src/validators/student.validator.js');
  const { leadListQuerySchema } = await import('../src/validators/lead.validator.js');
  const { chartQuerySchema } = await import('../src/validators/dashboard.validator.js');
  const sampleStudents = await prisma.student.findMany({ where: { status: 'ACTIVE', deletedAt: null }, select: { id: true }, take: 20, orderBy: { number: 'asc' } });
  const weekStart = startOfBusinessWeek(new Date());
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

  // "Ishlarim"ning eng og'ir holatlari: eng ko'p baholanmagan ishi bor o'qituvchi va eng ko'p follow-up'i bor xodim
  const actorOf = async (id: string | null | undefined) => {
    const row = id ? await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, lastName: true, roleId: true, branchId: true, role: { select: { key: true } } } }) : null;
    return row ? { id: row.id, email: row.email, firstName: row.firstName, lastName: row.lastName, roleId: row.roleId, roleKey: row.role.key, branchId: row.branchId } : actor;
  };
  const busiestTeacher = await prisma.$queryRaw<Array<{ teacherId: string }>>`
    SELECT h."teacherId" FROM "homework_submissions" s JOIN "homework" h ON h."id" = s."homeworkId"
    WHERE s."status" IN ('SUBMITTED', 'LATE') AND s."score" IS NULL AND h."teacherId" IS NOT NULL
    GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1
  `;
  const busiestSales = await prisma.followUp.groupBy({ by: ['assignedToId'], where: { status: 'PENDING', assignedToId: { not: null } }, _count: { _all: true }, orderBy: { _count: { assignedToId: 'desc' } }, take: 1 });
  const teacherActor = await actorOf(busiestTeacher[0]?.teacherId);
  const salesActor = await actorOf(busiestSales[0]?.assignedToId);

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
    // --- CRM 4.0 Faza 1 ---
    ['F1 studentRisk.recalculateAll', () => studentRiskService.recalculateAll(new Date()), 3],
    ['F1 leadScore.recalculateAll', () => leadScoreService.recalculateAll(new Date()), 3],
    ['F1 dashboard.charts kun', () => dashboardService.charts(actor, chartQuerySchema.parse({ period: 'day' }))],
    ['F1 dashboard.charts oy', () => dashboardService.charts(actor, chartQuerySchema.parse({ period: 'month' }))],
    ['F1 dashboard.funnel', () => dashboardService.funnel(actor)],
    ['F1 debts.list', () => debtService.list(debtListQuerySchema.parse({}))],
    ['F1 debts.list muddati o‘tgan', () => debtService.list(debtListQuerySchema.parse({ due: 'overdue' }))],
    ['F1 debts.summary', () => debtService.summary(debtListQuerySchema.parse({}))],
    ['F1 students.list 1-sahifa', () => studentService.list(actor, studentListQuerySchema.parse({}))],
    ['F1 students.list 80-sahifa', () => studentService.list(actor, studentListQuerySchema.parse({ page: '80', limit: '100' }))],
    ['F1 students.list qidiruv', () => studentService.list(actor, studentListQuerySchema.parse({ search: 'ali' }))],
    ['F1 payments.list 1-sahifa', () => paymentService.list(actor, paymentListQuerySchema.parse({}))],
    ['F1 leads.list 1-sahifa', () => leadService.list(actor, leadListQuerySchema.parse({}))],
    ['F1 attendance.stats', () => attendanceAnalyticsService.stats(actor, {})],
    ['F1 weeklyReport 20 o‘quvchi', async () => { for (const student of sampleStudents) await weeklyReportService.build(student.id, weekStart); }, 3],
    // --- CRM 4.0 Faza 2 ---
    ['F2 myWork rahbar', () => myWorkService.get(actor)],
    ['F2 myWork o‘qituvchi', () => myWorkService.get(teacherActor)],
    ['F2 myWork sotuv', () => myWorkService.get(salesActor)],
    ['F2 tasks.list meniki', () => taskService.list(actor, taskListQuerySchema.parse({}))],
    ['F2 tasks.list hammasi 1-sahifa', () => taskService.list(actor, taskListQuerySchema.parse({ scope: 'all' }))],
    ['F2 tasks.list hammasi 500-sahifa', () => taskService.list(actor, taskListQuerySchema.parse({ scope: 'all', page: '500' }))],
    ['F2 tasks.list kechikkan', () => taskService.list(actor, taskListQuerySchema.parse({ scope: 'all', overdue: 'true' }))],
    ['F2 tasks.list qidiruv', () => taskService.list(actor, taskListQuerySchema.parse({ scope: 'all', search: 'vazifasi 1234' }))],
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

  if (process.env.PERF_BUDGET === '1') {
    const exceeded = Object.entries(results).filter(([label, result]) => result.median > (BUDGETS_MS[label] ?? DEFAULT_BUDGET_MS));
    if (exceeded.length > 0) {
      console.error('\nChegaradan oshgan o‘lchovlar:');
      for (const [label, result] of exceeded) console.error(`  ${label}: ${result.median} ms > ${BUDGETS_MS[label] ?? DEFAULT_BUDGET_MS} ms`);
      process.exitCode = 1;
    } else {
      console.log('\nBarcha o‘lchovlar chegara ichida.');
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
