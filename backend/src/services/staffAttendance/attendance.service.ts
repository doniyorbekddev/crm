import { prisma } from '../../config/database.js';
import type { StaffAttendanceEventType } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { businessDateString, businessMonthRange } from '../../utils/dates.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { availableActions, eachDate, evaluateDay, transitionError } from '../../utils/staffAttendance.js';
import type { StaffPhase } from '../../utils/staffAttendance.js';
import { generateOpaqueToken, hashToken } from '../../utils/tokens.js';
import { notificationService } from '../notification.service.js';
import type { NotificationInput } from '../notification.service.js';
import {
  attendanceManagers,
  clockTime,
  daySelect,
  durationText,
  evaluateRow,
  fullName,
  lockDay,
  notSubject,
  recomputeDay,
  toDateString,
} from './common.js';
import type { StaffDayDto } from './common.js';
import { findSubject, loadPlanner } from './planning.js';
import type { StaffSubject } from './planning.js';
import { summarize } from './summary.js';
import type { StaffSummary } from './summary.js';

/**
 * Xodim davomati — QR va skanerlash.
 *
 * QR xavfsizligi:
 *  - token — 32 bayt kriptografik tasodifiy qiymat; bazada faqat SHA-256 hash (token o'zi saqlanmaydi);
 *  - muddati qisqa (`QR_TTL_SECONDS`), **bir martalik**: ishlatilishi bilan ekran yangisini oladi;
 *  - QR ichida xodim ma'lumoti ham, sir ham yo'q — faqat token;
 *  - xodim **o'z hisobi** (sessiya) bilan aniqlanadi, frontend yuborgan ID'ga ishonilmaydi;
 *  - barcha vaqtlar serverda qo'yiladi.
 *
 * Cheklov: QR telefonning shu yerdaligini **isbotlamaydi** — skrinshotni boshqa joyga yuborish mumkin.
 * Qisqa muddat va bir martalik ishlatish xavfni kamaytiradi, lekin yo'q qilmaydi (docs/staff-attendance.md).
 */

export const QR_TTL_SECONDS = 60;
/** Ekran shuncha soniyada (yoki ishlatilishi bilan) yangi QR oladi */
export const QR_ROTATE_SECONDS = 30;

type QrProblem = 'INVALID' | 'EXPIRED' | 'USED' | 'WRONG_LOCATION';

const QR_ERRORS: Record<QrProblem, () => AppError> = {
  INVALID: () => AppError.unprocessable('QR kod tanilmadi. Qabulxonadagi ekrandagi QR kodni skanerlang', [{ field: 'qr', message: 'INVALID' }]),
  EXPIRED: () =>
    AppError.unprocessable('QR kod muddati tugagan. Ekrandagi yangi QR kodni skanerlang', [{ field: 'qr', message: 'EXPIRED' }]),
  USED: () => AppError.conflict('Bu QR kod allaqachon ishlatilgan. Ekrandagi yangi QR kodni skanerlang', [{ field: 'qr', message: 'USED' }]),
  WRONG_LOCATION: () => AppError.forbidden('Bu QR kod boshqa filialga tegishli'),
};

export const ACTION_LABELS: Record<StaffAttendanceEventType, string> = {
  CHECK_IN: 'Ishga keldim',
  BREAK_START: 'Tanaffusga chiqdim',
  BREAK_END: 'Tanaffusdan qaytdim',
  CHECK_OUT: 'Ishdan ketdim',
};

export interface QrIssueDto {
  id: string;
  token: string;
  expiresAt: string;
  ttlSeconds: number;
  rotateSeconds: number;
  serverTime: string;
}

export interface TodayDto {
  subject: { id: string; name: string; position: string };
  serverTime: string;
  day: StaffDayDto;
  actions: StaffAttendanceEventType[];
  events: Array<{ type: StaffAttendanceEventType; occurredAt: string; source: string }>;
  /** Oldingi kunda chiqish belgilanmay qolgan bo'lsa — sana */
  openPreviousDay: string | null;
}

export interface ScanPreviewDto {
  expiresAt: string;
  actions: StaffAttendanceEventType[];
  phase: StaffPhase | null;
}

export interface ScanResultDto {
  action: StaffAttendanceEventType;
  occurredAt: string;
  message: string;
  /** Xuddi shu QR bilan shu amal oldin bajarilgan (tugma ikki marta bosilgan) — yangi hodisa yozilmadi */
  replayed: boolean;
  today: TodayDto;
}

async function requireSubject(actor: AuthUser): Promise<StaffSubject> {
  const subject = await findSubject(actor.id);
  if (!subject) throw notSubject();
  return subject;
}

async function buildToday(subject: StaffSubject, now: Date): Promise<TodayDto> {
  const today = businessDateString(now);
  const dateValue = new Date(`${today}T00:00:00Z`);
  const [planner, row, open] = await Promise.all([
    loadPlanner([subject], today, today),
    prisma.staffAttendanceDay.findUnique({ where: { userId_date: { userId: subject.id, date: dateValue } }, select: daySelect }),
    prisma.staffAttendanceDay.findFirst({
      where: { userId: subject.id, date: { lt: dateValue }, phase: { in: ['WORKING', 'ON_BREAK'] } },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);
  const events = row
    ? await prisma.staffAttendanceEvent.findMany({
        where: { dayId: row.id, voidedAt: null },
        orderBy: { occurredAt: 'asc' },
        select: { type: true, occurredAt: true, source: true },
      })
    : [];
  return {
    subject: { id: subject.id, name: fullName(subject), position: subject.position },
    serverTime: now.toISOString(),
    day: evaluateRow({ userId: subject.id, date: today, today, now, plan: planner.plan(subject.id, today), excuse: planner.excuse(subject.id, today), row }),
    actions: availableActions(row?.phase ?? null),
    events: events.map((event) => ({ type: event.type, occurredAt: event.occurredAt.toISOString(), source: event.source })),
    openPreviousDay: open ? toDateString(open.date) : null,
  };
}

async function findToken(token: string) {
  return prisma.staffQrToken.findUnique({ where: { tokenHash: hashToken(token) } });
}

export const staffAttendanceService = {
  // ---------------------------------------------------------------- QR ekran
  async issueQr(actor: AuthUser, now: Date = new Date()): Promise<QrIssueDto> {
    const token = generateOpaqueToken();
    const record = await prisma.staffQrToken.create({
      data: {
        tokenHash: hashToken(token),
        branchId: actor.branchId,
        issuedById: actor.id,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + QR_TTL_SECONDS * 1000),
      },
      select: { id: true, expiresAt: true },
    });
    return {
      id: record.id,
      token,
      expiresAt: record.expiresAt.toISOString(),
      ttlSeconds: QR_TTL_SECONDS,
      rotateSeconds: QR_ROTATE_SECONDS,
      serverTime: now.toISOString(),
    };
  },

  /** Ekran o'z QR'i ishlatilganini bilib, darhol yangisini olishi uchun. Kim ishlatgani aytilmaydi. */
  async qrStatus(actor: AuthUser, id: string, now: Date = new Date()): Promise<{ used: boolean; expired: boolean }> {
    const record = await prisma.staffQrToken.findUnique({ where: { id }, select: { usedAt: true, expiresAt: true, issuedById: true } });
    if (!record || record.issuedById !== actor.id) throw AppError.notFound('QR kod topilmadi');
    return { used: record.usedAt !== null, expired: record.expiresAt <= now };
  },

  // ---------------------------------------------------------------- Xodim
  async today(actor: AuthUser, now: Date = new Date()): Promise<TodayDto> {
    return buildToday(await requireSubject(actor), now);
  },

  /** QR'ni sarflamasdan tekshiradi va qaysi amallar mumkinligini aytadi */
  async preview(actor: AuthUser, token: string, now: Date = new Date()): Promise<ScanPreviewDto> {
    const subject = await requireSubject(actor);
    const record = await findToken(token);
    if (!record) throw QR_ERRORS.INVALID();
    if (record.usedAt) throw QR_ERRORS.USED();
    if (record.expiresAt <= now) throw QR_ERRORS.EXPIRED();
    if (record.branchId !== subject.branchId) throw QR_ERRORS.WRONG_LOCATION();
    const row = await prisma.staffAttendanceDay.findUnique({
      where: { userId_date: { userId: subject.id, date: new Date(`${businessDateString(now)}T00:00:00Z`) } },
      select: { phase: true },
    });
    return { expiresAt: record.expiresAt.toISOString(), actions: availableActions(row?.phase ?? null), phase: row?.phase ?? null };
  },

  async scan(actor: AuthUser, token: string, action: StaffAttendanceEventType, client: ClientInfo, now: Date = new Date()): Promise<ScanResultDto> {
    const subject = await requireSubject(actor);
    const today = businessDateString(now);
    const tokenHash = hashToken(token);

    const outcome = await prisma.$transaction(async (tx) => {
      const record = await tx.staffQrToken.findUnique({ where: { tokenHash } });
      if (!record) throw QR_ERRORS.INVALID();
      if (record.usedAt) {
        // Idempotentlik: tugma ikki marta bosilgan yoki javob yetib bormay qayta yuborilgan
        const previous = await tx.staffAttendanceEvent.findUnique({ where: { qrTokenId: record.id }, select: { type: true, occurredAt: true, userId: true } });
        if (previous && previous.userId === subject.id && previous.type === action) {
          return { occurredAt: previous.occurredAt, replayed: true };
        }
        throw QR_ERRORS.USED();
      }
      if (record.expiresAt <= now) throw QR_ERRORS.EXPIRED();
      if (record.branchId !== subject.branchId) throw QR_ERRORS.WRONG_LOCATION();

      const day = await lockDay(tx, subject, today);
      const problem = transitionError(day.phase, action);
      if (problem) throw AppError.conflict(problem, [{ field: 'action', message: day.phase ?? 'NONE' }]);

      // Shartli yangilash — bir tokenni ikki xodim bir vaqtda ishlata olmaydi
      const consumed = await tx.staffQrToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now, usedById: subject.id },
      });
      if (consumed.count !== 1) throw QR_ERRORS.USED();

      await tx.staffAttendanceEvent.create({
        data: {
          dayId: day.id,
          userId: subject.id,
          type: action,
          occurredAt: now,
          source: 'QR',
          qrTokenId: record.id,
          ip: client.ip,
          userAgent: client.userAgent,
        },
      });
      const updated = await recomputeDay(tx, day.id);

      if (action === 'CHECK_IN' || action === 'CHECK_OUT') {
        const planner = await loadPlanner([subject], today, today);
        const plan = planner.plan(subject.id, today);
        const evaluation = evaluateDay({
          date: today,
          today,
          now,
          plan,
          excuse: planner.excuse(subject.id, today),
          facts: { phase: updated.phase, checkInAt: updated.checkInAt, checkOutAt: updated.checkOutAt, breakSeconds: updated.breakSeconds, breakStartedAt: updated.breakStartedAt },
        });
        const notifications: NotificationInput[] = [];
        if (action === 'CHECK_IN') {
          notifications.push({
            userId: subject.id,
            type: 'STAFF_ATTENDANCE',
            title: 'Ishga kelganingiz qayd etildi',
            message: `✅ ${clockTime(now)}${evaluation.lateMinutes > 0 ? ` — ${evaluation.lateMinutes} daqiqa kechikish (jadval: ${plan.startTime})` : ''}`,
            actionUrl: '/my-attendance',
            dedupeKey: `staff-in:${day.id}`,
          });
          if (evaluation.lateMinutes > 0 && !day.lateNotifiedAt) {
            const managers = await attendanceManagers(subject.branchId, subject.id);
            for (const managerId of managers) {
              notifications.push({
                userId: managerId,
                type: 'STAFF_ATTENDANCE',
                title: 'Xodim kechikdi',
                message: `⏰ ${fullName(subject)} (${subject.position}) ${evaluation.lateMinutes} daqiqa kechikdi: ${clockTime(now)}, jadval ${plan.startTime}`,
                actionUrl: '/staff-attendance',
                dedupeKey: `staff-late:${day.id}:${managerId}`,
              });
            }
            await tx.staffAttendanceDay.update({ where: { id: day.id }, data: { lateNotifiedAt: now } });
          }
        } else {
          notifications.push({
            userId: subject.id,
            type: 'STAFF_ATTENDANCE',
            title: 'Ishdan ketganingiz qayd etildi',
            message: `👋 ${clockTime(now)}. Bugungi ish vaqti: ${durationText(evaluation.workedSeconds ?? 0)}${evaluation.earlyMinutes > 0 ? ` (${evaluation.earlyMinutes} daqiqa erta)` : ''}`,
            actionUrl: '/my-attendance',
            dedupeKey: `staff-out:${day.id}`,
          });
        }
        await notificationService.createManyInTransaction(tx, notifications);
      }
      return { occurredAt: now, replayed: false };
    });

    const time = clockTime(outcome.occurredAt);
    const messages: Record<StaffAttendanceEventType, string> = {
      CHECK_IN: `Ishga kelganingiz qayd etildi — ${time}`,
      BREAK_START: `Tanaffus boshlandi — ${time}`,
      BREAK_END: `Tanaffusdan qaytdingiz — ${time}`,
      CHECK_OUT: `Ishdan ketganingiz qayd etildi — ${time}`,
    };
    return {
      action,
      occurredAt: outcome.occurredAt.toISOString(),
      message: messages[action],
      replayed: outcome.replayed,
      today: await buildToday(subject, now),
    };
  },

  /** Oy bo'yicha o'z davomati: har kun va jami */
  async myMonth(actor: AuthUser, year: number, month: number, now: Date = new Date()): Promise<{ days: StaffDayDto[]; summary: StaffSummary }> {
    const subject = await requireSubject(actor);
    return monthFor(subject, year, month, now);
  },
};

export async function monthFor(subject: StaffSubject, year: number, month: number, now: Date): Promise<{ days: StaffDayDto[]; summary: StaffSummary }> {
  const today = businessDateString(now);
  const { start, end } = businessMonthRange(year, month);
  const from = businessDateString(start);
  const lastDay = businessDateString(new Date(end.getTime() - 1));
  const to = lastDay < today ? lastDay : today;
  if (from > to) return { days: [], summary: summarize([]) };

  const [planner, rows] = await Promise.all([
    loadPlanner([subject], from, to),
    prisma.staffAttendanceDay.findMany({
      where: { userId: subject.id, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: daySelect,
    }),
  ]);
  const rowByDate = new Map(rows.map((row) => [toDateString(row.date), row]));
  const days = eachDate(from, to)
    .reverse()
    .map((date) =>
      evaluateRow({
        userId: subject.id,
        date,
        today,
        now,
        plan: planner.plan(subject.id, date),
        excuse: planner.excuse(subject.id, date),
        row: rowByDate.get(date) ?? null,
      }),
    );
  return { days, summary: summarize(days) };
}
