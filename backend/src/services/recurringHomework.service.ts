import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import type { Prisma, RecurringHomeworkFrequency, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessDateString } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { scheduleIssues, type CreateRecurringHomeworkInput, type ScheduleShape, type UpdateRecurringHomeworkInput } from '../validators/recurringHomework.validator.js';
import { auditService } from './audit.service.js';
import { createHomeworkInTransaction } from './homework.service.js';
import { assertGroupVisible, getTeachingAccess } from './teachingAccess.js';

/**
 * Takrorlanuvchi uy vazifasi (TZ 3.1 GAP-18).
 *
 * ```
 * RecurringHomework (jadval) ──► generate(now) (job, har 15 daqiqa) ──► Homework (oddiy vazifa)
 *                                                                      ├─ guruhdagi o'quvchilar topshiriqlari
 *                                                                      └─ bildirishnoma (o'quvchi, ota-ona, Telegram)
 * ```
 *
 * Yaratish oddiy vazifa bilan **bitta funksiya** orqali (`createHomeworkInTransaction`). Dublikatdan himoya —
 * baza darajasida: `homework (recurringHomeworkId, occurrenceDate)` unikal; parallel job yoki qayta yurish P2002
 * oladi va o'tkazib yuboradi. Faqat **bugungi** (biznes sanasi) takrorlanish yaratiladi — server o'chiq bo'lgan
 * kunlar orqaga to'ldirilmaydi (muddati o'tgan vazifa berib bo'lmaydi).
 */

const OFFSET_MS = env.APP_UTC_OFFSET_MINUTES * 60_000;
const DAY_NAMES: readonly WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const recurringSelect = {
  id: true,
  title: true,
  description: true,
  maxPoints: true,
  xpReward: true,
  frequency: true,
  weekdays: true,
  startDate: true,
  endDate: true,
  publishTime: true,
  deadlineTime: true,
  deadlineOffsetDays: true,
  isActive: true,
  createdAt: true,
  group: { select: { id: true, name: true, teacherId: true, status: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  _count: { select: { homework: true } },
} satisfies Prisma.RecurringHomeworkSelect;

type RecurringRecord = Prisma.RecurringHomeworkGetPayload<{ select: typeof recurringSelect }>;

export interface RecurringHomeworkDto {
  id: string;
  group: { id: string; name: string };
  title: string;
  description: string | null;
  maxPoints: number;
  xpReward: number;
  frequency: RecurringHomeworkFrequency;
  weekdays: WeekDay[];
  startDate: string;
  endDate: string | null;
  publishTime: string;
  deadlineTime: string;
  deadlineOffsetDays: number;
  isActive: boolean;
  /** Shu jadvaldan yaratilgan vazifalar soni */
  generated: number;
  /** Keyingi e'lon sanasi (14 kun ichida) — tugagan yoki to'xtatilgan bo'lsa null */
  nextOccurrence: string | null;
  createdAt: string;
  createdBy: string | null;
}

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const dateColumnOf = (value: string) => new Date(`${value}T00:00:00Z`);

function weekdayOf(dateString: string): WeekDay {
  return DAY_NAMES[new Date(`${dateString}T00:00:00Z`).getUTCDay()]!;
}

/** Shu sanada jadval ishlaydimi (chastota va hafta kuni bo'yicha) */
export function occursOn(schedule: { frequency: RecurringHomeworkFrequency; weekdays: WeekDay[]; startDate: string; endDate: string | null }, dateString: string): boolean {
  if (dateString < schedule.startDate) return false;
  if (schedule.endDate && dateString > schedule.endDate) return false;
  if (schedule.frequency === 'DAILY') return true;
  return schedule.weekdays.includes(weekdayOf(dateString));
}

/** "2026-09-28" + "23:59" (+ n kun) → UTC vaqt (o'quv markaz vaqti bo'yicha) */
export function businessMoment(dateString: string, time: string, plusDays = 0): Date {
  const [year, month, day] = dateString.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, day + plusDays, hours, minutes) - OFFSET_MS);
}

function addDaysToString(dateString: string, days: number): string {
  return new Date(Date.parse(`${dateString}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function nextOccurrence(record: RecurringRecord, now: Date, generatedToday: boolean): string | null {
  if (!record.isActive) return null;
  const today = businessDateString(now);
  const shape = { frequency: record.frequency, weekdays: record.weekdays, startDate: dateOnly(record.startDate), endDate: record.endDate ? dateOnly(record.endDate) : null };
  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = addDaysToString(today, offset);
    if (offset === 0 && generatedToday) continue;
    if (occursOn(shape, candidate)) return candidate;
  }
  return null;
}

async function toDto(record: RecurringRecord, now = new Date()): Promise<RecurringHomeworkDto> {
  const today = businessDateString(now);
  const generatedToday = (await prisma.homework.count({ where: { recurringHomeworkId: record.id, occurrenceDate: dateColumnOf(today) } })) > 0;
  return {
    id: record.id,
    group: { id: record.group.id, name: record.group.name },
    title: record.title,
    description: record.description,
    maxPoints: record.maxPoints,
    xpReward: record.xpReward,
    frequency: record.frequency,
    weekdays: record.weekdays,
    startDate: dateOnly(record.startDate),
    endDate: record.endDate ? dateOnly(record.endDate) : null,
    publishTime: record.publishTime,
    deadlineTime: record.deadlineTime,
    deadlineOffsetDays: record.deadlineOffsetDays,
    isActive: record.isActive,
    generated: record._count.homework,
    nextOccurrence: nextOccurrence(record, now, generatedToday),
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy ? `${record.createdBy.firstName} ${record.createdBy.lastName}` : null,
  };
}

function assertSchedule(value: ScheduleShape): void {
  const issues = scheduleIssues(value);
  if (issues.length) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', issues.map((issue) => ({ field: issue.path, message: issue.message })));
}

/** O'qituvchi — faqat o'z guruhlari jadvallari (vazifalar bilan bir xil doira) */
async function findVisible(actor: AuthUser, id: string): Promise<RecurringRecord> {
  const access = await getTeachingAccess(actor);
  const record = await prisma.recurringHomework.findFirst({
    where: { id, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
    select: recurringSelect,
  });
  if (!record) throw AppError.notFound('Takrorlanuvchi vazifa topilmadi');
  return record;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export const recurringHomeworkService = {
  async list(actor: AuthUser, query: { groupId?: string | undefined }): Promise<RecurringHomeworkDto[]> {
    const access = await getTeachingAccess(actor);
    const rows = await prisma.recurringHomework.findMany({
      where: {
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}),
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: recurringSelect,
    });
    const now = new Date();
    return Promise.all(rows.map((row) => toDto(row, now)));
  },

  async create(actor: AuthUser, input: CreateRecurringHomeworkInput, client: ClientInfo): Promise<RecurringHomeworkDto> {
    const access = await getTeachingAccess(actor);
    const group = await assertGroupVisible(access, input.groupId);
    const weekdays = input.frequency === 'DAILY' ? [] : input.weekdays;
    assertSchedule({ ...input, weekdays });
    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.recurringHomework.create({
        data: {
          groupId: group.id,
          title: input.title,
          description: input.description ?? null,
          maxPoints: input.maxPoints,
          xpReward: input.xpReward,
          frequency: input.frequency,
          weekdays,
          startDate: dateColumnOf(input.startDate),
          endDate: input.endDate ? dateColumnOf(input.endDate) : null,
          publishTime: input.publishTime,
          deadlineTime: input.deadlineTime,
          deadlineOffsetDays: input.deadlineOffsetDays,
          createdById: actor.id,
        },
        select: recurringSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.recurring_created',
        entityType: 'group',
        entityId: group.id,
        metadata: { recurringHomeworkId: record.id, title: input.title, frequency: input.frequency, weekdays, startDate: input.startDate, endDate: input.endDate },
        ...client,
      });
      return record;
    });
    // Bugun ham takrorlanish kuni va e'lon vaqti o'tgan bo'lsa — kutmasdan beriladi (o'sha generator, o'sha himoya)
    await this.generate(new Date(), { scheduleId: created.id });
    return toDto((await prisma.recurringHomework.findUniqueOrThrow({ where: { id: created.id }, select: recurringSelect })));
  },

  /** Tahrir keyingi takrorlanishlarga ta'sir qiladi; yaratilgan vazifalar o'zgarmaydi */
  async update(actor: AuthUser, id: string, input: UpdateRecurringHomeworkInput, client: ClientInfo): Promise<RecurringHomeworkDto> {
    const current = await findVisible(actor, id);
    const merged: ScheduleShape = {
      frequency: input.frequency ?? current.frequency,
      weekdays: input.weekdays ?? current.weekdays,
      startDate: input.startDate ?? dateOnly(current.startDate),
      endDate: input.endDate === undefined ? (current.endDate ? dateOnly(current.endDate) : null) : input.endDate,
      publishTime: input.publishTime ?? current.publishTime,
      deadlineTime: input.deadlineTime ?? current.deadlineTime,
      deadlineOffsetDays: input.deadlineOffsetDays ?? current.deadlineOffsetDays,
    };
    if (merged.frequency === 'DAILY') merged.weekdays = [];
    assertSchedule(merged);
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.recurringHomework.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.maxPoints !== undefined ? { maxPoints: input.maxPoints } : {}),
          ...(input.xpReward !== undefined ? { xpReward: input.xpReward } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          frequency: merged.frequency,
          weekdays: merged.weekdays,
          startDate: dateColumnOf(merged.startDate),
          endDate: merged.endDate ? dateColumnOf(merged.endDate) : null,
          publishTime: merged.publishTime,
          deadlineTime: merged.deadlineTime,
          deadlineOffsetDays: merged.deadlineOffsetDays,
        },
        select: recurringSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.recurring_updated',
        entityType: 'group',
        entityId: record.group.id,
        metadata: { recurringHomeworkId: id, changes: Object.keys(input) },
        ...client,
      });
      return record;
    });
    return toDto(updated);
  },

  /** Jadvalni o'chiradi; yaratilgan vazifalar qoladi (bog'lanish uziladi) */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const record = await findVisible(actor, id);
    await prisma.$transaction(async (tx) => {
      await tx.recurringHomework.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.recurring_deleted',
        entityType: 'group',
        entityId: record.group.id,
        metadata: { recurringHomeworkId: id, title: record.title, generated: record._count.homework },
        ...client,
      });
    });
  },

  /**
   * Bugungi takrorlanishlarni yaratadi (job). Qayta yurish xavfsiz: yaratilgani o'tkazib yuboriladi (tekshiruv +
   * unikal indeks). Guruh faol emas, e'lon vaqti kelmagan yoki muddati allaqachon o'tgan bo'lsa — yaratilmaydi.
   */
  async generate(now: Date = new Date(), options: { scheduleId?: string } = {}): Promise<{ created: number; skipped: number }> {
    const today = businessDateString(now);
    const todayColumn = dateColumnOf(today);
    const local = new Date(now.getTime() + OFFSET_MS);
    const nowTime = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    const schedules = await prisma.recurringHomework.findMany({
      where: {
        ...(options.scheduleId ? { id: options.scheduleId } : {}),
        isActive: true,
        startDate: { lte: todayColumn },
        OR: [{ endDate: null }, { endDate: { gte: todayColumn } }],
        group: { status: 'ACTIVE' },
        homework: { none: { occurrenceDate: todayColumn } },
      },
      select: { ...recurringSelect, group: { select: { id: true, name: true, teacherId: true, status: true, courseId: true } }, createdById: true },
    });

    let created = 0;
    let skipped = 0;
    for (const schedule of schedules) {
      const shape = { frequency: schedule.frequency, weekdays: schedule.weekdays, startDate: dateOnly(schedule.startDate), endDate: schedule.endDate ? dateOnly(schedule.endDate) : null };
      if (!occursOn(shape, today) || schedule.publishTime > nowTime) continue;
      const deadline = businessMoment(today, schedule.deadlineTime, schedule.deadlineOffsetDays);
      if (deadline <= now) {
        skipped += 1;
        continue;
      }
      try {
        await prisma.$transaction((tx) =>
          createHomeworkInTransaction(tx, {
            group: { id: schedule.group.id, courseId: schedule.group.courseId, name: schedule.group.name },
            input: {
              title: schedule.title,
              description: schedule.description ?? undefined,
              deadline,
              maxPoints: schedule.maxPoints,
              xpReward: schedule.xpReward,
              status: 'PUBLISHED',
              targetType: 'GROUP',
            },
            targets: undefined,
            teacherId: schedule.group.teacherId ?? schedule.createdById,
            actorId: null,
            client: { ip: null, userAgent: 'recurring-homework-job' },
            recurring: { recurringHomeworkId: schedule.id, occurrenceDate: todayColumn },
          }),
        );
        created += 1;
      } catch (error) {
        // Parallel yurish allaqachon yaratgan — dublikat yo'q
        if (!isUniqueViolation(error)) throw error;
        skipped += 1;
      }
    }
    if (created > 0) logger.info({ created, skipped, date: today }, 'Takrorlanuvchi vazifalar yaratildi');
    return { created, skipped };
  },
};
