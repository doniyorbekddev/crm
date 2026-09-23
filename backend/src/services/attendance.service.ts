import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AttendanceStatus, Prisma, StudentStatus, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { MarkAttendanceInput } from '../validators/attendance.validator.js';
import { auditService } from './audit.service.js';
import { attendanceSessionService } from './attendanceSession.service.js';
import { gamificationHooks } from './gamification.service.js';
import { notificationService } from './notification.service.js';
import { permissionService } from './permission.service.js';

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
  summary: Record<AttendanceStatus, number> & { unmarked: number; total: number };
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
}

async function getAttendanceAccess(actor: AuthUser): Promise<AttendanceAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  const canManageGroups = permissions.has(PERMISSIONS.GROUP_MANAGE);
  return {
    userId: actor.id,
    canMark: permissions.has(PERMISSIONS.ATTENDANCE_MARK),
    onlyOwnGroups: !canManageGroups && permissions.has(PERMISSIONS.ATTENDANCE_MARK),
  };
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
  course: { select: { name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.GroupSelect;

async function findVisibleGroup(access: AttendanceAccess, groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupSheetSelect });
  if (!group || (access.onlyOwnGroups && group.teacherId !== access.userId)) {
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
      select: { id: true, topic: true, startTime: true, endTime: true },
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
      session,
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
   * Davomatni saqlaydi. Bitta kunni qayta belgilash mumkin — yozuv (student, group, date)
   * bo‘yicha yagona, shuning uchun upsert qilinadi.
   */
  async mark(actor: AuthUser, groupId: string, input: MarkAttendanceInput, client: ClientInfo): Promise<AttendanceSheetDto> {
    const access = await getAttendanceAccess(actor);
    const group = await findVisibleGroup(access, groupId);

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

    await prisma.$transaction(async (tx) => {
      const sessionId = await attendanceSessionService.ensureSession(tx, {
        groupId,
        date: input.date,
        teacherId: group.teacherId,
        markedById: actor.id,
      });

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
          const parents = await tx.studentParent.findMany({
            where: { studentId: record.studentId },
            select: { parentId: true },
          });
          for (const link of parents) {
            await notificationService.notifyExternalInTransaction(tx, {
              title: 'Farzandingiz darsga kelmadi',
              message,
              parentId: link.parentId,
              dedupeKey: `absence:${saved.id}:parent:${link.parentId}`,
            });
          }
          // O'quvchining o'ziga ham (Telegramni ulagan bo'lsa)
          await notificationService.notifyExternalInTransaction(tx, {
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
    });

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
