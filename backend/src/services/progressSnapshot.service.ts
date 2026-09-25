import { prisma } from '../config/database.js';
import { businessMonthRange } from '../utils/dates.js';

/**
 * Oylik progress snapshoti (`student_progress_snapshots`, TZ 3.0 §26): o'quvchi har oy qayerda
 * turgani — davomat, vazifa, imtihon, XP, qarz va mavzu o'zlashtirishi. Trend va AI tahlili
 * (PHASE 9) shu tarixga tayanadi: joriy qiymatlar o'zgarsa ham o'tgan oy saqlanib qoladi.
 *
 * Bir oy uchun qayta yozish xavfsiz (upsert). Joriy oy har kecha yangilanadi, o'tgan oy — bir
 * marta yakunlanadi (keyingi oyning birinchi yurishida).
 */

const pct = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

/** `@db.Date` ustunlar uchun oy chegarasi (UTC yarim tun) */
function dateColumnRange(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

async function writeBatch(studentIds: string[], year: number, month: number): Promise<void> {
  const dates = dateColumnRange(year, month);
  const moments = businessMonthRange(year, month);
  const [attendance, homework, exams, profiles, debts, mastery] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds }, date: { gte: dates.start, lt: dates.end } },
      _count: { _all: true },
    }),
    prisma.homeworkSubmission.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds }, homework: { status: { not: 'DRAFT' }, deadline: { gte: moments.start, lt: moments.end } } },
      _count: { _all: true },
    }),
    prisma.examResult.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, exam: { status: { not: 'CANCELLED' }, date: { gte: dates.start, lt: dates.end } } },
      _avg: { percentage: true },
    }),
    prisma.gamificationProfile.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, totalXp: true, levelNumber: true } }),
    prisma.debt.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, remainingAmount: true } }),
    prisma.topicMastery.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds }, score: { not: null } }, _avg: { score: true } }),
  ]);
  const masteredCounts = await prisma.topicMastery.groupBy({
    by: ['studentId'],
    where: { studentId: { in: studentIds }, status: 'MASTERED' },
    _count: { _all: true },
  });

  const count = (rows: Array<{ studentId: string; status: string; _count: { _all: number } }>, studentId: string, statuses?: string[]) =>
    rows.filter((row) => row.studentId === studentId && (!statuses || statuses.includes(row.status))).reduce((sum, row) => sum + row._count._all, 0);

  const profileBy = new Map(profiles.map((row) => [row.studentId, row]));
  const debtBy = new Map(debts.map((row) => [row.studentId, row.remainingAmount]));
  const examBy = new Map(exams.map((row) => [row.studentId, row._avg.percentage]));
  const masteryBy = new Map(mastery.map((row) => [row.studentId, row._avg.score]));
  const masteredBy = new Map(masteredCounts.map((row) => [row.studentId, row._count._all]));

  await prisma.$transaction(
    studentIds.map((studentId) => {
      const data = {
        attendanceRate: pct(count(attendance, studentId, ['PRESENT', 'LATE']), count(attendance, studentId, ['PRESENT', 'LATE', 'ABSENT'])),
        homeworkRate: pct(count(homework, studentId, ['SUBMITTED', 'LATE', 'GRADED']), count(homework, studentId)),
        averageScore: Math.round(examBy.get(studentId) ?? 0),
        totalXp: profileBy.get(studentId)?.totalXp ?? 0,
        levelNumber: profileBy.get(studentId)?.levelNumber ?? 1,
        debtRemaining: debtBy.get(studentId) ?? 0,
        masteryScore: masteryBy.has(studentId) && masteryBy.get(studentId) !== null ? Math.round(masteryBy.get(studentId)!) : null,
        topicsMastered: masteredBy.get(studentId) ?? 0,
      };
      return prisma.studentProgressSnapshot.upsert({
        where: { studentId_year_month: { studentId, year, month } },
        create: { studentId, year, month, ...data },
        update: data,
      });
    }),
  );
}

export const progressSnapshotService = {
  /** Faol (va muzlatilgan) o'quvchilar uchun oy snapshoti, bo'laklab */
  async writeMonth(year: number, month: number, batchSize = 300): Promise<number> {
    let cursor: string | undefined;
    let written = 0;
    for (;;) {
      const batch = await prisma.student.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true },
      });
      if (batch.length === 0) break;
      await writeBatch(
        batch.map((row) => row.id),
        year,
        month,
      );
      written += batch.length;
      cursor = batch.at(-1)!.id;
    }
    return written;
  },

  /** O'quvchining oylik tarixi (oxirgi `months` oy) — ruxsat chaqiruvchida */
  async history(studentId: string, months = 12) {
    const rows = await prisma.studentProgressSnapshot.findMany({
      where: { studentId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: months,
    });
    return rows.reverse().map((row) => ({
      month: `${row.year}-${String(row.month).padStart(2, '0')}`,
      attendanceRate: row.attendanceRate,
      homeworkRate: row.homeworkRate,
      averageScore: row.averageScore,
      masteryScore: row.masteryScore,
      topicsMastered: row.topicsMastered,
      totalXp: row.totalXp,
      levelNumber: row.levelNumber,
    }));
  },
};
