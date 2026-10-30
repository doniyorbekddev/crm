import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { Prisma, StaffAttendanceDay } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/AppError.js';
import { evaluateDay, EMPTY_FACTS, foldEvents } from '../../utils/staffAttendance.js';
import type { DayExcuse, DayPlan, StaffDayStatus, StaffArrival, StaffPhase } from '../../utils/staffAttendance.js';
import type { StaffSubject } from './planning.js';

const OFFSET_MS = env.APP_UTC_OFFSET_MINUTES * 60_000;

/** UTC vaqt → markaz vaqti bo'yicha "HH:mm" */
export function clockTime(value: Date): string {
  return new Date(value.getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

/** 29 520 → "8 soat 12 daqiqa" */
export function durationText(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} daqiqa`;
  return rest === 0 ? `${hours} soat` : `${hours} soat ${rest} daqiqa`;
}

export const toDateString = (value: Date) => value.toISOString().slice(0, 10);

export function notSubject(): AppError {
  return AppError.forbidden('Hisobingiz uchun xodim davomati yuritilmaydi. Administratorga murojaat qiling');
}

export const daySelect = {
  id: true,
  userId: true,
  date: true,
  phase: true,
  checkInAt: true,
  checkOutAt: true,
  breakSeconds: true,
  breakStartedAt: true,
  _count: { select: { corrections: true } },
} satisfies Prisma.StaffAttendanceDaySelect;

export type DayRow = Prisma.StaffAttendanceDayGetPayload<{ select: typeof daySelect }>;

export interface StaffDayDto {
  userId: string;
  date: string;
  dayId: string | null;
  status: StaffDayStatus;
  arrival: StaffArrival | null;
  expected: boolean;
  phase: StaffPhase | null;
  planKind: DayPlan['kind'];
  planSource: DayPlan['source'];
  planNote: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  lessons: DayPlan['lessons'];
  checkInAt: string | null;
  checkOutAt: string | null;
  breakStartedAt: string | null;
  breakSeconds: number;
  workedSeconds: number | null;
  scheduledSeconds: number;
  lateMinutes: number;
  earlyMinutes: number;
  excused: boolean;
  excuseLabel: string | null;
  reviewReason: string | null;
  corrected: boolean;
}

export function evaluateRow(input: {
  userId: string;
  date: string;
  today: string;
  now: Date;
  plan: DayPlan;
  excuse: DayExcuse;
  row: DayRow | null;
}): StaffDayDto {
  const { row, plan, excuse } = input;
  const facts = row
    ? { phase: row.phase, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt, breakSeconds: row.breakSeconds, breakStartedAt: row.breakStartedAt }
    : null;
  const result = evaluateDay({ date: input.date, today: input.today, now: input.now, plan, facts, excuse });
  return {
    userId: input.userId,
    date: input.date,
    dayId: row?.id ?? null,
    status: result.status,
    arrival: result.arrival,
    expected: result.expected,
    phase: row?.phase ?? null,
    planKind: plan.kind,
    planSource: plan.source,
    planNote: plan.note,
    scheduledStart: plan.kind === 'WORK' ? plan.startTime : null,
    scheduledEnd: plan.kind === 'WORK' ? plan.endTime : null,
    lessons: plan.lessons,
    checkInAt: row?.checkInAt?.toISOString() ?? null,
    checkOutAt: row?.checkOutAt?.toISOString() ?? null,
    breakStartedAt: row?.phase === 'ON_BREAK' ? (row.breakStartedAt?.toISOString() ?? null) : null,
    breakSeconds: result.breakSeconds,
    workedSeconds: result.workedSeconds,
    scheduledSeconds: result.scheduledSeconds,
    lateMinutes: result.lateMinutes,
    earlyMinutes: result.earlyMinutes,
    excused: result.excused,
    excuseLabel: excuse.label,
    reviewReason: result.reviewReason,
    corrected: (row?._count.corrections ?? 0) > 0,
  };
}

/**
 * Kun yozuvini amaldagi (bekor qilinmagan) hodisalardan qayta hisoblaydi. Ketma-ketlik buzilsa — 422,
 * tranzaksiya bekor bo'ladi (tuzatishda noto'g'ri vaqt kiritilganda).
 */
export async function recomputeDay(tx: Prisma.TransactionClient, dayId: string): Promise<StaffAttendanceDay> {
  const events = await tx.staffAttendanceEvent.findMany({
    where: { dayId, voidedAt: null },
    select: { type: true, occurredAt: true },
  });
  const { facts, error } = foldEvents(events);
  if (error) throw AppError.unprocessable(error, [{ field: 'time', message: error }]);
  const value = events.length === 0 ? EMPTY_FACTS : facts;
  return tx.staffAttendanceDay.update({
    where: { id: dayId },
    data: {
      phase: value.phase,
      checkInAt: value.checkInAt,
      checkOutAt: value.checkOutAt,
      breakSeconds: value.breakSeconds,
      breakStartedAt: value.breakStartedAt,
    },
  });
}

/**
 * Kun yozuvini topadi yoki yaratadi va **qatorni qulflaydi** (`FOR UPDATE`): bir xodimning bir vaqtda
 * kelgan ikki so'rovi navbat bilan bajariladi, ikkinchisi birinchisining natijasini ko'radi.
 */
export async function lockDay(tx: Prisma.TransactionClient, subject: Pick<StaffSubject, 'id' | 'branchId'>, date: string): Promise<StaffAttendanceDay> {
  const dateValue = new Date(`${date}T00:00:00Z`);
  await tx.staffAttendanceDay.createMany({
    data: [{ userId: subject.id, date: dateValue, branchId: subject.branchId }],
    skipDuplicates: true,
  });
  await tx.$queryRaw`SELECT "id" FROM "staff_attendance_days" WHERE "userId" = ${subject.id} AND "date" = ${dateValue}::date FOR UPDATE`;
  return tx.staffAttendanceDay.findUniqueOrThrow({ where: { userId_date: { userId: subject.id, date: dateValue } } });
}

/** Davomat bo'yicha xabar oladigan rahbarlar: `staff_attendance.manage` ruxsati bor, faol, shu filial (yoki barcha filial) */
export async function attendanceManagers(branchId: string, exceptUserId?: string): Promise<string[]> {
  const withPermission = (key: string) => ({ permissions: { some: { permission: { key } } } });
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      role: withPermission(PERMISSIONS.STAFF_ATTENDANCE_MANAGE),
      OR: [{ branchId }, { role: withPermission(PERMISSIONS.BRANCH_VIEW_ALL) }],
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export const fullName = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`.trim();
