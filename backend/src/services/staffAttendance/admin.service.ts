import { prisma } from '../../config/database.js';
import type { Prisma, StaffAttendanceEventType, StaffScheduleExceptionType, StaffScheduleMode, WeekDay } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { businessDateString } from '../../utils/dates.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { atBusinessTime, eachDate, parseTime } from '../../utils/staffAttendance.js';
import { exportSubtitle } from '../../utils/tableExport.js';
import type { ExportTable } from '../../utils/tableExport.js';
import { auditService } from '../audit.service.js';
import { branchScopeOf } from '../branchScope.js';
import { ACTION_LABELS } from './attendance.service.js';
import { clockTime, daySelect, evaluateRow, fullName, lockDay, recomputeDay, toDateString } from './common.js';
import type { StaffDayDto } from './common.js';
import { findSubject, loadPlanner, loadSubjects } from './planning.js';
import type { StaffSubject } from './planning.js';
import { staffPermissionService } from './requests.service.js';
import type { PermissionRequestDto } from './requests.service.js';
import { summarize } from './summary.js';
import type { StaffSummary } from './summary.js';

/**
 * Rahbar tomoni: kunlik panel, xodim kuni tafsiloti, hisobot, jadvallar, bayramlar, istisnolar va tuzatishlar.
 * Ko'rinish doirasi — filial (`branch.view_all` bo'lmasa faqat o'z filiali).
 *
 * Tuzatish asl hodisani **o'zgartirmaydi**: u bekor qilingan deb belgilanadi va yangi hodisa qo'shiladi;
 * har tuzatish `StaffAttendanceCorrection` da (oldin/keyin, sabab, kim, qachon) o'zgarmas holda qoladi.
 * Davomat maoshga ta'sir qilmaydi — bu yerda hech qanday moliyaviy yozuv yaratilmaydi.
 */

export interface StaffRowDto extends StaffDayDto {
  name: string;
  position: string;
  avatarPath: string | null;
}

export interface OverviewDto {
  date: string;
  serverTime: string;
  counts: {
    expected: number;
    working: number;
    onBreak: number;
    onTime: number;
    late: number;
    notArrived: number;
    absent: number;
    excused: number;
    checkedOut: number;
    review: number;
  };
  rows: StaffRowDto[];
  /** Oxirgi 31 kunda chiqishi belgilanmay qolgan kunlar */
  reviewQueue: Array<{ userId: string; name: string; date: string; checkInAt: string | null }>;
}

const REVIEW_LOOKBACK_DAYS = 31;

async function scopedSubjects(actor: AuthUser): Promise<StaffSubject[]> {
  const scope = await branchScopeOf(actor);
  return loadSubjects(scope.branchId);
}

async function scopedSubject(actor: AuthUser, userId: string): Promise<StaffSubject> {
  const scope = await branchScopeOf(actor);
  const subject = await findSubject(userId);
  if (!subject || (scope.branchId && subject.branchId !== scope.branchId)) throw AppError.notFound('Xodim topilmadi');
  return subject;
}

async function rowsFor(userIds: string[], from: string, to: string) {
  const rows = await prisma.staffAttendanceDay.findMany({
    where: { userId: { in: userIds }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
    select: daySelect,
  });
  return new Map(rows.map((row) => [`${row.userId}:${toDateString(row.date)}`, row]));
}

function eventView(event: { type: StaffAttendanceEventType; occurredAt: Date; source: string; id: string }) {
  return { id: event.id, type: event.type, time: clockTime(event.occurredAt), occurredAt: event.occurredAt.toISOString(), source: event.source };
}

export interface ScheduleInput {
  mode: StaffScheduleMode;
  workDays: WeekDay[];
  startTime?: string | undefined;
  endTime?: string | undefined;
  breakMinutes: number;
  graceMinutes: number;
  absentAfterMinutes: number;
  lessonLeadMinutes: number;
  effectiveFrom?: string | undefined;
  note?: string | undefined;
}

export type CorrectionInput =
  | { action: 'ADD'; type: StaffAttendanceEventType; time: string; reason: string }
  | { action: 'VOID'; eventId: string; reason: string }
  | { action: 'REPLACE'; eventId: string; time: string; reason: string };

export const staffAttendanceAdminService = {
  async overview(actor: AuthUser, date: string | undefined, now: Date = new Date()): Promise<OverviewDto> {
    const today = businessDateString(now);
    const day = date ?? today;
    const subjects = await scopedSubjects(actor);
    const ids = subjects.map((subject) => subject.id);
    const reviewFrom = businessDateString(new Date(now.getTime() - REVIEW_LOOKBACK_DAYS * 86_400_000));
    const [planner, rows, openDays] = await Promise.all([
      loadPlanner(subjects, day, day),
      rowsFor(ids, day, day),
      prisma.staffAttendanceDay.findMany({
        where: {
          userId: { in: ids },
          phase: { in: ['WORKING', 'ON_BREAK'] },
          date: { lt: new Date(`${today}T00:00:00Z`), gte: new Date(`${reviewFrom}T00:00:00Z`) },
        },
        select: { userId: true, date: true, checkInAt: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    const result: StaffRowDto[] = subjects.map((subject) => ({
      ...evaluateRow({
        userId: subject.id,
        date: day,
        today,
        now,
        plan: planner.plan(subject.id, day),
        excuse: planner.excuse(subject.id, day),
        row: rows.get(`${subject.id}:${day}`) ?? null,
      }),
      name: fullName(subject),
      position: subject.position,
      avatarPath: subject.avatarPath,
    }));

    const count = (predicate: (row: StaffRowDto) => boolean) => result.filter(predicate).length;
    const names = new Map(subjects.map((subject) => [subject.id, fullName(subject)]));
    return {
      date: day,
      serverTime: now.toISOString(),
      counts: {
        expected: count((row) => row.expected),
        working: count((row) => row.status === 'WORKING'),
        onBreak: count((row) => row.status === 'ON_BREAK'),
        onTime: count((row) => row.arrival === 'PRESENT' && row.expected),
        late: count((row) => row.arrival === 'LATE'),
        notArrived: count((row) => row.status === 'NOT_YET' || row.status === 'ABSENT'),
        absent: count((row) => row.status === 'ABSENT'),
        excused: count((row) => row.status === 'EXCUSED'),
        checkedOut: count((row) => row.phase === 'CHECKED_OUT'),
        review: openDays.length + count((row) => row.status === 'PENDING_REVIEW'),
      },
      rows: result,
      reviewQueue: openDays.map((open) => ({
        userId: open.userId,
        name: names.get(open.userId) ?? '',
        date: toDateString(open.date),
        checkInAt: open.checkInAt?.toISOString() ?? null,
      })),
    };
  },

  async dayDetail(actor: AuthUser, userId: string, date: string, now: Date = new Date()) {
    const subject = await scopedSubject(actor, userId);
    const today = businessDateString(now);
    const [planner, rows, requests] = await Promise.all([
      loadPlanner([subject], date, date),
      rowsFor([subject.id], date, date),
      staffPermissionService.list(actor, { userId: subject.id }),
    ]);
    const row = rows.get(`${subject.id}:${date}`) ?? null;
    const [events, corrections] = row
      ? await Promise.all([
          prisma.staffAttendanceEvent.findMany({
            where: { dayId: row.id },
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              type: true,
              occurredAt: true,
              source: true,
              voidedAt: true,
              ip: true,
              createdAt: true,
              qrToken: { select: { issuedById: true } },
            },
          }),
          prisma.staffAttendanceCorrection.findMany({
            where: { dayId: row.id },
            orderBy: { createdAt: 'desc' },
            select: { id: true, reason: true, before: true, after: true, createdAt: true, createdBy: { select: { firstName: true, lastName: true } } },
          }),
        ])
      : [[], []];

    return {
      subject: { id: subject.id, name: fullName(subject), position: subject.position },
      day: evaluateRow({ userId: subject.id, date, today, now, plan: planner.plan(subject.id, date), excuse: planner.excuse(subject.id, date), row }),
      schedule: planner.schedule(subject.id, date),
      events: events.map((event) => ({
        ...eventView(event),
        voided: event.voidedAt !== null,
        recordedAt: event.createdAt.toISOString(),
        ip: event.ip,
        /** QR'ni xodimning o'zi ochgan ekrandan skanerlagan — tekshirib qo'yish kerak */
        fromOwnDisplay: event.qrToken?.issuedById === subject.id,
      })),
      corrections: corrections.map((correction) => ({
        id: correction.id,
        reason: correction.reason,
        before: correction.before,
        after: correction.after,
        createdAt: correction.createdAt.toISOString(),
        createdBy: correction.createdBy ? fullName(correction.createdBy) : null,
      })),
      requests: requests.filter((request: PermissionRequestDto) => request.startDate <= date && request.endDate >= date),
    };
  },

  async report(actor: AuthUser, from: string, to: string, now: Date = new Date()): Promise<{ from: string; to: string; rows: Array<{ userId: string; name: string; position: string; summary: StaffSummary }>; total: StaffSummary }> {
    const today = businessDateString(now);
    const end = to < today ? to : today;
    const subjects = await scopedSubjects(actor);
    if (from > end) {
      const empty = summarize([]);
      return { from, to, rows: subjects.map((subject) => ({ userId: subject.id, name: fullName(subject), position: subject.position, summary: empty })), total: empty };
    }
    const [planner, rows] = await Promise.all([loadPlanner(subjects, from, end), rowsFor(subjects.map((subject) => subject.id), from, end)]);
    const dates = eachDate(from, end);
    const all: StaffDayDto[] = [];
    const result = subjects.map((subject) => {
      const days = dates.map((date) =>
        evaluateRow({
          userId: subject.id,
          date,
          today,
          now,
          plan: planner.plan(subject.id, date),
          excuse: planner.excuse(subject.id, date),
          row: rows.get(`${subject.id}:${date}`) ?? null,
        }),
      );
      all.push(...days);
      return { userId: subject.id, name: fullName(subject), position: subject.position, summary: summarize(days) };
    });
    return { from, to, rows: result, total: summarize(all) };
  },

  async exportReport(actor: AuthUser, from: string, to: string, now: Date = new Date()): Promise<ExportTable> {
    const report = await this.report(actor, from, to, now);
    const hours = (value: number) => Math.round((value / 3600) * 10) / 10;
    return {
      title: `Xodimlar davomati: ${from} — ${to}`,
      subtitle: exportSubtitle(report.rows.length, report.rows.length, now),
      columns: [
        { key: 'name', label: 'Xodim', type: 'text' },
        { key: 'position', label: 'Lavozim', type: 'text' },
        { key: 'expectedDays', label: 'Ish kunlari', type: 'number' },
        { key: 'attendedDays', label: 'Kelgan', type: 'number' },
        { key: 'lateDays', label: 'Kechikkan kunlar', type: 'number' },
        { key: 'lateMinutes', label: 'Kechikish, daqiqa', type: 'number' },
        { key: 'earlyMinutes', label: 'Erta ketish, daqiqa', type: 'number' },
        { key: 'absentDays', label: 'Kelmagan', type: 'number' },
        { key: 'excusedDays', label: 'Sababli', type: 'number' },
        { key: 'reviewDays', label: 'Tekshiruv kerak', type: 'number' },
        { key: 'scheduledHours', label: 'Rejadagi vaqt, soat', type: 'number' },
        { key: 'workedHours', label: 'Ishlagan vaqt, soat', type: 'number' },
        { key: 'breakHours', label: 'Tanaffus, soat', type: 'number' },
        { key: 'attendancePercent', label: 'Davomat, %', type: 'percent' },
      ],
      rows: report.rows.map((row) => ({
        name: row.name,
        position: row.position,
        expectedDays: row.summary.expectedDays,
        attendedDays: row.summary.attendedDays,
        lateDays: row.summary.lateDays,
        lateMinutes: row.summary.lateMinutes,
        earlyMinutes: row.summary.earlyMinutes,
        absentDays: row.summary.absentDays,
        excusedDays: row.summary.excusedDays,
        reviewDays: row.summary.reviewDays,
        scheduledHours: hours(row.summary.scheduledSeconds),
        workedHours: hours(row.summary.workedSeconds),
        breakHours: hours(row.summary.breakSeconds),
        attendancePercent: row.summary.attendancePercent,
      })),
      totals: null,
    };
  },

  // ---------------------------------------------------------------- Jadvallar
  async schedules(actor: AuthUser, now: Date = new Date()) {
    const today = businessDateString(now);
    const subjects = await scopedSubjects(actor);
    const planner = await loadPlanner(subjects, today, today);
    const upcoming = await prisma.staffWorkSchedule.findMany({
      where: { userId: { in: subjects.map((subject) => subject.id) }, effectiveFrom: { gt: new Date(`${today}T00:00:00Z`) } },
      orderBy: { effectiveFrom: 'asc' },
      select: { userId: true, effectiveFrom: true },
    });
    return subjects.map((subject) => ({
      userId: subject.id,
      name: fullName(subject),
      position: subject.position,
      kind: subject.kind,
      schedule: planner.schedule(subject.id, today),
      nextChange: upcoming.find((item) => item.userId === subject.id) ? toDateString(upcoming.find((item) => item.userId === subject.id)!.effectiveFrom) : null,
    }));
  },

  async saveSchedule(actor: AuthUser, userId: string, input: ScheduleInput, client: ClientInfo, now: Date = new Date()) {
    const subject = await scopedSubject(actor, userId);
    if (input.mode === 'FIXED') {
      if (!input.startTime || !input.endTime) throw AppError.unprocessable('Ish boshlanishi va tugashini kiriting', [{ field: 'startTime', message: 'Vaqtni kiriting' }]);
      if (parseTime(input.endTime) <= parseTime(input.startTime)) {
        throw AppError.unprocessable('Ish tugashi boshlanishidan keyin bo‘lsin', [{ field: 'endTime', message: 'Vaqt noto‘g‘ri' }]);
      }
      if (input.workDays.length === 0) throw AppError.unprocessable('Kamida bitta ish kunini tanlang', [{ field: 'workDays', message: 'Ish kunini tanlang' }]);
    }
    const effectiveFrom = input.effectiveFrom ?? businessDateString(now);
    const effectiveDate = new Date(`${effectiveFrom}T00:00:00Z`);
    const data = {
      mode: input.mode,
      workDays: input.mode === 'FIXED' ? input.workDays : [],
      startTime: input.mode === 'FIXED' ? (input.startTime ?? null) : null,
      endTime: input.mode === 'FIXED' ? (input.endTime ?? null) : null,
      breakMinutes: input.breakMinutes,
      graceMinutes: input.graceMinutes,
      absentAfterMinutes: input.absentAfterMinutes,
      lessonLeadMinutes: input.lessonLeadMinutes,
      note: input.note ?? null,
    };
    return prisma.$transaction(async (tx) => {
      const before = await tx.staffWorkSchedule.findFirst({ where: { userId: subject.id, effectiveFrom: { lte: effectiveDate } }, orderBy: { effectiveFrom: 'desc' } });
      const saved = await tx.staffWorkSchedule.upsert({
        where: { userId_effectiveFrom: { userId: subject.id, effectiveFrom: effectiveDate } },
        create: { userId: subject.id, effectiveFrom: effectiveDate, createdById: actor.id, ...data },
        update: data,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'staff_schedule.saved',
        entityType: 'staffWorkSchedule',
        entityId: saved.id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { userId: subject.id, effectiveFrom },
        before: before ? { mode: before.mode, workDays: before.workDays, startTime: before.startTime, endTime: before.endTime, effectiveFrom: toDateString(before.effectiveFrom) } : {},
        after: { ...data, effectiveFrom },
      });
      return { id: saved.id, effectiveFrom };
    });
  },

  async holidays(year: number) {
    const records = await prisma.staffHoliday.findMany({
      where: { date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) } },
      orderBy: { date: 'asc' },
    });
    return records.map((record) => ({ id: record.id, date: toDateString(record.date), name: record.name }));
  },

  async addHoliday(actor: AuthUser, input: { date: string; name: string }, client: ClientInfo) {
    const date = new Date(`${input.date}T00:00:00Z`);
    if (await prisma.staffHoliday.findUnique({ where: { date } })) throw AppError.conflict('Bu sana allaqachon dam olish kuni', [{ field: 'date', message: 'Takroriy sana' }]);
    const record = await prisma.staffHoliday.create({ data: { date, name: input.name, createdById: actor.id } });
    await auditService.record({ userId: actor.id, action: 'staff_holiday.created', entityType: 'staffHoliday', entityId: record.id, ...client, metadata: input });
    return { id: record.id, date: input.date, name: record.name };
  },

  async removeHoliday(actor: AuthUser, id: string, client: ClientInfo) {
    const record = await prisma.staffHoliday.findUnique({ where: { id } });
    if (!record) throw AppError.notFound('Dam olish kuni topilmadi');
    await prisma.staffHoliday.delete({ where: { id } });
    await auditService.record({
      userId: actor.id,
      action: 'staff_holiday.removed',
      entityType: 'staffHoliday',
      entityId: id,
      ...client,
      before: { date: toDateString(record.date), name: record.name },
    });
  },

  async exceptions(actor: AuthUser, from: string, to: string) {
    const subjects = await scopedSubjects(actor);
    const names = new Map(subjects.map((subject) => [subject.id, fullName(subject)]));
    const records = await prisma.staffScheduleException.findMany({
      where: { userId: { in: [...names.keys()] }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { date: 'asc' },
    });
    return records.map((record) => ({
      id: record.id,
      userId: record.userId,
      name: names.get(record.userId) ?? '',
      date: toDateString(record.date),
      type: record.type,
      startTime: record.startTime,
      endTime: record.endTime,
      reason: record.reason,
    }));
  },

  async saveException(
    actor: AuthUser,
    userId: string,
    input: { date: string; type: StaffScheduleExceptionType; startTime?: string | undefined; endTime?: string | undefined; reason: string },
    client: ClientInfo,
  ) {
    const subject = await scopedSubject(actor, userId);
    if (input.type === 'CUSTOM_HOURS') {
      if (!input.startTime || !input.endTime || parseTime(input.endTime) <= parseTime(input.startTime)) {
        throw AppError.unprocessable('Ish boshlanishi va tugashini to‘g‘ri kiriting', [{ field: 'endTime', message: 'Vaqt noto‘g‘ri' }]);
      }
    }
    const date = new Date(`${input.date}T00:00:00Z`);
    const data = {
      type: input.type,
      startTime: input.type === 'CUSTOM_HOURS' ? (input.startTime ?? null) : null,
      endTime: input.type === 'CUSTOM_HOURS' ? (input.endTime ?? null) : null,
      reason: input.reason,
    };
    const record = await prisma.staffScheduleException.upsert({
      where: { userId_date: { userId: subject.id, date } },
      create: { userId: subject.id, date, createdById: actor.id, ...data },
      update: data,
    });
    await auditService.record({ userId: actor.id, action: 'staff_schedule.exception_saved', entityType: 'staffScheduleException', entityId: record.id, ...client, metadata: { userId: subject.id, ...input } });
    return { id: record.id };
  },

  async removeException(actor: AuthUser, id: string, client: ClientInfo) {
    const record = await prisma.staffScheduleException.findUnique({ where: { id } });
    if (!record) throw AppError.notFound('Istisno topilmadi');
    await scopedSubject(actor, record.userId);
    await prisma.staffScheduleException.delete({ where: { id } });
    await auditService.record({
      userId: actor.id,
      action: 'staff_schedule.exception_removed',
      entityType: 'staffScheduleException',
      entityId: id,
      ...client,
      before: { userId: record.userId, date: toDateString(record.date), type: record.type, reason: record.reason },
    });
  },

  // ---------------------------------------------------------------- Tuzatish
  async correct(actor: AuthUser, userId: string, date: string, input: CorrectionInput, client: ClientInfo, now: Date = new Date()) {
    const subject = await scopedSubject(actor, userId);
    if (subject.id === actor.id) throw AppError.forbidden('O‘z davomatingizni o‘zingiz tuzata olmaysiz');
    const today = businessDateString(now);
    if (date > today) throw AppError.unprocessable('Kelajakdagi kunni tuzatib bo‘lmaydi', [{ field: 'date', message: 'Sana noto‘g‘ri' }]);
    const at = 'time' in input ? atBusinessTime(date, input.time) : null;
    if (at && at > now) throw AppError.unprocessable('Kelajakdagi vaqtni kiritib bo‘lmaydi', [{ field: 'time', message: 'Vaqt noto‘g‘ri' }]);

    await prisma.$transaction(async (tx) => {
      const day = await lockDay(tx, subject, date);
      const snapshot = async () =>
        (
          await tx.staffAttendanceEvent.findMany({
            where: { dayId: day.id, voidedAt: null },
            orderBy: { occurredAt: 'asc' },
            select: { id: true, type: true, occurredAt: true, source: true },
          })
        ).map((event) => ({ id: event.id, type: event.type, label: ACTION_LABELS[event.type], time: clockTime(event.occurredAt), source: event.source }));
      const before = await snapshot();

      const correction = await tx.staffAttendanceCorrection.create({
        data: { dayId: day.id, createdById: actor.id, reason: input.reason, before: before as unknown as Prisma.InputJsonValue, after: [] },
      });

      let type: StaffAttendanceEventType | null = input.action === 'ADD' ? input.type : null;
      if (input.action !== 'ADD') {
        const target = await tx.staffAttendanceEvent.findFirst({ where: { id: input.eventId, dayId: day.id, voidedAt: null } });
        if (!target) throw AppError.notFound('Hodisa topilmadi yoki allaqachon bekor qilingan');
        await tx.staffAttendanceEvent.update({
          where: { id: target.id },
          data: { voidedAt: now, voidedById: actor.id, voidedByCorrectionId: correction.id },
        });
        type = input.action === 'REPLACE' ? target.type : null;
      }
      if (type && at) {
        await tx.staffAttendanceEvent.create({
          data: { dayId: day.id, userId: subject.id, type, occurredAt: at, source: 'CORRECTION', correctionId: correction.id, ip: client.ip, userAgent: client.userAgent },
        });
      }
      await recomputeDay(tx, day.id);
      const after = await snapshot();
      await tx.staffAttendanceCorrection.update({ where: { id: correction.id }, data: { after: after as unknown as Prisma.InputJsonValue } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'staff_attendance.corrected',
        entityType: 'staffAttendanceDay',
        entityId: day.id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { userId: subject.id, date, action: input.action, reason: input.reason, correctionId: correction.id },
        before: before as unknown as Prisma.InputJsonValue,
        after: after as unknown as Prisma.InputJsonValue,
      });
    });
    return this.dayDetail(actor, subject.id, date, now);
  },
};
