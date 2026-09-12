import { prisma } from '../config/database.js';
import { ATTENDANCE_STATUS_LABELS, formatStudentNumber } from '../config/studentLabels.js';
import type { AttendanceStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, startOfBusinessDay } from '../utils/dates.js';
import type {
  AttendanceCalendarQuery,
  AttendanceRankingQuery,
  AttendanceStatsQuery,
} from '../validators/attendanceSession.validator.js';
import { getSessionAccess, parseDateOnly } from './attendanceSession.service.js';

/** Qatnashgan deb hisoblanadigan holatlar (sababsiz qoldirilgandan tashqari hammasi) */
const ATTENDED: readonly AttendanceStatus[] = ['PRESENT', 'LATE', 'EXCUSED'];

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  EXCUSED: number;
  total: number;
  rate: number;
}

export interface CalendarDayDto {
  date: string;
  status: AttendanceStatus | null;
  statusLabel: string | null;
  note: string | null;
  groupName: string | null;
}

export interface AttendanceCalendarDto {
  year: number;
  month: number;
  student: { id: string; code: string; firstName: string; lastName: string };
  days: CalendarDayDto[];
  month_: AttendanceCounts;
  overall: AttendanceCounts;
}

export interface AttendanceStatsDto {
  from: string;
  to: string;
  today: AttendanceCounts;
  week: AttendanceCounts;
  month: AttendanceCounts;
  range: AttendanceCounts;
  /** Davomat foizi bo‘yicha o‘quvchilar taqsimoti */
  buckets: Array<{ key: string; label: string; students: number }>;
  byGroup: Array<{ groupId: string; groupName: string; courseName: string; total: number; rate: number }>;
  /** Belgilangan dars seanslari soni */
  sessions: number;
  students: number;
}

export interface AttendanceRankingRowDto {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  courseName: string;
  groupName: string | null;
  lessons: number;
  present: number;
  absent: number;
  late: number;
  rate: number;
  streak: number;
}

export interface TeacherOverviewDto {
  date: string;
  groups: Array<{
    id: string;
    name: string;
    courseName: string;
    startTime: string;
    endTime: string;
    students: number;
    isScheduledToday: boolean;
    sessionId: string | null;
    markedToday: number;
  }>;
  todayLessons: number;
  markedLessons: number;
  todayAbsent: Array<{ studentId: string; firstName: string; lastName: string; groupName: string; phone: string }>;
  monthRate: number;
  monthCounts: AttendanceCounts;
}

const BUCKETS: ReadonlyArray<{ key: string; label: string; min: number; max: number }> = [
  { key: '95-100', label: '95–100%', min: 95, max: 100 },
  { key: '90-95', label: '90–95%', min: 90, max: 94 },
  { key: '80-90', label: '80–90%', min: 80, max: 89 },
  { key: '70-80', label: '70–80%', min: 70, max: 79 },
  { key: '0-70', label: '0–70%', min: 0, max: 69 },
];

function emptyCounts(): AttendanceCounts {
  return { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0, rate: 0 };
}

function countsFrom(rows: ReadonlyArray<{ status: AttendanceStatus; count: number }>): AttendanceCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    counts[row.status] += row.count;
    counts.total += row.count;
  }
  const attended = counts.PRESENT + counts.LATE + counts.EXCUSED;
  counts.rate = counts.total === 0 ? 0 : Math.round((attended / counts.total) * 100);
  return counts;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function groupedCounts(where: Prisma.AttendanceWhereInput): Promise<AttendanceCounts> {
  const grouped = await prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } });
  return countsFrom(grouped.map((row) => ({ status: row.status, count: row._count._all })));
}

/** Filtrlardan davomat uchun `where` yasaydi (ruxsat doirasi bilan) */
async function buildWhere(actor: AuthUser, query: AttendanceStatsQuery): Promise<Prisma.AttendanceWhereInput> {
  const access = await getSessionAccess(actor);
  const conditions: Prisma.AttendanceWhereInput[] = [{ student: { deletedAt: null } }];

  if (access.onlyOwnGroups) conditions.push({ group: { teacherId: access.userId } });
  if (query.teacherId) conditions.push({ group: { teacherId: query.teacherId } });
  if (query.groupId) conditions.push({ groupId: query.groupId });
  if (query.courseId) conditions.push({ student: { courseId: query.courseId } });
  if (query.studentId) conditions.push({ studentId: query.studentId });
  if (query.from) conditions.push({ date: { gte: parseDateOnly(query.from) } });
  if (query.to) conditions.push({ date: { lte: parseDateOnly(query.to) } });

  return { AND: conditions };
}

/** Standart davr: joriy oyning boshidan bugungacha */
function resolveRange(query: AttendanceStatsQuery): { from: string; to: string } {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    from: query.from ?? toDateOnly(monthStart),
    to: query.to ?? toDateOnly(now),
  };
}

export const attendanceAnalyticsService = {
  /** O‘quvchining oylik davomat kalendari */
  async calendar(actor: AuthUser, studentId: string, query: AttendanceCalendarQuery): Promise<AttendanceCalendarDto> {
    const access = await getSessionAccess(actor);
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        deletedAt: null,
        ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}),
      },
      select: { id: true, number: true, firstName: true, lastName: true },
    });
    if (!student) {
      throw AppError.notFound('O‘quvchi topilmadi');
    }

    const monthStart = new Date(Date.UTC(query.year, query.month - 1, 1));
    const monthEnd = new Date(Date.UTC(query.year, query.month, 1));

    const records = await prisma.attendance.findMany({
      where: { studentId, date: { gte: monthStart, lt: monthEnd } },
      select: { date: true, status: true, note: true, group: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });

    const byDate = new Map(records.map((record) => [toDateOnly(record.date), record]));
    const daysInMonth = new Date(Date.UTC(query.year, query.month, 0)).getUTCDate();
    const days: CalendarDayDto[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = toDateOnly(new Date(Date.UTC(query.year, query.month - 1, day)));
      const record = byDate.get(date);
      days.push({
        date,
        status: record?.status ?? null,
        statusLabel: record ? ATTENDANCE_STATUS_LABELS[record.status] : null,
        note: record?.note ?? null,
        groupName: record?.group.name ?? null,
      });
    }

    const monthCounts = countsFrom(
      records.reduce<Array<{ status: AttendanceStatus; count: number }>>((acc, record) => {
        const found = acc.find((item) => item.status === record.status);
        if (found) found.count += 1;
        else acc.push({ status: record.status, count: 1 });
        return acc;
      }, []),
    );
    const overall = await groupedCounts({ studentId });

    return {
      year: query.year,
      month: query.month,
      student: {
        id: student.id,
        code: formatStudentNumber(student.number),
        firstName: student.firstName,
        lastName: student.lastName,
      },
      days,
      month_: monthCounts,
      overall,
    };
  },

  /** Davomat statistikasi: bugun, hafta, oy, tanlangan davr va taqsimot */
  async stats(actor: AuthUser, query: AttendanceStatsQuery): Promise<AttendanceStatsDto> {
    const range = resolveRange(query);
    const baseWhere = await buildWhere(actor, { ...query, from: undefined, to: undefined });
    const rangeWhere = await buildWhere(actor, { ...query, from: range.from, to: range.to });

    const dayStart = startOfBusinessDay(new Date());
    const todayDate = parseDateOnly(toDateOnly(new Date()));
    const weekStart = parseDateOnly(toDateOnly(addDays(dayStart, -6)));
    const monthStart = parseDateOnly(toDateOnly(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))));

    const today = await groupedCounts({ AND: [baseWhere, { date: todayDate }] });
    const week = await groupedCounts({ AND: [baseWhere, { date: { gte: weekStart } }] });
    const month = await groupedCounts({ AND: [baseWhere, { date: { gte: monthStart } }] });
    const rangeCounts = await groupedCounts(rangeWhere);

    // Har bir o‘quvchi bo‘yicha davomat foizi → taqsimot
    const perStudent = await prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: rangeWhere,
      _count: { _all: true },
    });
    const totals = new Map<string, { attended: number; total: number }>();
    for (const row of perStudent) {
      const entry = totals.get(row.studentId) ?? { attended: 0, total: 0 };
      entry.total += row._count._all;
      if (ATTENDED.includes(row.status)) entry.attended += row._count._all;
      totals.set(row.studentId, entry);
    }

    const buckets = BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, students: 0 }));
    for (const entry of totals.values()) {
      const rate = entry.total === 0 ? 0 : Math.round((entry.attended / entry.total) * 100);
      const index = BUCKETS.findIndex((bucket) => rate >= bucket.min && rate <= bucket.max);
      if (index >= 0) buckets[index]!.students += 1;
    }

    // Guruhlar kesimi
    const perGroup = await prisma.attendance.groupBy({
      by: ['groupId', 'status'],
      where: rangeWhere,
      _count: { _all: true },
    });
    const groupTotals = new Map<string, { attended: number; total: number }>();
    for (const row of perGroup) {
      const entry = groupTotals.get(row.groupId) ?? { attended: 0, total: 0 };
      entry.total += row._count._all;
      if (ATTENDED.includes(row.status)) entry.attended += row._count._all;
      groupTotals.set(row.groupId, entry);
    }
    const groups = await prisma.group.findMany({
      where: { id: { in: [...groupTotals.keys()] } },
      select: { id: true, name: true, course: { select: { name: true } } },
    });
    const byGroup = groups
      .map((group) => {
        const entry = groupTotals.get(group.id) ?? { attended: 0, total: 0 };
        return {
          groupId: group.id,
          groupName: group.name,
          courseName: group.course.name,
          total: entry.total,
          rate: entry.total === 0 ? 0 : Math.round((entry.attended / entry.total) * 100),
        };
      })
      .sort((a, b) => b.rate - a.rate);

    const sessions = await prisma.attendanceSession.count({
      where: {
        date: { gte: parseDateOnly(range.from), lte: parseDateOnly(range.to) },
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      },
    });

    return {
      from: range.from,
      to: range.to,
      today,
      week,
      month,
      range: rangeCounts,
      buckets,
      byGroup,
      sessions,
      students: totals.size,
    };
  },

  /** Davomat reytingi: eng yuqori foizli o‘quvchilar */
  async ranking(actor: AuthUser, query: AttendanceRankingQuery): Promise<AttendanceRankingRowDto[]> {
    const range = resolveRange(query);
    const where = await buildWhere(actor, { ...query, from: range.from, to: range.to });

    const grouped = await prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where,
      _count: { _all: true },
    });
    if (grouped.length === 0) return [];

    const totals = new Map<string, { present: number; absent: number; late: number; attended: number; total: number }>();
    for (const row of grouped) {
      const entry = totals.get(row.studentId) ?? { present: 0, absent: 0, late: 0, attended: 0, total: 0 };
      entry.total += row._count._all;
      if (row.status === 'PRESENT') entry.present += row._count._all;
      if (row.status === 'ABSENT') entry.absent += row._count._all;
      if (row.status === 'LATE') entry.late += row._count._all;
      if (ATTENDED.includes(row.status)) entry.attended += row._count._all;
      totals.set(row.studentId, entry);
    }

    const eligible = [...totals.entries()].filter(([, entry]) => entry.total >= query.minLessons);
    if (eligible.length === 0) return [];

    const students = await prisma.student.findMany({
      where: { id: { in: eligible.map(([id]) => id) }, deletedAt: null },
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        course: { select: { name: true } },
        group: { select: { name: true } },
        streak: { select: { current: true } },
      },
    });

    return students
      .map((student) => {
        const entry = totals.get(student.id)!;
        return {
          studentId: student.id,
          code: formatStudentNumber(student.number),
          firstName: student.firstName,
          lastName: student.lastName,
          courseName: student.course.name,
          groupName: student.group?.name ?? null,
          lessons: entry.total,
          present: entry.present,
          absent: entry.absent,
          late: entry.late,
          rate: entry.total === 0 ? 0 : Math.round((entry.attended / entry.total) * 100),
          streak: student.streak?.current ?? 0,
        };
      })
      .sort((a, b) => b.rate - a.rate || b.lessons - a.lessons || a.lastName.localeCompare(b.lastName, 'uz'))
      .slice(0, query.limit);
  },

  /** O‘qituvchi paneli: bugungi darslar, belgilanmagan guruhlar, kelmaganlar */
  async teacherOverview(actor: AuthUser): Promise<TeacherOverviewDto> {
    const access = await getSessionAccess(actor);
    const today = new Date();
    const todayDate = parseDateOnly(toDateOnly(today));
    const weekDays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
    const todayWeekDay = weekDays[todayDate.getUTCDay()]!;

    const groups = await prisma.group.findMany({
      where: {
        status: 'ACTIVE',
        ...(access.onlyOwnGroups ? { teacherId: access.userId } : {}),
      },
      select: {
        id: true,
        name: true,
        startTime: true,
        endTime: true,
        scheduleDays: true,
        course: { select: { name: true } },
        _count: { select: { students: { where: { deletedAt: null, status: 'ACTIVE' } } } },
      },
      orderBy: { startTime: 'asc' },
    });

    const sessions = await prisma.attendanceSession.findMany({
      where: { date: todayDate, groupId: { in: groups.map((group) => group.id) } },
      select: { id: true, groupId: true, _count: { select: { attendances: true } } },
    });
    const sessionByGroup = new Map(sessions.map((session) => [session.groupId, session]));

    const rows = groups.map((group) => {
      const session = sessionByGroup.get(group.id);
      return {
        id: group.id,
        name: group.name,
        courseName: group.course.name,
        startTime: group.startTime,
        endTime: group.endTime,
        students: group._count.students,
        isScheduledToday: group.scheduleDays.includes(todayWeekDay),
        sessionId: session?.id ?? null,
        markedToday: session?._count.attendances ?? 0,
      };
    });

    const absentToday = await prisma.attendance.findMany({
      where: {
        date: todayDate,
        status: 'ABSENT',
        groupId: { in: groups.map((group) => group.id) },
        student: { deletedAt: null },
      },
      select: {
        student: { select: { id: true, firstName: true, lastName: true, phone: true } },
        group: { select: { name: true } },
      },
      take: 50,
    });

    const monthStart = parseDateOnly(toDateOnly(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))));
    const monthCounts = await groupedCounts({
      date: { gte: monthStart },
      student: { deletedAt: null },
      ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}),
    });

    const scheduledToday = rows.filter((row) => row.isScheduledToday);

    return {
      date: toDateOnly(today),
      groups: rows,
      todayLessons: scheduledToday.length,
      markedLessons: scheduledToday.filter((row) => row.markedToday > 0).length,
      todayAbsent: absentToday.map((row) => ({
        studentId: row.student.id,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
        groupName: row.group.name,
        phone: row.student.phone,
      })),
      monthRate: monthCounts.rate,
      monthCounts,
    };
  },
};
