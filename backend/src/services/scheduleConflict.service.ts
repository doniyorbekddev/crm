import { prisma } from '../config/database.js';
import type { Prisma, WeekDay } from '../generated/prisma/client.js';
import { WEEK_DAY_LABELS } from '../config/scheduleLabels.js';

/**
 * Jadval konflikti: bitta xonaga ikki guruh, bitta o'qituvchiga bir vaqtda ikki dars.
 *
 * Konflikt shartlari (hammasi bir vaqtda bajarilishi kerak):
 *   1. bir xil hafta kuni;
 *   2. dars vaqtlari kesishadi (`start < otherEnd && otherStart < end`);
 *   3. guruhlarning amal qilish davri kesishadi (`startDate`…`endDate`);
 *   4. guruh yakunlanmagan yoki bekor qilinmagan (PLANNED yoki ACTIVE).
 *
 * Tekshiruv **saqlashdan oldin** bajariladi: konflikt topilsa foydalanuvchiga aniq
 * qaysi guruh bilan to'qnashgani ko'rsatiladi.
 */

export type ConflictKind = 'ROOM' | 'TEACHER';

export interface ScheduleConflict {
  kind: ConflictKind;
  groupId: string;
  groupName: string;
  /** Qaysi kunlarda to'qnashadi */
  days: WeekDay[];
  startTime: string;
  endTime: string;
  /** Foydalanuvchiga ko'rsatiladigan tayyor matn */
  message: string;
}

export interface ScheduleCandidate {
  /** Tahrirlanayotgan guruh — o'zini o'zi bilan solishtirmaslik uchun */
  groupId?: string | null;
  branchId: string;
  roomId?: string | null;
  teacherId?: string | null;
  scheduleDays: WeekDay[];
  /** "HH:mm" */
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate?: Date | null;
}

/** "14:30" → 870 daqiqa */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

/** Davrlar kesishadimi; `endDate` bo'sh bo'lsa — cheksiz davom etadi */
function periodsOverlap(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  if (aEnd && bStart > aEnd) return false;
  if (bEnd && aStart > bEnd) return false;
  return true;
}

function describe(kind: ConflictKind, name: string, days: WeekDay[], startTime: string, endTime: string): string {
  const dayNames = days.map((day) => WEEK_DAY_LABELS[day]).join(', ');
  const subject = kind === 'ROOM' ? 'Xona band' : 'O‘qituvchi band';
  return `${subject}: «${name}» guruhi ${dayNames} kunlari ${startTime}–${endTime} da dars qiladi`;
}

export const scheduleConflictService = {
  /**
   * Taklif qilingan jadval uchun konfliktlarni qaytaradi. Bo'sh massiv — konflikt yo'q.
   */
  async find(candidate: ScheduleCandidate): Promise<ScheduleConflict[]> {
    if (candidate.scheduleDays.length === 0) return [];
    if (!candidate.roomId && !candidate.teacherId) return [];

    const owners: Prisma.GroupWhereInput[] = [];
    if (candidate.roomId) owners.push({ roomId: candidate.roomId });
    if (candidate.teacherId) owners.push({ teacherId: candidate.teacherId });

    const others = await prisma.group.findMany({
      where: {
        branchId: candidate.branchId,
        status: { in: ['PLANNED', 'ACTIVE'] },
        ...(candidate.groupId ? { id: { not: candidate.groupId } } : {}),
        // Kamida bitta umumiy hafta kuni bo'lsa — qolganini JS'da aniq tekshiramiz
        scheduleDays: { hasSome: candidate.scheduleDays },
        OR: owners,
      },
      select: {
        id: true,
        name: true,
        roomId: true,
        teacherId: true,
        scheduleDays: true,
        startTime: true,
        endTime: true,
        startDate: true,
        endDate: true,
      },
    });

    const conflicts: ScheduleConflict[] = [];
    for (const other of others) {
      const days = other.scheduleDays.filter((day) => candidate.scheduleDays.includes(day));
      if (days.length === 0) continue;
      if (!timesOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime)) continue;
      if (!periodsOverlap(candidate.startDate, candidate.endDate ?? null, other.startDate, other.endDate)) continue;

      // Bitta guruh ham xona, ham o'qituvchi bo'yicha to'qnashishi mumkin — ikkalasi ham ko'rsatiladi
      if (candidate.roomId && other.roomId === candidate.roomId) {
        conflicts.push({
          kind: 'ROOM',
          groupId: other.id,
          groupName: other.name,
          days,
          startTime: other.startTime,
          endTime: other.endTime,
          message: describe('ROOM', other.name, days, other.startTime, other.endTime),
        });
      }
      if (candidate.teacherId && other.teacherId === candidate.teacherId) {
        conflicts.push({
          kind: 'TEACHER',
          groupId: other.id,
          groupName: other.name,
          days,
          startTime: other.startTime,
          endTime: other.endTime,
          message: describe('TEACHER', other.name, days, other.startTime, other.endTime),
        });
      }
    }

    return conflicts;
  },
};
