import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { Prisma, RiskLevel, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessDateString, dateColumn } from '../utils/dates.js';
import { studentRiskService } from './studentRisk.service.js';
import type { RiskFactor, StudentRiskMetrics } from './studentRisk.service.js';
import { getTeachingAccess } from './teachingAccess.js';
import type { TeachingAccess } from './teachingAccess.js';

/**
 * O'qituvchi boshqaruv markazi (TZ 3.0 §28–29). Yangi hisob-kitob **yo'q** — mavjud manbalar
 * yig'iladi: davomat/vazifa/imtihon/risk — `studentRiskService` (bitta signal yig'imi, risk bilan
 * bir xil raqamlar), progress — `topic_mastery`. O'qituvchi faqat o'z guruhlarini ko'radi.
 */

const DAY_NAMES: readonly WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export interface TeachingGroupCardDto {
  id: string;
  name: string;
  course: { id: string; name: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
  schedule: { days: WeekDay[]; startTime: string; endTime: string };
  students: number;
  attendanceRate: number | null;
  homeworkRate: number | null;
  examAverage: number | null;
  progress: number | null;
  risk: Record<RiskLevel, number>;
  /** Tez amallar uchun: kutilayotgan ishlar */
  pending: { homeworkToGrade: number; attemptsToReview: number };
  today: { isLessonDay: boolean; attendanceMarked: boolean };
}

export interface TeachingOverviewDto {
  totals: { groups: number; students: number; atRisk: number; homeworkToGrade: number; attemptsToReview: number; lessonsToday: number; unmarkedToday: number };
  groups: TeachingGroupCardDto[];
}

export interface TeachingStudentRowDto {
  id: string;
  number: number;
  /** "ST-000045" */
  code: string;
  firstName: string;
  lastName: string;
  attendanceRate: number | null;
  homeworkRate: number | null;
  examAverage: number | null;
  progress: number | null;
  riskLevel: RiskLevel | null;
  healthScore: number | null;
  reasons: string[];
  factors: RiskFactor[];
  lastActivityAt: string | null;
  lastLoginAt: string | null;
  hasPortalAccount: boolean;
}

export interface TeachingGroupDto {
  group: TeachingGroupCardDto;
  students: TeachingStudentRowDto[];
}

const groupSelect = {
  id: true,
  name: true,
  scheduleDays: true,
  startTime: true,
  endTime: true,
  course: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  students: {
    where: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, number: true, firstName: true, lastName: true },
  },
} satisfies Prisma.GroupSelect;

type GroupRecord = Prisma.GroupGetPayload<{ select: typeof groupSelect }>;

function average(values: Array<number | null>): number | null {
  const scored = values.filter((value): value is number => value !== null);
  return scored.length === 0 ? null : Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
}

function groupScope(access: TeachingAccess, teacherId: string | undefined): Prisma.GroupWhereInput {
  if (access.onlyOwnGroups) return { teacherId: access.userId };
  return teacherId ? { teacherId } : {};
}

/** Guruhlar kesimida kutilayotgan ishlar, bugungi dars va o'quvchilar ko'rsatkichlari */
async function buildCards(groups: GroupRecord[], now: Date) {
  const groupIds = groups.map((group) => group.id);
  const studentIds = groups.flatMap((group) => group.students.map((student) => student.id));
  const today = dateColumn(now);
  const weekday = DAY_NAMES[new Date(`${businessDateString(now)}T00:00:00Z`).getUTCDay()]!;

  const [risk, mastery, toGrade, toReview, markedToday] = await Promise.all([
    studentRiskService.forStudents(studentIds, now),
    studentIds.length === 0
      ? Promise.resolve([])
      : prisma.topicMastery.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds }, score: { not: null } }, _avg: { score: true } }),
    groupIds.length === 0
      ? Promise.resolve([])
      : prisma.homeworkSubmission.findMany({
          where: { status: { in: ['SUBMITTED', 'LATE'] }, score: null, homework: { groupId: { in: groupIds }, status: { not: 'DRAFT' } } },
          select: { homework: { select: { groupId: true } } },
        }),
    groupIds.length === 0
      ? Promise.resolve([])
      : prisma.examAttempt.findMany({ where: { status: 'NEEDS_REVIEW', exam: { groupId: { in: groupIds } } }, select: { exam: { select: { groupId: true } } } }),
    groupIds.length === 0
      ? Promise.resolve([])
      : prisma.attendance.groupBy({ by: ['groupId'], where: { groupId: { in: groupIds }, date: today }, _count: { _all: true } }),
  ]);
  const masteryBy = new Map(mastery.map((row) => [row.studentId, row._avg.score === null ? null : Math.round(row._avg.score)]));
  const countBy = (rows: Array<{ groupId: string }>) => rows.reduce((map, row) => map.set(row.groupId, (map.get(row.groupId) ?? 0) + 1), new Map<string, number>());
  const gradeBy = countBy(toGrade.map((row) => ({ groupId: row.homework.groupId })));
  const reviewBy = countBy(toReview.map((row) => ({ groupId: row.exam.groupId })));
  const marked = new Set(markedToday.map((row) => row.groupId));

  const rowsFor = (group: GroupRecord): TeachingStudentRowDto[] =>
    group.students.map((student) => {
      const entry = risk.get(student.id);
      const metrics: StudentRiskMetrics = entry?.metrics ?? {
        attendanceRate: null,
        homeworkRate: null,
        examAverage: null,
        lastActivityAt: null,
        lastLoginAt: null,
        hasPortalAccount: false,
      };
      return {
        ...student,
        code: formatStudentNumber(student.number),
        attendanceRate: metrics.attendanceRate,
        homeworkRate: metrics.homeworkRate,
        examAverage: metrics.examAverage,
        progress: masteryBy.get(student.id) ?? null,
        riskLevel: entry?.riskLevel ?? null,
        healthScore: entry?.healthScore ?? null,
        reasons: entry?.reasons ?? [],
        factors: entry?.factors ?? [],
        lastActivityAt: metrics.lastActivityAt,
        lastLoginAt: metrics.lastLoginAt,
        hasPortalAccount: metrics.hasPortalAccount,
      };
    });

  const cardFor = (group: GroupRecord, rows: TeachingStudentRowDto[]): TeachingGroupCardDto => {
    const riskCounts: Record<RiskLevel, number> = { HEALTHY: 0, ATTENTION: 0, AT_RISK: 0, CRITICAL: 0 };
    for (const row of rows) if (row.riskLevel) riskCounts[row.riskLevel] += 1;
    return {
      id: group.id,
      name: group.name,
      course: group.course,
      teacher: group.teacher,
      schedule: { days: group.scheduleDays, startTime: group.startTime, endTime: group.endTime },
      students: rows.length,
      attendanceRate: average(rows.map((row) => row.attendanceRate)),
      homeworkRate: average(rows.map((row) => row.homeworkRate)),
      examAverage: average(rows.map((row) => row.examAverage)),
      progress: average(rows.map((row) => row.progress)),
      risk: riskCounts,
      pending: { homeworkToGrade: gradeBy.get(group.id) ?? 0, attemptsToReview: reviewBy.get(group.id) ?? 0 },
      today: { isLessonDay: group.scheduleDays.includes(weekday), attendanceMarked: marked.has(group.id) },
    };
  };

  return { rowsFor, cardFor };
}

export const teachingService = {
  /** "Mening guruhlarim": har guruh kartasi va umumiy yig'indi */
  async overview(actor: AuthUser, query: { teacherId?: string | undefined } = {}, now: Date = new Date()): Promise<TeachingOverviewDto> {
    const access = await getTeachingAccess(actor);
    const groups = await prisma.group.findMany({
      where: { ...groupScope(access, query.teacherId), status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }],
      select: groupSelect,
    });
    const { rowsFor, cardFor } = await buildCards(groups, now);
    const cards = groups.map((group) => cardFor(group, rowsFor(group)));
    return {
      totals: {
        groups: cards.length,
        students: cards.reduce((sum, card) => sum + card.students, 0),
        atRisk: cards.reduce((sum, card) => sum + card.risk.AT_RISK + card.risk.CRITICAL, 0),
        homeworkToGrade: cards.reduce((sum, card) => sum + card.pending.homeworkToGrade, 0),
        attemptsToReview: cards.reduce((sum, card) => sum + card.pending.attemptsToReview, 0),
        lessonsToday: cards.filter((card) => card.today.isLessonDay).length,
        unmarkedToday: cards.filter((card) => card.today.isLessonDay && !card.today.attendanceMarked).length,
      },
      groups: cards,
    };
  },

  /** Guruh jadvali: o'quvchi | davomat | vazifa | imtihon | progress | risk | oxirgi faollik */
  async group(actor: AuthUser, groupId: string, now: Date = new Date()): Promise<TeachingGroupDto> {
    const access = await getTeachingAccess(actor);
    const group = await prisma.group.findFirst({ where: { id: groupId, ...groupScope(access, undefined) }, select: groupSelect });
    if (!group) throw AppError.notFound('Guruh topilmadi');
    const { rowsFor, cardFor } = await buildCards([group], now);
    const rows = rowsFor(group);
    // Eng xavflisi tepada: CRITICAL → AT_RISK → ATTENTION → HEALTHY → baholanmagan
    const order: Record<string, number> = { CRITICAL: 0, AT_RISK: 1, ATTENTION: 2, HEALTHY: 3 };
    const sorted = [...rows].sort((a, b) => (order[a.riskLevel ?? ''] ?? 4) - (order[b.riskLevel ?? ''] ?? 4) || (a.healthScore ?? 101) - (b.healthScore ?? 101));
    return { group: cardFor(group, rows), students: sorted };
  },
};
