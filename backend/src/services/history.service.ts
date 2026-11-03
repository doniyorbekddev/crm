import { prisma } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';
import type { StudentStatus } from '../generated/prisma/client.js';
import { dateColumn } from '../utils/dates.js';
import { branchSql } from './branchScope.js';
import type { BranchScope } from './branchScope.js';

/**
 * Tarixiy holatni tiklash (tarixiy ma'lumot auditi, D1–D9): hisobotlar o'tgan oy tanlanganda **bugungi** holatdan emas,
 * o'sha paytdagi holatdan hisoblanishi uchun.
 *
 * Manbalar — mavjud o'zgarmas tarix jadvallari (yangi nusxa modeli yaratilmaydi):
 *  - o'quvchi holati: `student_status_changes` — `at` dan keyingi **birinchi** o'zgarishning `fromStatus` i
 *    o'sha paytdagi holat; keyin o'zgarish bo'lmagan bo'lsa — hozirgi holat;
 *  - asosiy guruh: `student_group_changes` — xuddi shu qoida (`fromGroupId`);
 *  - o'quvchi o'sha paytda mavjud bo'lgan: CRM ga kiritilgan (`createdAt < at`) yoki o'qishni boshlagan (`startDate`) —
 *    keyinroq kiritilgan eski o'quvchilar ham o'z oyida ko'rinadi; o'chirilgan (xato kiritilgan) yozuvlar hisobga kirmaydi;
 *  - tarix yozilmagan eski yozuvlar uchun holat `statusChangedAt` dan tiklanadi (o'zgarishdan oldin faol hisoblanadi).
 * Joriy vaqt uchun natija hozirgi holat bilan bir xil (keyingi o'zgarish yo'q).
 */

export interface StudentStateAt {
  id: string;
  branchId: string;
  courseId: string;
  status: StudentStatus;
  groupId: string | null;
}

/** Berilgan paytdagi o'quvchilar holati va asosiy guruhi. `studentIds` — faqat shu o'quvchilar */
export async function studentStatesAt(at: Date, scope: BranchScope, studentIds?: readonly string[]): Promise<StudentStateAt[]> {
  if (studentIds && studentIds.length === 0) return [];
  const only = studentIds ? Prisma.sql` AND s."id" IN (${Prisma.join(studentIds)})` : Prisma.empty;
  return prisma.$queryRaw<StudentStateAt[]>`
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
      END AS "groupId"
    FROM "students" s
    WHERE s."deletedAt" IS NULL AND (s."createdAt" < ${at} OR s."startDate" < ${dateColumn(at)})${branchSql(scope, Prisma.raw('s."branchId"'))}${only}
  `;
}

/** Berilgan paytda faol o'quvchilar soni (o'sha paytdagi holat bo'yicha) */
export async function activeStudentsAt(at: Date, scope: BranchScope): Promise<number> {
  const states = await studentStatesAt(at, scope);
  return states.filter((state) => state.status === 'ACTIVE').length;
}

/** Hisobot davrining "holat olinadigan payti": davr oxiri yoki (joriy davr bo'lsa) hozir */
export function snapshotMoment(periodEnd: Date, now: Date = new Date()): Date {
  return periodEnd.getTime() > now.getTime() ? now : periodEnd;
}

/**
 * Davrda ketganlar: shu davrda **DROPPED holatiga o'tish** hodisasi bo'lgan o'quvchilar (keyin qaytgan bo'lsa ham shu
 * davrda ketgan hisoblanadi). Tarix yozilmagan eski yozuvlar uchun — hozirgi holat va `statusChangedAt`.
 */
export async function droppedBetween(start: Date, end: Date, scope: BranchScope, groupIds?: readonly string[]): Promise<number> {
  const inGroups = groupIds ? (groupIds.length === 0 ? Prisma.sql` AND FALSE` : Prisma.sql` AND s."groupId" IN (${Prisma.join(groupIds)})`) : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT s."id") AS "count"
    FROM "students" s
    WHERE s."deletedAt" IS NULL${branchSql(scope, Prisma.raw('s."branchId"'))}${inGroups}
      AND (
        EXISTS (SELECT 1 FROM "student_status_changes" c
                 WHERE c."studentId" = s."id" AND c."toStatus" = 'DROPPED' AND c."changedAt" >= ${start} AND c."changedAt" < ${end})
        OR (
          s."status" = 'DROPPED' AND s."statusChangedAt" >= ${start} AND s."statusChangedAt" < ${end}
          AND NOT EXISTS (SELECT 1 FROM "student_status_changes" c WHERE c."studentId" = s."id")
        )
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

/** Davrda yangi o'quvchilar — o'qish boshlangan sana (`startDate`) bo'yicha (foydalanuvchi qarori, 2026-11-03) */
export async function newStudentsBetween(start: Date, end: Date, scope: BranchScope): Promise<number> {
  return prisma.student.count({
    where: { deletedAt: null, startDate: { gte: dateColumn(start), lt: dateColumn(end) }, ...(scope.branchId ? { branchId: scope.branchId } : {}) },
  });
}

/**
 * Davrda yo'qotilgan leadlar: holat tarixidagi **LOST ga o'tish** hodisasi sanasi bo'yicha (keyin tahrirlansa ham
 * oy o'zgarmaydi). Tarixi yo'q eski leadlar uchun — hozirgi holat va `updatedAt`.
 */
export async function lostLeadsBetween(start: Date, end: Date, scope: BranchScope): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT l."id") AS "count"
    FROM "leads" l
    WHERE l."deletedAt" IS NULL${branchSql(scope, Prisma.raw('l."branchId"'))}
      AND (
        EXISTS (SELECT 1 FROM "lead_activities" a
                 WHERE a."leadId" = l."id" AND a."type" = 'STATUS_CHANGED' AND a."metadata"->>'to' = 'LOST'
                   AND a."createdAt" >= ${start} AND a."createdAt" < ${end})
        OR (
          l."status" = 'LOST' AND l."updatedAt" >= ${start} AND l."updatedAt" < ${end}
          AND NOT EXISTS (SELECT 1 FROM "lead_activities" a WHERE a."leadId" = l."id" AND a."type" = 'STATUS_CHANGED' AND a."metadata"->>'to' = 'LOST')
        )
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Berilgan paytdagi qarzdorlik — **taxminiy tiklash** (qaror 4: oktyabr kabi snapshoti yo'q oylar uchun).
 *
 * Joriy qarz hisobi bilan bir xil qoida (`payment.service` → `recalculateDebt`): shartnoma summasi − (to'lovlar −
 * qaytarishlar), manfiy bo'lmaydi. Shartnoma summasi o'sha paytga chegirmalar tarixi bilan qaytariladi (keyin berilgan
 * chegirma qo'shiladi, keyin bekor qilingani ayiriladi); to'lov — o'sha paytgacha to'langan va o'sha paytda bekor
 * qilinmagan. Shartnoma narxining qo'lda tahrirlari tarixda saqlanmaydi — shuning uchun natija "taxminiy".
 */
export async function debtAt(at: Date, scope: BranchScope): Promise<{ total: number; debtors: number }> {
  const rows = await prisma.$queryRaw<Array<{ total: Prisma.Decimal | null; debtors: bigint }>>`
    SELECT COALESCE(SUM(GREATEST(x."contract" - x."paid", 0)), 0) AS "total",
           COUNT(*) FILTER (WHERE x."contract" - x."paid" > 0) AS "debtors"
    FROM (
      SELECT s."id",
        d."totalAmount"
          + COALESCE((SELECT SUM(sd."amount") FROM "student_discounts" sd WHERE sd."studentId" = s."id" AND sd."revokedAt" IS NULL), 0)
          - COALESCE((SELECT SUM(sd."amount") FROM "student_discounts" sd
                       WHERE sd."studentId" = s."id" AND sd."createdAt" <= ${at} AND (sd."revokedAt" IS NULL OR sd."revokedAt" > ${at})), 0)
          AS "contract",
        COALESCE((SELECT SUM(p."amount") FROM "payments" p
                   WHERE p."studentId" = s."id" AND p."paidAt" <= ${at} AND (p."deletedAt" IS NULL OR p."deletedAt" > ${at})), 0)
          - COALESCE((SELECT SUM(r."amount") FROM "payment_refunds" r JOIN "payments" p ON p."id" = r."paymentId"
                       WHERE p."studentId" = s."id" AND r."refundedAt" <= ${at} AND (p."deletedAt" IS NULL OR p."deletedAt" > ${at})), 0)
          AS "paid"
      FROM "students" s
      JOIN "debts" d ON d."studentId" = s."id"
      WHERE s."deletedAt" IS NULL AND (s."createdAt" < ${at} OR s."startDate" < ${dateColumn(at)})${branchSql(scope, Prisma.raw('s."branchId"'))}
    ) x
  `;
  return { total: Number(rows[0]?.total ?? 0), debtors: Number(rows[0]?.debtors ?? 0) };
}

/**
 * Berilgan paytda shu guruhlarda (asosiy guruh) faol bo'lgan o'quvchilar soni — o'tgan oy maoshi uchun (qaror 2).
 * Nomzodlar: hozir shu guruhlarda bo'lganlar va `at` dan keyin shu guruhlarga/guruhlardan o'tkazilganlar.
 */
export async function activeStudentsInGroupsAt(at: Date, groupIds: readonly string[]): Promise<number> {
  if (groupIds.length === 0) return 0;
  const [current, moved] = await Promise.all([
    prisma.student.findMany({ where: { groupId: { in: [...groupIds] }, deletedAt: null }, select: { id: true } }),
    prisma.studentGroupChange.findMany({
      where: { changedAt: { gte: at }, OR: [{ fromGroupId: { in: [...groupIds] } }, { toGroupId: { in: [...groupIds] } }] },
      select: { studentId: true },
    }),
  ]);
  const candidates = [...new Set([...current.map((row) => row.id), ...moved.map((row) => row.studentId)])];
  const groups = new Set(groupIds);
  const states = await studentStatesAt(at, { branchId: null }, candidates);
  return states.filter((state) => state.status === 'ACTIVE' && state.groupId !== null && groups.has(state.groupId)).length;
}

/** Davrda ketganlar guruhlar bo'yicha: har o'quvchi ketgan paytdagi asosiy guruhiga yoziladi */
export async function droppedByGroupBetween(start: Date, end: Date, scope: BranchScope, groupIds: readonly string[]): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const branch = branchSql(scope, Prisma.raw('s."branchId"'));
  const rows = await prisma.$queryRaw<Array<{ groupId: string; count: bigint }>>`
    WITH ev AS (
      SELECT c."studentId", c."changedAt" AS "at"
      FROM "student_status_changes" c JOIN "students" s ON s."id" = c."studentId"
      WHERE c."toStatus" = 'DROPPED' AND c."changedAt" >= ${start} AND c."changedAt" < ${end} AND s."deletedAt" IS NULL${branch}
      UNION ALL
      SELECT s."id", s."statusChangedAt"
      FROM "students" s
      WHERE s."status" = 'DROPPED' AND s."statusChangedAt" >= ${start} AND s."statusChangedAt" < ${end} AND s."deletedAt" IS NULL${branch}
        AND NOT EXISTS (SELECT 1 FROM "student_status_changes" c WHERE c."studentId" = s."id")
    )
    SELECT x."groupId", COUNT(DISTINCT x."studentId") AS "count"
    FROM (
      SELECT ev."studentId",
        CASE WHEN EXISTS (SELECT 1 FROM "student_group_changes" g WHERE g."studentId" = ev."studentId" AND g."changedAt" >= ev."at")
          THEN (SELECT g."fromGroupId" FROM "student_group_changes" g
                 WHERE g."studentId" = ev."studentId" AND g."changedAt" >= ev."at"
                 ORDER BY g."changedAt" ASC LIMIT 1)
          ELSE (SELECT s."groupId" FROM "students" s WHERE s."id" = ev."studentId")
        END AS "groupId"
      FROM ev
    ) x
    WHERE x."groupId" IN (${Prisma.join(groupIds)})
    GROUP BY x."groupId"
  `;
  return new Map(rows.map((row) => [row.groupId, Number(row.count)]));
}
