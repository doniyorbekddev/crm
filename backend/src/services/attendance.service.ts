import { prisma } from '../config/database.js';
import { assertTopicForGroup, startTopicForAttendees } from './curriculum.service.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AttendanceStatus, StudentStatus, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { MarkAttendanceInput } from '../validators/attendance.validator.js';
import { auditService } from './audit.service.js';
import { attendanceSessionService } from './attendanceSession.service.js';
import { gamificationHooks } from './gamification.service.js';
import { notificationService } from './notification.service.js';
import { permissionService } from './permission.service.js';
import { masteryService } from './mastery.service.js';
import { notifyAttendanceLate } from './studentNotify.service.js';
import { isRosterLimited } from './teachingAccess.js';
import { branchScopeOf, inBranch } from './branchScope.js';
import type { BranchScope } from './branchScope.js';
import { businessDateString } from '../utils/dates.js';

/** JS `getUTCDay()` (0 = yakshanba) → Prisma WeekDay */
const WEEK_DAYS: readonly WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Davomat qilinadigan holatlar — muzlatilgan yoki chiqib ketgan o‘quvchi jurnalda ko‘rinmaydi */
const MARKABLE_STATUSES: readonly StudentStatus[] = ['ACTIVE'];

export interface AttendanceStudentRow {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: AttendanceStatus | null;
  note: string | null;
  markedAt: string | null;
  markedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface AttendanceSheetDto {
  /** Shu kunga ochilgan dars seansi (davomat belgilanganda avtomatik yaratiladi) */
  session: { id: string; topic: string | null; startTime: string | null; endTime: string | null } | null;
  group: {
    id: string;
    name: string;
    courseName: string;
    room: string | null;
    startTime: string;
    endTime: string;
    scheduleDays: WeekDay[];
    teacher: { id: string; firstName: string; lastName: string } | null;
  };
  date: string;
  /** Tanlangan sana guruh jadvalidagi kunga to‘g‘ri keladimi */
  isScheduledDay: boolean;
  canMark: boolean;
  students: AttendanceStudentRow[];
  /**
   * Shu kuni belgilangan, lekin hozir guruhda faol bo'lmagan o'quvchilar (chiqib ketgan, muzlatilgan, boshqa guruhga
   * o'tgan). Tarix yo'qolmasligi uchun ko'rsatiladi; ularni qayta belgilab bo'lmaydi va `summary` ga kirmaydi.
   */
  formerStudents: AttendanceStudentRow[];
  summary: Record<AttendanceStatus, number> & { unmarked: number; total: number };
  /** O'quv markaz vaqti bo'yicha bugungi sana */
  today: string;
  /** Seans bekor qilingan bo'lsa — belgilashdan oldin ogohlantirish uchun */
  sessionStatus: 'PLANNED' | 'HELD' | 'CANCELLED' | null;
}

export type DayGroupState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface AttendanceDayGroupDto {
  id: string;
  name: string;
  courseName: string;
  room: string | null;
  /** Seansda vaqt o'zgartirilgan bo'lsa — o'sha, aks holda guruh jadvalidagi vaqt */
  startTime: string;
  endTime: string;
  teacher: { id: string; firstName: string; lastName: string } | null;
  /** Guruhdagi faol o'quvchilar */
  students: number;
  /** Ulardan shu kunga belgilanganlari */
  marked: number;
  absent: number;
  state: DayGroupState;
  /** false — jadvalda yo'q kun, lekin seans ochilgan (qo'shimcha dars) */
  isScheduledDay: boolean;
}

export interface AttendanceDayDto {
  date: string;
  today: string;
  /** Shu kunga darsi bor guruhlar (boshlanish vaqti bo'yicha) */
  groups: AttendanceDayGroupDto[];
  /** Shu kuni darsi yo'q, lekin foydalanuvchi ochishi mumkin bo'lgan faol guruhlar (qo'shimcha dars uchun) */
  otherGroups: Array<{ id: string; name: string; courseName: string; students: number }>;
}

export interface StudentAttendanceDto {
  id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  groupName: string;
}

export interface StudentAttendanceHistoryDto {
  items: StudentAttendanceDto[];
  summary: Record<AttendanceStatus, number> & { total: number; attendanceRate: number };
}

interface AttendanceAccess {
  userId: string;
  canMark: boolean;
  /** O‘qituvchi faqat o‘zi dars beradigan guruh jurnalini ochadi */
  onlyOwnGroups: boolean;
  /** Filialga biriktirilgan xodim boshqa filial guruhini ochmaydi */
  scope: BranchScope;
}

async function getAttendanceAccess(actor: AuthUser): Promise<AttendanceAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return {
    userId: actor.id,
    canMark: permissions.has(PERMISSIONS.ATTENDANCE_MARK),
    onlyOwnGroups: isRosterLimited(permissions, PERMISSIONS.GROUP_MANAGE),
    scope: await branchScopeOf(actor),
  };
}

/** Foydalanuvchi ko'ra oladigan guruhlar: o'qituvchi — faqat o'zi dars beradiganlar, qolganlar — filial doirasida */
function visibleGroups(access: AttendanceAccess): Prisma.GroupWhereInput {
  return access.onlyOwnGroups ? { teacherId: access.userId } : inBranch(access.scope);
}

function emptySummary(): Record<AttendanceStatus, number> {
  return { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const groupSheetSelect = {
  id: true,
  name: true,
  room: true,
  startTime: true,
  endTime: true,
  scheduleDays: true,
  teacherId: true,
  branchId: true,
  course: { select: { name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.GroupSelect;

async function findVisibleGroup(access: AttendanceAccess, groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupSheetSelect });
  // Guruh ID'si klientdan keladi — egalik va filial har so'rovda shu yerda tekshiriladi. Begona guruh uchun 404
  // (mavjudligi oshkor qilinmaydi).
  const foreignBranch = !access.onlyOwnGroups && access.scope.branchId !== null && group?.branchId !== access.scope.branchId;
  if (!group || (access.onlyOwnGroups && group.teacherId !== access.userId) || foreignBranch) {
    throw AppError.notFound('Guruh topilmadi');
  }
  return group;
}

export const attendanceService = {
  /** Guruhning bir kunlik davomat jurnali: o‘quvchilar + allaqachon belgilangan holatlar */
  async getSheet(actor: AuthUser, groupId: string, date: Date): Promise<AttendanceSheetDto> {
    const access = await getAttendanceAccess(actor);
    const group = await findVisibleGroup(access, groupId);

    const students = await prisma.student.findMany({
      where: { groupId, deletedAt: null, status: { in: [...MARKABLE_STATUSES] } },
      select: { id: true, number: true, firstName: true, lastName: true, phone: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const session = await prisma.attendanceSession.findUnique({
      where: { groupId_date: { groupId, date } },
      select: { id: true, topic: true, startTime: true, endTime: true, status: true },
    });

    const records = await prisma.attendance.findMany({
      where: { groupId, date },
      select: {
        studentId: true,
        status: true,
        note: true,
        updatedAt: true,
        markedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const byStudent = new Map(records.map((record) => [record.studentId, record]));
    // Belgisi bor, lekin joriy ro'yxatda yo'q o'quvchilar — tarix uchun (yozuv saqlanadi, qayta belgilanmaydi)
    const activeIds = new Set(students.map((student) => student.id));
    const formerIds = records.map((record) => record.studentId).filter((id) => !activeIds.has(id));
    const former =
      formerIds.length === 0
        ? []
        : await prisma.student.findMany({
            where: { id: { in: formerIds } },
            select: { id: true, number: true, firstName: true, lastName: true, phone: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          });
    const formerStudents: AttendanceStudentRow[] = former.map((student) => {
      const record = byStudent.get(student.id)!;
      return {
        studentId: student.id,
        code: formatStudentNumber(student.number),
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        status: record.status,
        note: record.note,
        markedAt: record.updatedAt.toISOString(),
        markedBy: record.markedBy,
      };
    });

    const summary = { ...emptySummary(), unmarked: 0, total: students.length };
    const rows: AttendanceStudentRow[] = students.map((student) => {
      const record = byStudent.get(student.id);
      if (record) summary[record.status] += 1;
      else summary.unmarked += 1;
      return {
        studentId: student.id,
        code: formatStudentNumber(student.number),
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        status: record?.status ?? null,
        note: record?.note ?? null,
        markedAt: record?.updatedAt.toISOString() ?? null,
        markedBy: record?.markedBy ?? null,
      };
    });

    return {
      session: session ? { id: session.id, topic: session.topic, startTime: session.startTime, endTime: session.endTime } : null,
      sessionStatus: session?.status ?? null,
      today: businessDateString(new Date()),
      formerStudents,
      group: {
        id: group.id,
        name: group.name,
        courseName: group.course.name,
        room: group.room,
        startTime: group.startTime,
        endTime: group.endTime,
        scheduleDays: group.scheduleDays,
        teacher: group.teacher,
      },
      date: toDateOnly(date),
      isScheduledDay: group.scheduleDays.includes(WEEK_DAYS[date.getUTCDay()]!),
      canMark: access.canMark,
      students: rows,
      summary,
    };
  },

  /**
   * Bir kunlik taxta: shu sanaga darsi bor guruhlar va ularning davomat holati.
   *
   * "Darsi bor" = guruh faol, sana guruhning boshlanish–tugash oralig'ida va (hafta kuni jadvalda bor YOKI shu kunga
   * seans ochilgan). Alohida "dars" jadvali yo'q: jadval — guruhdagi haftalik shablon, haqiqiy dars — `attendance_sessions`
   * (`groupId + date` yagona, shuning uchun bitta guruh bir kunda bitta karta).
   */
  async day(actor: AuthUser, date: Date): Promise<AttendanceDayDto> {
    const access = await getAttendanceAccess(actor);
    const weekDay = WEEK_DAYS[date.getUTCDay()]!;
    const groups = await prisma.group.findMany({
      where: { AND: [visibleGroups(access), { status: 'ACTIVE', startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }] }] },
      select: {
        id: true,
        name: true,
        room: true,
        startTime: true,
        endTime: true,
        scheduleDays: true,
        course: { select: { name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        sessions: { where: { date }, select: { status: true, startTime: true, endTime: true } },
        _count: { select: { students: { where: { deletedAt: null, status: { in: [...MARKABLE_STATUSES] } } } } },
      },
      orderBy: [{ startTime: 'asc' }, { name: 'asc' }],
    });
    const due = groups.filter((group) => group.scheduleDays.includes(weekDay) || group.sessions.length > 0);

    // Faqat HOZIR SHU GURUHDA faol o'quvchilarning belgilari sanaladi — "tugallandi" holati joriy ro'yxatga nisbatan.
    // (Boshqa guruhga o'tgan o'quvchining eski belgisi sanalsa, belgilar soni o'quvchilar sonidan oshib ketardi.)
    const marks =
      due.length === 0
        ? []
        : await prisma.$queryRaw<Array<{ groupId: string; marked: number; absent: number }>>`
            SELECT a."groupId", COUNT(*)::int AS "marked", COUNT(*) FILTER (WHERE a."status" = 'ABSENT')::int AS "absent"
            FROM "attendances" a
            JOIN "students" s ON s."id" = a."studentId" AND s."groupId" = a."groupId"
            WHERE a."date" = ${date}::date AND a."groupId" IN (${Prisma.join(due.map((group) => group.id))})
              AND s."deletedAt" IS NULL AND s."status"::text IN (${Prisma.join([...MARKABLE_STATUSES])})
            GROUP BY a."groupId"
          `;
    const markedBy = new Map(marks.map((row) => [row.groupId, { marked: row.marked, absent: row.absent }]));

    const dueIds = new Set(due.map((group) => group.id));
    return {
      date: toDateOnly(date),
      today: businessDateString(new Date()),
      groups: due
        .map((group) => {
          const session = group.sessions[0];
          const students = group._count.students;
          const { marked, absent } = markedBy.get(group.id) ?? { marked: 0, absent: 0 };
          const state: DayGroupState =
            session?.status === 'CANCELLED' ? 'CANCELLED' : marked === 0 ? 'NOT_STARTED' : marked < students ? 'IN_PROGRESS' : 'COMPLETED';
          return {
            id: group.id,
            name: group.name,
            courseName: group.course.name,
            room: group.room,
            startTime: session?.startTime ?? group.startTime,
            endTime: session?.endTime ?? group.endTime,
            teacher: group.teacher,
            students,
            marked,
            absent,
            state,
            isScheduledDay: group.scheduleDays.includes(weekDay),
          };
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name, 'uz')),
      otherGroups: groups
        .filter((group) => !dueIds.has(group.id))
        .map((group) => ({ id: group.id, name: group.name, courseName: group.course.name, students: group._count.students }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uz')),
    };
  },

  /**
   * Davomatni saqlaydi. Bitta kunni qayta belgilash mumkin — yozuv (student, group, date)
   * bo‘yicha yagona, shuning uchun upsert qilinadi.
   */
  async mark(actor: AuthUser, groupId: string, input: MarkAttendanceInput, client: ClientInfo): Promise<AttendanceSheetDto> {
    const access = await getAttendanceAccess(actor);
    const group = await findVisibleGroup(access, groupId);

    if (input.topicId) await assertTopicForGroup(input.topicId, groupId);

    const ids = input.records.map((record) => record.studentId);
    if (new Set(ids).size !== ids.length) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'records', message: 'Bitta o‘quvchi ro‘yxatda ikki marta kelgan' },
      ]);
    }

    const students = await prisma.student.findMany({
      where: { id: { in: ids }, groupId, deletedAt: null, status: { in: [...MARKABLE_STATUSES] } },
      select: { id: true },
    });
    if (students.length !== ids.length) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'records', message: 'Ro‘yxatdagi ba’zi o‘quvchilar bu guruhda faol emas' },
      ]);
    }

    // Kelmagan o‘quvchilar haqida xabar beriladigan xodimlar (admin/manager)
    const supervisors = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: actor.id },
        role: { permissions: { some: { permission: { key: PERMISSIONS.STUDENT_MANAGE } } } },
      },
      select: { id: true },
      take: 10,
    });
    const studentNames = new Map(
      (
        await prisma.student.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      ).map((student) => [student.id, `${student.firstName} ${student.lastName}`]),
    );

    // Ota-onalar tranzaksiyadan **oldin** o'qiladi: aks holda 30 kishilik guruhda
    // tranzaksiya ichida 30 ta qo'shimcha so'rov ketardi va qulf uzoq ushlanardi.
    const parentLinks = await prisma.studentParent.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, parentId: true },
    });
    const parentsByStudent = new Map<string, string[]>();
    for (const link of parentLinks) {
      parentsByStudent.set(link.studentId, [...(parentsByStudent.get(link.studentId) ?? []), link.parentId]);
    }

    let sessionId: string | null = null;
    await prisma.$transaction(
      async (tx) => {
      sessionId = await attendanceSessionService.ensureSession(tx, {
        groupId,
        date: input.date,
        teacherId: group.teacherId,
        markedById: actor.id,
        topicId: input.topicId ?? null,
      });

      // Mavzu tanlangan bo'lsa — kelganlarda "o'rganilmoqda" (LMS progressi)
      if (input.topicId) {
        await startTopicForAttendees(tx, {
          topicId: input.topicId,
          studentIds: input.records.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').map((record) => record.studentId),
          markedById: actor.id,
        });
      }

      for (const record of input.records) {
        const saved = await tx.attendance.upsert({
          where: { studentId_groupId_date: { studentId: record.studentId, groupId, date: input.date } },
          create: {
            studentId: record.studentId,
            groupId,
            sessionId,
            date: input.date,
            status: record.status,
            note: record.note ?? null,
            markedById: actor.id,
          },
          update: { status: record.status, note: record.note ?? null, markedById: actor.id, sessionId },
          select: { id: true, status: true },
        });

        // XP, ketma-ketlik va nishonlar (qayta belgilansa qayta hisoblanadi)
        await gamificationHooks.onAttendanceMarked(tx, {
          studentId: record.studentId,
          attendanceId: saved.id,
          status: saved.status,
          date: input.date,
        });

        // Kechikdi — ota-onaga yumshoq xabar (TZ 3.0 §42 "Attendance late")
        if (saved.status === 'LATE') {
          await notifyAttendanceLate(tx, { attendanceId: saved.id, studentId: record.studentId, groupName: group.name, date: input.date });
        }

        // Darsga kelmagan o‘quvchi: xodimlarga ilova ichida, ota-onasiga esa Telegramga
        if (saved.status === 'ABSENT') {
          const name = studentNames.get(record.studentId) ?? 'O‘quvchi';
          const message = `${name} — ${group.name} guruhidagi ${toDateOnly(input.date)} kungi darsga kelmadi.`;

          if (supervisors.length > 0) {
            await notificationService.createManyInTransaction(
              tx,
              supervisors.map((supervisor) => ({
                userId: supervisor.id,
                type: 'SYSTEM' as const,
                title: 'Darsga kelmadi',
                message,
                entityType: 'student',
                entityId: record.studentId,
                dedupeKey: `absence:${saved.id}`,
              })),
            );
          }

          // Ota-onalar: CRM hisobi bo'lmasligi mumkin, shuning uchun to'g'ridan-to'g'ri kanalga
          for (const parentId of parentsByStudent.get(record.studentId) ?? []) {
            await notificationService.notifyExternalInTransaction(tx, {
              type: 'CHILD_ABSENT',
              title: 'Farzandingiz darsga kelmadi',
              message,
              parentId,
              dedupeKey: `absence:${saved.id}:parent:${parentId}`,
            });
          }
          // O'quvchining o'ziga ham (Telegramni ulagan bo'lsa)
          await notificationService.notifyExternalInTransaction(tx, {
            type: 'CHILD_ABSENT',
            title: 'Darsga kelmadingiz',
            message,
            studentId: record.studentId,
            dedupeKey: `absence:${saved.id}:student`,
          });
        }
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'attendance.marked',
        entityType: 'group',
        entityId: groupId,
        metadata: { group: group.name, date: toDateOnly(input.date), count: input.records.length },
        ...client,
      });
      },
      // Katta guruhda (30+ o'quvchi) har biriga XP va ketma-ketlik qayta hisoblanadi —
      // standart 5 soniya chegarasi yetmay qolishi mumkin.
      { timeout: 30_000 },
    );

    // Mavzuli dars — o'zlashtirish (davomat manbasi) yangilanadi
    const topicId = input.topicId ?? (sessionId ? (await prisma.attendanceSession.findUnique({ where: { id: sessionId }, select: { topicId: true } }))?.topicId : null);
    if (topicId) await masteryService.refresh(ids);

    return this.getSheet(actor, groupId, input.date);
  },

  /** O‘quvchining so‘nggi davomat tarixi va davomat foizi */
  async studentHistory(actor: AuthUser, studentId: string, limit = 60): Promise<StudentAttendanceHistoryDto> {
    const access = await getAttendanceAccess(actor);
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
      select: { id: true },
    });
    if (!student) {
      throw AppError.notFound('O‘quvchi topilmadi');
    }

    const items = await prisma.attendance.findMany({
      where: { studentId },
      select: { id: true, date: true, status: true, note: true, group: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: limit,
    });

    const grouped = await prisma.attendance.groupBy({
      by: ['status'],
      where: { studentId },
      _count: { _all: true },
    });

    const summary = { ...emptySummary(), total: 0, attendanceRate: 0 };
    for (const row of grouped) {
      summary[row.status] = row._count._all;
      summary.total += row._count._all;
    }
    // Kelgan deb hisoblanadi: keldi, kechikdi va sababli
    const attended = summary.PRESENT + summary.LATE + summary.EXCUSED;
    summary.attendanceRate = summary.total === 0 ? 0 : Math.round((attended / summary.total) * 100);

    return {
      items: items.map((item) => ({
        id: item.id,
        date: toDateOnly(item.date),
        status: item.status,
        note: item.note,
        groupName: item.group.name,
      })),
      summary,
    };
  },
};
