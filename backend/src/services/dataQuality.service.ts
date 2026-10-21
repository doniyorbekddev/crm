import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { branchScopeOf, branchSql, inBranch } from './branchScope.js';

/**
 * "Ma'lumotlar sifati": CRM imkoniyatlari to'liq ishlashiga xalaqit beradigan bo'sh yoki nomuvofiq yozuvlar —
 * har biri soni, namunasi (20 tagacha) va tuzatish joyi bilan. Faqat o'qiydi; hech narsani avtomatik o'zgartirmaydi.
 */

export type DataQualitySeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DataQualityCheckDto {
  key: string;
  label: string;
  /** Nima uchun muhim — qaysi imkoniyat ishlamaydi */
  impact: string;
  severity: DataQualitySeverity;
  count: number;
  /** Tuzatish joyi (sahifa) */
  action: { label: string; to: string } | null;
  sample: Array<{ id: string; title: string; subtitle: string | null; to: string }>;
}

export interface DataQualityDto {
  generatedAt: string;
  activeStudents: number;
  checks: DataQualityCheckDto[];
}

const SAMPLE = 20;
const ACTIVE: Prisma.StudentWhereInput = { deletedAt: null, status: 'ACTIVE' };
const studentRow = { id: true, number: true, firstName: true, lastName: true } satisfies Prisma.StudentSelect;
type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentRow }>;

function toSample<T extends StudentRow>(rows: T[], subtitle: (row: T) => string | null = (row) => formatStudentNumber(row.number)) {
  return rows.map((row) => ({ id: row.id, title: `${row.lastName} ${row.firstName}`, subtitle: subtitle(row), to: `/students/${row.id}` }));
}

function money(value: number): string {
  return `${new Intl.NumberFormat('uz-UZ').format(Math.round(value)).replace(/,/g, ' ')} so‘m`;
}

async function studentCheck(where: Prisma.StudentWhereInput): Promise<{ count: number; rows: StudentRow[] }> {
  const [count, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({ where, select: studentRow, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: SAMPLE }),
  ]);
  return { count, rows };
}

export const dataQualityService = {
  async report(actor: AuthUser, now: Date = new Date()): Promise<DataQualityDto> {
    const scope = await branchScopeOf(actor);
    const active = { ...ACTIVE, ...inBranch(scope) };

    const [activeStudents, noGroup, noParentAtAll, parentPhoneNotImported, noPortal, noTelegram, importedParents, groupsNoTeacher] =
      await Promise.all([
        prisma.student.count({ where: active }),
        studentCheck({ ...active, groupId: null, groupMemberships: { none: { leftAt: null } } }),
        studentCheck({ ...active, parentPhone: null, parents: { none: {} } }),
        studentCheck({ ...active, parentPhone: { not: null }, parents: { none: {} } }),
        studentCheck({ ...active, userId: null }),
        studentCheck({
          ...active,
          telegramLinks: { none: { verifiedAt: { not: null }, isActive: true } },
          parents: { none: { parent: { telegramLinks: { some: { verifiedAt: { not: null }, isActive: true } } } } },
        }),
        prisma.parent.findMany({
          where: { notes: { contains: 'avtomatik yaratildi' }, lastName: 'ota-onasi', ...(scope.branchId ? { students: { some: { student: inBranch(scope) } } } : {}) },
          select: { id: true, firstName: true, lastName: true, phone: true },
          take: SAMPLE,
        }),
        prisma.group.findMany({ where: { status: 'ACTIVE', teacherId: null, ...inBranch(scope) }, select: { id: true, name: true }, take: SAMPLE }),
      ]);
    const importedParentsCount = await prisma.parent.count({
      where: { notes: { contains: 'avtomatik yaratildi' }, lastName: 'ota-onasi', ...(scope.branchId ? { students: { some: { student: inBranch(scope) } } } : {}) },
    });

    // To'lov jadvali: muddati kelgan qismlar − to'langan (o'quv markaz kuni bo'yicha), va jadval jami ≠ shartnoma qarzi
    const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now)}T00:00:00.000Z`);
    const scheduleRows = await prisma.$queryRaw<Array<{ id: string; number: number; firstName: string; lastName: string; overdue: Prisma.Decimal; scheduleTotal: Prisma.Decimal | null; debtTotal: Prisma.Decimal | null }>>`
      SELECT s."id", s."number", s."firstName", s."lastName",
             GREATEST(COALESCE(due.sum, 0) - COALESCE(d."paidAmount", 0), 0) AS "overdue",
             plan.sum AS "scheduleTotal", d."totalAmount" AS "debtTotal"
      FROM "students" s
      LEFT JOIN "debts" d ON d."studentId" = s."id"
      LEFT JOIN (SELECT "studentId", SUM("amount") AS sum FROM "payment_installments" WHERE "dueDate" <= ${today}::date GROUP BY "studentId") due ON due."studentId" = s."id"
      LEFT JOIN (SELECT "studentId", SUM("amount") AS sum FROM "payment_installments" GROUP BY "studentId") plan ON plan."studentId" = s."id"
      WHERE s."deletedAt" IS NULL AND s."status" = 'ACTIVE' ${branchSql(scope, Prisma.sql`s."branchId"`)}
    `;
    const smallOverdue = scheduleRows
      .filter((row) => Number(row.overdue) > 0 && Number(row.overdue) < 50_000)
      .sort((a, b) => Number(a.overdue) - Number(b.overdue));
    const mismatch = scheduleRows.filter(
      (row) => row.scheduleTotal !== null && row.debtTotal !== null && Math.abs(Number(row.scheduleTotal) - Number(row.debtTotal)) >= 1_000,
    );

    const checks: DataQualityCheckDto[] = [
      {
        key: 'parentPhoneNotImported',
        label: 'Ota-ona telefoni bor, lekin ota-ona profili yo‘q',
        impact: 'Kelmadi, qarz va haftalik hisobot xabarlari ota-onaga yuborilmaydi',
        severity: 'HIGH',
        count: parentPhoneNotImported.count,
        action: { label: 'O‘quvchilardan import', to: '/parents' },
        sample: toSample(parentPhoneNotImported.rows),
      },
      {
        key: 'noTelegram',
        label: 'Telegram ulanmagan (o‘quvchi ham, ota-onasi ham)',
        impact: 'Avtomatik xabarlar hech kimga yetib bormaydi',
        severity: 'HIGH',
        count: noTelegram.count,
        action: { label: 'Guruh sahifasi → Telegram taklifnoma', to: '/groups' },
        sample: toSample(noTelegram.rows),
      },
      {
        key: 'noParentAtAll',
        label: 'Ota-ona telefoni ham, profili ham yo‘q',
        impact: 'Ota-ona bilan aloqa qilib bo‘lmaydi',
        severity: 'MEDIUM',
        count: noParentAtAll.count,
        action: { label: 'O‘quvchi kartasida kiriting', to: '/students' },
        sample: toSample(noParentAtAll.rows),
      },
      {
        key: 'noGroup',
        label: 'Faol, lekin guruhsiz o‘quvchilar',
        impact: 'Davomat, vazifa va imtihonlarda ko‘rinmaydi',
        severity: 'MEDIUM',
        count: noGroup.count,
        action: { label: 'O‘quvchilar', to: '/students?status=ACTIVE' },
        sample: toSample(noGroup.rows),
      },
      {
        key: 'scheduleMismatch',
        label: 'To‘lov jadvali shartnoma summasiga mos emas',
        impact: 'Muddati o‘tgan qarz va eslatmalar noto‘g‘ri hisoblanadi',
        severity: 'MEDIUM',
        count: mismatch.length,
        action: null,
        sample: toSample(mismatch.slice(0, SAMPLE), (row) => `jadval ${money(Number(row.scheduleTotal))} · shartnoma ${money(Number(row.debtTotal))}`),
      },
      {
        key: 'smallOverdue',
        label: 'Muddati o‘tgan mayda qoldiq (50 000 so‘mdan kam)',
        impact: 'Ko‘pincha chegirma yoki yaxlitlash qoldig‘i — o‘quvchi “qarzdor” bo‘lib ko‘rinadi',
        severity: 'LOW',
        count: smallOverdue.length,
        action: { label: 'Qarzdorlik', to: '/debts' },
        sample: toSample(smallOverdue.slice(0, SAMPLE), (row) => `muddati o‘tgan: ${money(Number(row.overdue))}`),
      },
      {
        key: 'noPortal',
        label: 'Kabineti ochilmagan o‘quvchilar',
        impact: 'O‘quvchi vazifa, baho va jadvalni o‘zi ko‘ra olmaydi',
        severity: 'LOW',
        count: noPortal.count,
        action: { label: 'O‘quvchilar → Kabinetlar ochish', to: '/students' },
        sample: toSample(noPortal.rows),
      },
      {
        key: 'importedParentNames',
        label: 'Ismi aniqlashtirilmagan ota-onalar (avtomatik yaratilgan)',
        impact: 'Xabar va hisobotlarda “...ning ota-onasi” deb chiqadi',
        severity: 'LOW',
        count: importedParentsCount,
        action: { label: 'Ota-onalar', to: '/parents' },
        sample: importedParents.map((parent) => ({ id: parent.id, title: `${parent.firstName} ${parent.lastName}`, subtitle: parent.phone, to: '/parents' })),
      },
      {
        key: 'groupsNoTeacher',
        label: 'O‘qituvchisi yo‘q faol guruhlar',
        impact: 'Davomatni hech kim belgilamaydi, foiz hisoblanmaydi',
        severity: 'HIGH',
        count: groupsNoTeacher.length,
        action: { label: 'Guruhlar', to: '/groups' },
        sample: groupsNoTeacher.map((group) => ({ id: group.id, title: group.name, subtitle: null, to: `/groups/${group.id}` })),
      },
    ];

    const order: Record<DataQualitySeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    checks.sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || order[a.severity] - order[b.severity]);
    return { generatedAt: now.toISOString(), activeStudents, checks };
  },
};
