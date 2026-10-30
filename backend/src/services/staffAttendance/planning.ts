import { prisma } from '../../config/database.js';
import { EMPLOYEE_POSITION_LABELS } from '../../config/employeeLabels.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { addDays, businessDayFromString, dateColumn } from '../../utils/dates.js';
import { buildDayPlan, NO_EXCUSE, weekDayOf } from '../../utils/staffAttendance.js';
import type { DayExcuse, DayPlan, ScheduleVersion } from '../../utils/staffAttendance.js';

/**
 * Kimning davomati yuritiladi va har kuni undan nima kutiladi.
 *
 * Davomat **tizim hisobi (User)** bo'yicha: o'qituvchi — `TeacherProfile`, boshqa xodim — `Employee.userId`.
 * Yangi xodim yozuvi yaratilmaydi. Hisobi yo'q xodim (farrosh va h.k.) QR'ni skanerlay olmaydi —
 * unga avval "Foydalanuvchilar" bo'limida hisob ochiladi.
 */

export interface StaffSubject {
  id: string;
  firstName: string;
  lastName: string;
  branchId: string;
  avatarPath: string | null;
  kind: 'TEACHER' | 'EMPLOYEE';
  position: string;
  employeeId: string | null;
}

const ACTIVE_HR = ['ACTIVE', 'ON_LEAVE'] as const;

export function subjectWhere(branchId: string | null): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    status: 'ACTIVE',
    ...(branchId ? { branchId } : {}),
    OR: [{ teacherProfile: { employmentStatus: { in: [...ACTIVE_HR] } } }, { employee: { status: { in: [...ACTIVE_HR] } } }],
  };
}

const subjectSelect = {
  id: true,
  firstName: true,
  lastName: true,
  branchId: true,
  avatarPath: true,
  teacherProfile: { select: { employmentStatus: true } },
  employee: { select: { id: true, position: true, positionTitle: true, status: true } },
} satisfies Prisma.UserSelect;

type SubjectRecord = Prisma.UserGetPayload<{ select: typeof subjectSelect }>;

function toSubject(user: SubjectRecord): StaffSubject {
  const employee = user.employee && ACTIVE_HR.includes(user.employee.status as (typeof ACTIVE_HR)[number]) ? user.employee : null;
  const kind = employee ? 'EMPLOYEE' : 'TEACHER';
  const position = employee ? (employee.positionTitle ?? EMPLOYEE_POSITION_LABELS[employee.position]) : 'O‘qituvchi';
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    branchId: user.branchId,
    avatarPath: user.avatarPath,
    kind,
    position,
    employeeId: employee?.id ?? null,
  };
}

export async function loadSubjects(branchId: string | null, extra: Prisma.UserWhereInput = {}): Promise<StaffSubject[]> {
  const users = await prisma.user.findMany({
    where: { AND: [subjectWhere(branchId), extra] },
    select: subjectSelect,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return users.map(toSubject);
}

export async function findSubject(userId: string): Promise<StaffSubject | null> {
  const user = await prisma.user.findFirst({ where: { AND: [{ id: userId }, subjectWhere(null)] }, select: subjectSelect });
  return user ? toSubject(user) : null;
}

const toDate = (value: Date) => value.toISOString().slice(0, 10);

export interface Planner {
  plan(userId: string, date: string): DayPlan;
  excuse(userId: string, date: string): DayExcuse;
  schedule(userId: string, date: string): (ScheduleVersion & { effectiveFrom: string }) | null;
}

/**
 * Berilgan xodimlar va sana oralig'i uchun barcha kerakli ma'lumotni bir necha so'rovda yuklaydi:
 * jadval versiyalari, bayramlar, istisnolar, (LESSONS uchun) guruh darslari va bekor qilingan darslar,
 * tasdiqlangan ruxsat so'rovlari va ta'tillar.
 */
export async function loadPlanner(subjects: ReadonlyArray<Pick<StaffSubject, 'id' | 'employeeId'>>, from: string, to: string): Promise<Planner> {
  const userIds = subjects.map((subject) => subject.id);
  const fromDate = dateColumn(businessDayFromString(from));
  const toDateValue = dateColumn(businessDayFromString(to));

  const [schedules, holidays, exceptions, requests, leaves] = await Promise.all([
    prisma.staffWorkSchedule.findMany({
      where: { userId: { in: userIds }, effectiveFrom: { lte: toDateValue } },
      orderBy: { effectiveFrom: 'desc' },
    }),
    prisma.staffHoliday.findMany({ where: { date: { gte: fromDate, lte: toDateValue } } }),
    prisma.staffScheduleException.findMany({ where: { userId: { in: userIds }, date: { gte: fromDate, lte: toDateValue } } }),
    prisma.staffPermissionRequest.findMany({
      where: { userId: { in: userIds }, status: 'APPROVED', startDate: { lte: toDateValue }, endDate: { gte: fromDate } },
    }),
    prisma.employeeLeave.findMany({
      where: {
        employeeId: { in: subjects.flatMap((subject) => (subject.employeeId ? [subject.employeeId] : [])) },
        status: 'APPROVED',
        startDate: { lte: toDateValue },
        endDate: { gte: fromDate },
      },
      select: { employeeId: true, startDate: true, endDate: true, type: true },
    }),
  ]);

  const lessonUsers = [...new Set(schedules.filter((schedule) => schedule.mode === 'LESSONS').map((schedule) => schedule.userId))];
  const groups = lessonUsers.length
    ? await prisma.group.findMany({
        where: {
          teacherId: { in: lessonUsers },
          status: { in: ['ACTIVE', 'COMPLETED'] },
          startDate: { lte: toDateValue },
          OR: [{ endDate: null }, { endDate: { gte: fromDate } }],
        },
        select: { id: true, name: true, teacherId: true, scheduleDays: true, startTime: true, endTime: true, startDate: true, endDate: true },
      })
    : [];
  const cancelled = groups.length
    ? await prisma.attendanceSession.findMany({
        where: { groupId: { in: groups.map((group) => group.id) }, status: 'CANCELLED', date: { gte: fromDate, lte: toDateValue } },
        select: { groupId: true, date: true },
      })
    : [];
  const cancelledKeys = new Set(cancelled.map((session) => `${session.groupId}:${toDate(session.date)}`));

  const schedulesByUser = new Map<string, typeof schedules>();
  for (const schedule of schedules) schedulesByUser.set(schedule.userId, [...(schedulesByUser.get(schedule.userId) ?? []), schedule]);
  const holidayByDate = new Map(holidays.map((holiday) => [toDate(holiday.date), holiday.name]));
  const exceptionByKey = new Map(exceptions.map((exception) => [`${exception.userId}:${toDate(exception.date)}`, exception]));
  const userByEmployee = new Map(subjects.flatMap((subject) => (subject.employeeId ? [[subject.employeeId, subject.id] as const] : [])));

  const versionAt = (userId: string, date: string) =>
    (schedulesByUser.get(userId) ?? []).find((schedule) => toDate(schedule.effectiveFrom) <= date) ?? null;

  const planner: Planner = {
    schedule(userId, date) {
      const version = versionAt(userId, date);
      if (!version) return null;
      return {
        mode: version.mode,
        workDays: version.workDays,
        startTime: version.startTime,
        endTime: version.endTime,
        breakMinutes: version.breakMinutes,
        graceMinutes: version.graceMinutes,
        absentAfterMinutes: version.absentAfterMinutes,
        lessonLeadMinutes: version.lessonLeadMinutes,
        effectiveFrom: toDate(version.effectiveFrom),
      };
    },

    plan(userId, date) {
      const schedule = planner.schedule(userId, date);
      const weekday = weekDayOf(date);
      const lessons =
        schedule?.mode === 'LESSONS'
          ? groups
              .filter(
                (group) =>
                  group.teacherId === userId &&
                  group.scheduleDays.includes(weekday) &&
                  toDate(group.startDate) <= date &&
                  (!group.endDate || toDate(group.endDate) >= date) &&
                  !cancelledKeys.has(`${group.id}:${date}`),
              )
              .map((group) => ({ groupName: group.name, startTime: group.startTime, endTime: group.endTime }))
          : [];
      const exception = exceptionByKey.get(`${userId}:${date}`) ?? null;
      return buildDayPlan(date, {
        schedule,
        holiday: holidayByDate.get(date) ?? null,
        exception: exception ? { type: exception.type, startTime: exception.startTime, endTime: exception.endTime, reason: exception.reason } : null,
        lessons,
      });
    },

    excuse(userId, date) {
      const leave = leaves.find(
        (item) => userByEmployee.get(item.employeeId) === userId && toDate(item.startDate) <= date && toDate(item.endDate) >= date,
      );
      if (leave) return { ...NO_EXCUSE, fullDay: true, label: 'Ta’til' };
      const own = requests.filter((request) => request.userId === userId && toDate(request.startDate) <= date && toDate(request.endDate) >= date);
      if (own.length === 0) return NO_EXCUSE;
      const absence = own.find((request) => request.type === 'ABSENCE');
      if (absence) return { ...NO_EXCUSE, fullDay: true, label: absence.reason };
      const late = own.find((request) => request.type === 'LATE_ARRIVAL');
      const early = own.find((request) => request.type === 'EARLY_LEAVE');
      return {
        fullDay: false,
        lateUntil: late?.time ?? null,
        earlyFrom: early?.time ?? null,
        label: [late?.reason, early?.reason].filter(Boolean).join('; ') || null,
      };
    },
  };
  return planner;
}

/** Oxirgi `days` kun (bugun ham) — "YYYY-MM-DD" */
export function recentRange(today: string, days: number): { from: string; to: string } {
  const from = addDays(businessDayFromString(today), -(days - 1));
  return { from: toDate(dateColumn(from)), to: today };
}
