import { prisma } from '../config/database.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { Prisma } from '../generated/prisma/client.js';
import type { StudentStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessMonthRange, currentBusinessMonth, dateColumn } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { inBranch } from './branchScope.js';
import type { BranchScope } from './branchScope.js';
import { debtAt } from './history.service.js';

/**
 * Oy oxiri snapshotlari (tarixiy ma'lumot, 7-bosqich): har o'quvchining oy oxiridagi holati, asosiy guruhi va
 * qarzdorligi. O'tgan oy hisobotidagi qarz keyingi to'lov yoki tahrirdan o'zgarmasligi uchun.
 *
 * Qoidalar:
 *  - faqat qo'shiladi (`createMany` + `skipDuplicates`) — mavjud snapshot hech qachon qayta yozilmaydi va o'chirilmaydi;
 *    qayta ishga tushirish faqat yetishmayotgan o'quvchilarni to'ldiradi (idempotent);
 *  - oy tugagandan 24 soatdan keyin olingan snapshot "taxminiy" (`estimated`) — tarixdan tiklangan (qaror 4: oktyabr);
 *  - qulflangan (LOCKED) oyga yangi snapshot qo'shilmaydi;
 *  - snapshoti yo'q oylar uchun hisobot qarzni tarixdan tiklaydi va "taxminiy" deb belgilaydi.
 */

/** Oy tugagandan keyin shu muddat ichida olingan snapshot aniq hisoblanadi */
export const SNAPSHOT_EXACT_WINDOW_MS = 24 * 60 * 60_000;

export type DebtSource = 'SNAPSHOT' | 'ESTIMATED';

export interface StudentPositionRow {
  id: string;
  branchId: string;
  courseId: string;
  status: StudentStatus;
  groupId: string | null;
  contract: Prisma.Decimal;
  paid: Prisma.Decimal;
}

/** Berilgan paytdagi har o'quvchi holati, asosiy guruhi va qarzi (`history.service` → `studentStatesAt` va `debtAt` qoidalari bilan bir xil) */
export async function studentPositionsAt(at: Date): Promise<StudentPositionRow[]> {
  return prisma.$queryRaw<StudentPositionRow[]>`
    SELECT s."id", s."branchId", s."courseId",
      COALESCE(
        (SELECT c."fromStatus" FROM "student_status_changes" c
          WHERE c."studentId" = s."id" AND c."changedAt" >= ${at}
          ORDER BY c."changedAt" ASC LIMIT 1),
        -- Tarix yozilmagan eski yozuv: holat shu paytdan keyin o'zgargan bo'lsa, o'sha paytda hali faol edi
        CASE WHEN s."status" <> 'ACTIVE' AND s."statusChangedAt" > ${at}
               AND NOT EXISTS (SELECT 1 FROM "student_status_changes" c WHERE c."studentId" = s."id")
          THEN 'ACTIVE'::"StudentStatus" ELSE s."status" END
      ) AS "status",
      CASE WHEN EXISTS (SELECT 1 FROM "student_group_changes" g WHERE g."studentId" = s."id" AND g."changedAt" >= ${at})
        THEN (SELECT g."fromGroupId" FROM "student_group_changes" g
               WHERE g."studentId" = s."id" AND g."changedAt" >= ${at}
               ORDER BY g."changedAt" ASC LIMIT 1)
        ELSE s."groupId"
      END AS "groupId",
      CASE WHEN d."id" IS NULL THEN 0 ELSE
        d."totalAmount"
          + COALESCE((SELECT SUM(sd."amount") FROM "student_discounts" sd WHERE sd."studentId" = s."id" AND sd."revokedAt" IS NULL), 0)
          - COALESCE((SELECT SUM(sd."amount") FROM "student_discounts" sd
                       WHERE sd."studentId" = s."id" AND sd."createdAt" <= ${at} AND (sd."revokedAt" IS NULL OR sd."revokedAt" > ${at})), 0)
      END AS "contract",
      COALESCE((SELECT SUM(p."amount") FROM "payments" p
                 WHERE p."studentId" = s."id" AND p."paidAt" <= ${at} AND (p."deletedAt" IS NULL OR p."deletedAt" > ${at})), 0)
        - COALESCE((SELECT SUM(r."amount") FROM "payment_refunds" r JOIN "payments" p ON p."id" = r."paymentId"
                     WHERE p."studentId" = s."id" AND r."refundedAt" <= ${at} AND (p."deletedAt" IS NULL OR p."deletedAt" > ${at})), 0)
        AS "paid"
    FROM "students" s
    LEFT JOIN "debts" d ON d."studentId" = s."id"
    WHERE s."deletedAt" IS NULL AND (s."createdAt" < ${at} OR s."startDate" < ${dateColumn(at)})
  `;
}

const monthIndex = (year: number, month: number) => year * 12 + month;

export interface SnapshotGenerationResult {
  year: number;
  month: number;
  created: number;
  /** Avvaldan bor edi — tegilmadi */
  existing: number;
  estimated: boolean;
}

/**
 * Tugagan oy uchun snapshot: yetishmayotgan o'quvchilar qo'shiladi, borlari o'zgarmaydi.
 * Tugamagan yoki qulflangan oy rad etiladi.
 */
export async function generateMonthSnapshots(year: number, month: number, options: { now?: Date; generatedById?: string } = {}): Promise<SnapshotGenerationResult> {
  const now = options.now ?? new Date();
  const current = currentBusinessMonth(now);
  if (monthIndex(year, month) >= monthIndex(current.year, current.month)) {
    throw AppError.unprocessable('Snapshot faqat tugagan oy uchun olinadi');
  }
  const period = await prisma.financialPeriod.findUnique({ where: { year_month: { year, month } }, select: { status: true } });
  if (period?.status === 'LOCKED') {
    throw AppError.conflict(`${formatSalaryPeriod(year, month)} qulflangan — snapshot qo‘shib bo‘lmaydi`);
  }

  const { end } = businessMonthRange(year, month);
  const estimated = now.getTime() - end.getTime() > SNAPSHOT_EXACT_WINDOW_MS;
  const rows = await studentPositionsAt(end);
  const existing = await prisma.studentMonthSnapshot.count({ where: { year, month } });
  const { count } = await prisma.studentMonthSnapshot.createMany({
    data: rows.map((row) => {
      const contract = new Prisma.Decimal(row.contract);
      const paid = new Prisma.Decimal(row.paid);
      const debt = contract.minus(paid);
      return {
        studentId: row.id,
        year,
        month,
        branchId: row.branchId,
        courseId: row.courseId,
        status: row.status,
        groupId: row.groupId,
        contractAmount: contract,
        paidAmount: paid,
        debtAmount: debt.isNegative() ? new Prisma.Decimal(0) : debt,
        estimated,
        generatedById: options.generatedById ?? null,
        createdAt: now,
      };
    }),
    skipDuplicates: true,
  });
  return { year, month, created: count, existing, estimated };
}

/**
 * O'tgan oy oxiridagi qarz: snapshot bo'lsa — undan (keyingi to'lovlar ta'sir qilmaydi), bo'lmasa — tarixdan tiklangan
 * taxminiy qiymat. Snapshot taxminiy olingan bo'lsa manba ham "taxminiy".
 */
export async function debtForMonth(year: number, month: number, end: Date, scope: BranchScope): Promise<{ total: number; debtors: number; source: DebtSource }> {
  // Snapshot faqat to'liq oy oxiri uchun; ixtiyoriy oraliq oxiri — tarixdan tiklanadi
  const monthEnd = businessMonthRange(year, month).end;
  const hasSnapshot = monthEnd.getTime() === end.getTime() && (await prisma.studentMonthSnapshot.count({ where: { year, month } })) > 0;
  if (!hasSnapshot) {
    const estimate = await debtAt(end, scope);
    return { ...estimate, source: 'ESTIMATED' };
  }
  const where = { year, month, ...inBranch(scope) };
  const [sum, debtors, estimatedRows] = await Promise.all([
    prisma.studentMonthSnapshot.aggregate({ where, _sum: { debtAmount: true } }),
    prisma.studentMonthSnapshot.count({ where: { ...where, debtAmount: { gt: 0 } } }),
    prisma.studentMonthSnapshot.count({ where: { ...where, estimated: true } }),
  ]);
  return { total: sum._sum.debtAmount?.toNumber() ?? 0, debtors, source: estimatedRows > 0 ? 'ESTIMATED' : 'SNAPSHOT' };
}

/** Fon vazifasi: o'tgan oy snapshoti yo'q bo'lsa olinadi (yangi oy boshida aniq; birinchi ishga tushishda taxminiy) */
export async function ensurePreviousMonthSnapshot(now: Date = new Date()): Promise<SnapshotGenerationResult | null> {
  const current = currentBusinessMonth(now);
  const year = current.month === 1 ? current.year - 1 : current.year;
  const month = current.month === 1 ? 12 : current.month - 1;
  const exists = await prisma.studentMonthSnapshot.findFirst({ where: { year, month }, select: { id: true } });
  if (exists) return null;
  const period = await prisma.financialPeriod.findUnique({ where: { year_month: { year, month } }, select: { status: true } });
  if (period?.status === 'LOCKED') return null;
  return generateMonthSnapshots(year, month, { now });
}

export interface MonthSnapshotSummaryDto {
  year: number;
  month: number;
  label: string;
  students: number;
  active: number;
  debtors: number;
  totalDebt: number;
  estimated: boolean;
  generatedAt: string | null;
}

export const monthSnapshotService = {
  async summary(year: number, month: number, scope: BranchScope): Promise<MonthSnapshotSummaryDto> {
    const where = { year, month, ...inBranch(scope) };
    const [students, active, debtors, sum, estimatedRows, first] = await Promise.all([
      prisma.studentMonthSnapshot.count({ where }),
      prisma.studentMonthSnapshot.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.studentMonthSnapshot.count({ where: { ...where, debtAmount: { gt: 0 } } }),
      prisma.studentMonthSnapshot.aggregate({ where, _sum: { debtAmount: true } }),
      prisma.studentMonthSnapshot.count({ where: { ...where, estimated: true } }),
      prisma.studentMonthSnapshot.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return {
      year,
      month,
      label: formatSalaryPeriod(year, month),
      students,
      active,
      debtors,
      totalDebt: sum._sum.debtAmount?.toNumber() ?? 0,
      estimated: estimatedRows > 0,
      generatedAt: first?.createdAt.toISOString() ?? null,
    };
  },

  /** Qo'lda: yetishmayotgan snapshotlarni to'ldirish (mavjudlari o'zgarmaydi), auditga yoziladi */
  async generate(actor: AuthUser, year: number, month: number, client: ClientInfo): Promise<SnapshotGenerationResult> {
    const result = await generateMonthSnapshots(year, month, { generatedById: actor.id });
    await auditService.record({
      userId: actor.id,
      action: 'history.snapshot_generated',
      entityType: 'financialPeriod',
      entityId: `${year}-${String(month).padStart(2, '0')}`,
      metadata: { period: formatSalaryPeriod(year, month), created: result.created, existing: result.existing, estimated: result.estimated },
      ...client,
    });
    return result;
  },
};
