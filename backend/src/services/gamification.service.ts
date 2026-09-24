import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AttendanceStatus, BadgeRule, Prisma, XpSource } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  LeaderboardQuery,
  ManualXpInput,
  UpdateBadgeInput,
  UpdateLevelInput,
  UpdateXpRuleInput,
} from '../validators/gamification.validator.js';
import { auditService } from './audit.service.js';
import { notifyLevelUp } from './studentNotify.service.js';

/** Davomat holatiga mos XP qoidasi (qoida bazadan olinadi) */
const ATTENDANCE_RULE_BY_STATUS: Partial<Record<AttendanceStatus, string>> = {
  PRESENT: 'ATTENDANCE_PRESENT',
  LATE: 'ATTENDANCE_LATE',
};

/** Ketma-ketlikni uzmaydigan holatlar */
const STREAK_KEEPING: readonly AttendanceStatus[] = ['PRESENT', 'LATE', 'EXCUSED'];

export interface GamificationProfileDto {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  totalXp: number;
  level: { number: number; name: string; icon: string | null; minXp: number };
  nextLevel: { number: number; name: string; minXp: number; xpLeft: number } | null;
  /** Joriy daraja ichidagi progress (0–100) */
  progress: number;
  rank: number | null;
  streak: { current: number; longest: number; lastAttendanceDate: string | null };
  badges: Array<{ id: string; key: string; name: string; icon: string; description: string; awardedAt: string }>;
  recentXp: Array<{ id: string; points: number; source: XpSource; description: string; createdAt: string }>;
}

export interface LeaderboardRowDto {
  rank: number;
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  courseName: string;
  groupName: string | null;
  xp: number;
  totalXp: number;
  levelNumber: number;
  levelName: string;
  badges: number;
  streak: number;
}

export interface XpRuleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  source: XpSource;
  points: number;
  isActive: boolean;
}

export interface LevelDto {
  id: string;
  number: number;
  name: string;
  minXp: number;
  icon: string | null;
  color: string | null;
  students: number;
}

export interface BadgeDto {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  rule: BadgeRule;
  threshold: number | null;
  xpReward: number;
  isActive: boolean;
  awarded: number;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Ichki hisob-kitoblar (tranzaksiya ichida ishlaydi)
// ---------------------------------------------------------------------

/** XP yig‘indisiga mos darajani topadi */
async function resolveLevel(tx: Prisma.TransactionClient, totalXp: number): Promise<number> {
  const level = await tx.level.findFirst({
    where: { minXp: { lte: totalXp } },
    orderBy: { minXp: 'desc' },
    select: { number: true },
  });
  return level?.number ?? 1;
}

/** Profilni XP tranzaksiyalaridan qayta hisoblaydi */
async function recalculateProfile(tx: Prisma.TransactionClient, studentId: string): Promise<{ totalXp: number; levelNumber: number }> {
  const aggregate = await tx.xpTransaction.aggregate({ where: { studentId }, _sum: { points: true }, _max: { createdAt: true } });
  const totalXp = Math.max(0, aggregate._sum.points ?? 0);
  const levelNumber = await resolveLevel(tx, totalXp);

  await tx.gamificationProfile.upsert({
    where: { studentId },
    update: { totalXp, levelNumber, lastXpAt: aggregate._max.createdAt },
    create: { studentId, totalXp, levelNumber, lastXpAt: aggregate._max.createdAt },
  });

  return { totalXp, levelNumber };
}

interface AwardXpInput {
  studentId: string;
  points: number;
  source: XpSource;
  description: string;
  ruleKey?: string;
  entityType?: string;
  entityId?: string;
  /** Bir hodisa uchun XP faqat bir marta beriladi; qayta chaqirilsa eski yozuv almashtiriladi */
  dedupeKey?: string;
  awardedById?: string;
}

/**
 * XP yozuvini yaratadi (yoki `dedupeKey` bo‘yicha almashtiradi) va profilni yangilaydi.
 * Nol yoki manfiy ball berilsa, faqat eski yozuv o‘chiriladi.
 */
async function awardXp(tx: Prisma.TransactionClient, input: AwardXpInput): Promise<number> {
  if (input.dedupeKey) {
    await tx.xpTransaction.deleteMany({ where: { dedupeKey: input.dedupeKey } });
  }
  if (input.points > 0) {
    await tx.xpTransaction.create({
      data: {
        studentId: input.studentId,
        points: input.points,
        source: input.source,
        ruleKey: input.ruleKey ?? null,
        description: input.description,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        awardedById: input.awardedById ?? null,
      },
    });
  }
  // Daraja o'zgarganini shu yerda ushlaymiz: XP qayerdan kelmasin (davomat, vazifa, imtihon),
  // yangi darajaga chiqqan o'quvchi bir marta xabar oladi
  const before = await tx.gamificationProfile.findUnique({ where: { studentId: input.studentId }, select: { levelNumber: true } });
  const profile = await recalculateProfile(tx, input.studentId);
  if (profile.levelNumber > (before?.levelNumber ?? 1)) {
    await notifyLevelUp(tx, input.studentId, profile.levelNumber);
  }
  return profile.totalXp;
}

/** Qoidadagi ballni oladi (qoida o‘chirilgan bo‘lsa — 0) */
async function pointsForRule(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const rule = await tx.xpRule.findUnique({ where: { key }, select: { points: true, isActive: true } });
  return rule?.isActive ? rule.points : 0;
}

/**
 * Davomat tarixidan ketma-ketlikni qayta hisoblaydi.
 * Sababsiz qoldirilgan dars seriyani uzadi; kechikish va sababli qoldirish uzmaydi.
 */
async function recalculateStreak(tx: Prisma.TransactionClient, studentId: string): Promise<{ current: number; longest: number }> {
  const records = await tx.attendance.findMany({
    where: { studentId },
    select: { date: true, status: true },
    orderBy: { date: 'asc' },
  });

  let current = 0;
  let longest = 0;
  let lastKeptDate: Date | null = null;

  for (const record of records) {
    if (STREAK_KEEPING.includes(record.status)) {
      current += 1;
      longest = Math.max(longest, current);
      lastKeptDate = record.date;
    } else {
      current = 0;
    }
  }

  await tx.streak.upsert({
    where: { studentId },
    update: { current, longest, lastAttendanceDate: lastKeptDate },
    create: { studentId, current, longest, lastAttendanceDate: lastKeptDate },
  });

  return { current, longest };
}

/** Badge qoidasi bajarilganini tekshiradi */
async function badgeEarned(
  tx: Prisma.TransactionClient,
  studentId: string,
  badge: { rule: BadgeRule; threshold: number | null },
  context: { totalXp: number; streak: number },
): Promise<boolean> {
  const threshold = badge.threshold ?? 0;
  switch (badge.rule) {
    case 'STREAK_DAYS':
      return context.streak >= threshold;
    case 'XP_TOTAL':
      return context.totalXp >= threshold;
    case 'ATTENDANCE_RATE': {
      const grouped = await tx.attendance.groupBy({ by: ['status'], where: { studentId }, _count: { _all: true } });
      const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
      if (total < 5) return false;
      const attended = grouped
        .filter((row) => STREAK_KEEPING.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);
      return Math.round((attended / total) * 100) >= threshold;
    }
    case 'HOMEWORK_COUNT': {
      const count = await tx.homeworkSubmission.count({
        where: { studentId, status: { in: ['SUBMITTED', 'LATE', 'GRADED'] } },
      });
      return count >= threshold;
    }
    case 'EXAM_SCORE': {
      const best = await tx.examResult.aggregate({ where: { studentId }, _max: { percentage: true } });
      return (best._max.percentage ?? 0) >= threshold;
    }
    case 'COURSE_COMPLETED': {
      const student = await tx.student.findUnique({ where: { id: studentId }, select: { status: true } });
      return student?.status === 'COMPLETED' || student?.status === 'GRADUATED';
    }
    case 'MANUAL':
      return false;
  }
}

/** Avtomatik nishonlarni tekshirib beradi. Qaytaradi: yangi berilgan nishonlar kalitlari */
async function evaluateBadges(
  tx: Prisma.TransactionClient,
  studentId: string,
  context: { totalXp: number; streak: number },
): Promise<string[]> {
  const badges = await tx.badge.findMany({
    where: { isActive: true, rule: { not: 'MANUAL' } },
    select: { id: true, key: true, name: true, rule: true, threshold: true, xpReward: true },
  });
  const owned = new Set(
    (await tx.studentBadge.findMany({ where: { studentId }, select: { badgeId: true } })).map((row) => row.badgeId),
  );

  const awarded: string[] = [];
  for (const badge of badges) {
    if (owned.has(badge.id)) continue;
    if (!(await badgeEarned(tx, studentId, badge, context))) continue;

    const studentBadge = await tx.studentBadge.create({
      data: { studentId, badgeId: badge.id },
      select: { id: true },
    });
    awarded.push(badge.key);

    if (badge.xpReward > 0) {
      await awardXp(tx, {
        studentId,
        points: badge.xpReward,
        source: 'BADGE',
        description: `Nishon: ${badge.name}`,
        entityType: 'badge',
        entityId: badge.id,
        dedupeKey: `badge:${studentBadge.id}`,
      });
      context.totalXp += badge.xpReward;
    }
  }
  return awarded;
}

// ---------------------------------------------------------------------
// Boshqa servislar chaqiradigan hooklar
// ---------------------------------------------------------------------

export const gamificationHooks = {
  /**
   * Davomat belgilangandan keyin: XP, ketma-ketlik va nishonlar yangilanadi.
   * Qayta belgilansa XP ham qayta hisoblanadi (dedupeKey bir xil).
   */
  async onAttendanceMarked(
    tx: Prisma.TransactionClient,
    input: { studentId: string; attendanceId: string; status: AttendanceStatus; date: Date },
  ): Promise<void> {
    const ruleKey = ATTENDANCE_RULE_BY_STATUS[input.status];
    const points = ruleKey ? await pointsForRule(tx, ruleKey) : 0;

    const totalXp = await awardXp(tx, {
      studentId: input.studentId,
      points,
      source: 'ATTENDANCE',
      ruleKey,
      description: input.status === 'LATE' ? 'Kechikib keldi' : 'Darsga keldi',
      entityType: 'attendance',
      entityId: input.attendanceId,
      dedupeKey: `attendance:${input.attendanceId}`,
    });

    const streak = await recalculateStreak(tx, input.studentId);

    // 7 kunlik seriya uchun alohida XP (qoidadan)
    const streakPoints = streak.current > 0 && streak.current % 7 === 0 ? await pointsForRule(tx, 'STREAK_7') : 0;
    let finalXp = totalXp;
    if (streakPoints > 0) {
      finalXp = await awardXp(tx, {
        studentId: input.studentId,
        points: streakPoints,
        source: 'STREAK',
        ruleKey: 'STREAK_7',
        description: `${streak.current} dars ketma-ket qatnashdi`,
        entityType: 'streak',
        dedupeKey: `streak:${input.studentId}:${streak.current}`,
      });
    }

    await evaluateBadges(tx, input.studentId, { totalXp: finalXp, streak: streak.current });
  },

  /** Uy vazifasi topshirilgan yoki baholanganda */
  async onHomeworkSubmitted(
    tx: Prisma.TransactionClient,
    input: { studentId: string; submissionId: string; onTime: boolean },
  ): Promise<number> {
    const points = input.onTime ? await pointsForRule(tx, 'HOMEWORK_SUBMITTED') : 0;
    const totalXp = await awardXp(tx, {
      studentId: input.studentId,
      points,
      source: 'HOMEWORK',
      ruleKey: 'HOMEWORK_SUBMITTED',
      description: 'Uy vazifasini topshirdi',
      entityType: 'homeworkSubmission',
      entityId: input.submissionId,
      dedupeKey: `homework:${input.submissionId}`,
    });

    const streak = await tx.streak.findUnique({ where: { studentId: input.studentId }, select: { current: true } });
    await evaluateBadges(tx, input.studentId, { totalXp, streak: streak?.current ?? 0 });
    return points;
  },

  /** Imtihon natijasi kiritilganda */
  async onExamGraded(
    tx: Prisma.TransactionClient,
    input: { studentId: string; resultId: string; percentage: number },
  ): Promise<number> {
    const ruleKey = input.percentage >= 90 ? 'EXAM_EXCELLENT' : input.percentage >= 75 ? 'EXAM_GOOD' : null;
    const points = ruleKey ? await pointsForRule(tx, ruleKey) : 0;

    const totalXp = await awardXp(tx, {
      studentId: input.studentId,
      points,
      source: 'EXAM',
      ruleKey: ruleKey ?? undefined,
      description: `Imtihon natijasi: ${input.percentage}%`,
      entityType: 'examResult',
      entityId: input.resultId,
      dedupeKey: `exam:${input.resultId}`,
    });

    const streak = await tx.streak.findUnique({ where: { studentId: input.studentId }, select: { current: true } });
    await evaluateBadges(tx, input.studentId, { totalXp, streak: streak?.current ?? 0 });
    return points;
  },
};

// ---------------------------------------------------------------------
// Ommaviy API
// ---------------------------------------------------------------------

/** Leaderboard davri → sana chegarasi */
function periodStart(period: LeaderboardQuery['period']): Date | null {
  const now = new Date();
  switch (period) {
    case 'week': {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
      return start;
    }
    case 'month':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case 'year':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case 'all':
      return null;
  }
}

export const gamificationService = {
  /** O‘quvchining XP profili: daraja, progress, reyting o‘rni, nishonlar, so‘nggi XP */
  async profile(studentId: string): Promise<GamificationProfileDto> {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        gamification: { select: { totalXp: true, levelNumber: true } },
        streak: { select: { current: true, longest: true, lastAttendanceDate: true } },
        badges: {
          select: {
            id: true,
            awardedAt: true,
            badge: { select: { key: true, name: true, icon: true, description: true } },
          },
          orderBy: { awardedAt: 'desc' },
        },
        xpTransactions: {
          select: { id: true, points: true, source: true, description: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!student) {
      throw AppError.notFound('O‘quvchi topilmadi');
    }

    const totalXp = student.gamification?.totalXp ?? 0;
    const levels = await prisma.level.findMany({ orderBy: { minXp: 'asc' } });
    const currentLevel = [...levels].reverse().find((level) => totalXp >= level.minXp) ?? levels[0];
    const nextLevel = levels.find((level) => level.minXp > totalXp) ?? null;

    const span = nextLevel && currentLevel ? nextLevel.minXp - currentLevel.minXp : 0;
    const progress = nextLevel && currentLevel && span > 0
      ? Math.min(100, Math.round(((totalXp - currentLevel.minXp) / span) * 100))
      : 100;

    const higher = await prisma.gamificationProfile.count({ where: { totalXp: { gt: totalXp } } });

    return {
      studentId: student.id,
      code: formatStudentNumber(student.number),
      firstName: student.firstName,
      lastName: student.lastName,
      totalXp,
      level: {
        number: currentLevel?.number ?? 1,
        name: currentLevel?.name ?? 'Yangi boshlovchi',
        icon: currentLevel?.icon ?? null,
        minXp: currentLevel?.minXp ?? 0,
      },
      nextLevel: nextLevel
        ? { number: nextLevel.number, name: nextLevel.name, minXp: nextLevel.minXp, xpLeft: nextLevel.minXp - totalXp }
        : null,
      progress,
      rank: student.gamification ? higher + 1 : null,
      streak: {
        current: student.streak?.current ?? 0,
        longest: student.streak?.longest ?? 0,
        lastAttendanceDate: student.streak?.lastAttendanceDate ? toDateOnly(student.streak.lastAttendanceDate) : null,
      },
      badges: student.badges.map((item) => ({
        id: item.id,
        key: item.badge.key,
        name: item.badge.name,
        icon: item.badge.icon,
        description: item.badge.description,
        awardedAt: item.awardedAt.toISOString(),
      })),
      recentXp: student.xpTransactions.map((item) => ({
        id: item.id,
        points: item.points,
        source: item.source,
        description: item.description,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  },

  /**
   * Reyting. "Butun davr" uchun profildagi jami XP, boshqa davrlar uchun
   * shu davrdagi XP yig‘indisi bo‘yicha saralanadi.
   */
  async leaderboard(query: LeaderboardQuery): Promise<LeaderboardRowDto[]> {
    const start = periodStart(query.period);
    const studentFilter: Prisma.StudentWhereInput = {
      deletedAt: null,
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
    };

    let ordered: Array<{ studentId: string; xp: number }>;
    if (start) {
      const grouped = await prisma.xpTransaction.groupBy({
        by: ['studentId'],
        where: { createdAt: { gte: start }, student: studentFilter },
        _sum: { points: true },
        orderBy: { _sum: { points: 'desc' } },
        take: query.limit,
      });
      ordered = grouped.map((row) => ({ studentId: row.studentId, xp: row._sum.points ?? 0 }));
    } else {
      const profiles = await prisma.gamificationProfile.findMany({
        where: { student: studentFilter },
        orderBy: { totalXp: 'desc' },
        take: query.limit,
        select: { studentId: true, totalXp: true },
      });
      ordered = profiles.map((row) => ({ studentId: row.studentId, xp: row.totalXp }));
    }
    if (ordered.length === 0) return [];

    const students = await prisma.student.findMany({
      where: { id: { in: ordered.map((row) => row.studentId) } },
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        course: { select: { name: true } },
        group: { select: { name: true } },
        gamification: { select: { totalXp: true, levelNumber: true } },
        streak: { select: { current: true } },
        _count: { select: { badges: true } },
      },
    });
    const byId = new Map(students.map((student) => [student.id, student]));

    const levels = await prisma.level.findMany({ select: { number: true, name: true } });
    const levelName = new Map(levels.map((level) => [level.number, level.name]));

    return ordered.flatMap((row, index) => {
      const student = byId.get(row.studentId);
      if (!student) return [];
      const levelNumber = student.gamification?.levelNumber ?? 1;
      return [
        {
          rank: index + 1,
          studentId: student.id,
          code: formatStudentNumber(student.number),
          firstName: student.firstName,
          lastName: student.lastName,
          courseName: student.course.name,
          groupName: student.group?.name ?? null,
          xp: row.xp,
          totalXp: student.gamification?.totalXp ?? 0,
          levelNumber,
          levelName: levelName.get(levelNumber) ?? '—',
          badges: student._count.badges,
          streak: student.streak?.current ?? 0,
        },
      ];
    });
  },

  async rules(): Promise<XpRuleDto[]> {
    const rules = await prisma.xpRule.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
    return rules.map((rule) => ({
      id: rule.id,
      key: rule.key,
      name: rule.name,
      description: rule.description,
      source: rule.source,
      points: rule.points,
      isActive: rule.isActive,
    }));
  },

  async updateRule(actor: AuthUser, id: string, input: UpdateXpRuleInput, client: ClientInfo): Promise<XpRuleDto> {
    const existing = await prisma.xpRule.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('XP qoidasi topilmadi');
    }

    const rule = await prisma.xpRule.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description ?? null }),
        ...(input.points === undefined ? {} : { points: input.points }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });

    await auditService.record({
      userId: actor.id,
      action: 'gamification.rule_updated',
      entityType: 'xpRule',
      entityId: id,
      metadata: { key: rule.key, pointsFrom: existing.points, pointsTo: rule.points, isActive: rule.isActive },
      ...client,
    });

    return {
      id: rule.id,
      key: rule.key,
      name: rule.name,
      description: rule.description,
      source: rule.source,
      points: rule.points,
      isActive: rule.isActive,
    };
  },

  async levels(): Promise<LevelDto[]> {
    const levels = await prisma.level.findMany({ orderBy: { number: 'asc' } });
    const counts = await prisma.gamificationProfile.groupBy({ by: ['levelNumber'], _count: { _all: true } });
    const countByLevel = new Map(counts.map((row) => [row.levelNumber, row._count._all]));

    return levels.map((level) => ({
      id: level.id,
      number: level.number,
      name: level.name,
      minXp: level.minXp,
      icon: level.icon,
      color: level.color,
      students: countByLevel.get(level.number) ?? 0,
    }));
  },

  /** Daraja chegarasi o‘zgarsa — barcha profillar qayta hisoblanadi */
  async updateLevel(actor: AuthUser, id: string, input: UpdateLevelInput, client: ClientInfo): Promise<LevelDto[]> {
    const existing = await prisma.level.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Daraja topilmadi');
    }
    if (input.minXp !== undefined) {
      const conflict = await prisma.level.findFirst({ where: { minXp: input.minXp, id: { not: id } }, select: { number: true } });
      if (conflict) {
        throw AppError.conflict(`${conflict.number}-daraja uchun bu XP chegarasi allaqachon band`, [
          { field: 'minXp', message: 'Chegara takrorlanmasligi kerak' },
        ]);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.level.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.minXp === undefined ? {} : { minXp: input.minXp }),
          ...(input.icon === undefined ? {} : { icon: input.icon ?? null }),
          ...(input.color === undefined ? {} : { color: input.color ?? null }),
        },
      });

      const profiles = await tx.gamificationProfile.findMany({ select: { studentId: true, totalXp: true } });
      for (const profile of profiles) {
        const levelNumber = await resolveLevel(tx, profile.totalXp);
        await tx.gamificationProfile.update({ where: { studentId: profile.studentId }, data: { levelNumber } });
      }
    });

    await auditService.record({
      userId: actor.id,
      action: 'gamification.level_updated',
      entityType: 'level',
      entityId: id,
      metadata: { number: existing.number, minXpFrom: existing.minXp, minXpTo: input.minXp ?? existing.minXp },
      ...client,
    });

    return this.levels();
  },

  async badges(): Promise<BadgeDto[]> {
    const badges = await prisma.badge.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
    const counts = await prisma.studentBadge.groupBy({ by: ['badgeId'], _count: { _all: true } });
    const countByBadge = new Map(counts.map((row) => [row.badgeId, row._count._all]));

    return badges.map((badge) => ({
      id: badge.id,
      key: badge.key,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      rule: badge.rule,
      threshold: badge.threshold,
      xpReward: badge.xpReward,
      isActive: badge.isActive,
      awarded: countByBadge.get(badge.id) ?? 0,
    }));
  },

  async updateBadge(actor: AuthUser, id: string, input: UpdateBadgeInput, client: ClientInfo): Promise<BadgeDto[]> {
    const existing = await prisma.badge.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Nishon topilmadi');
    }

    await prisma.badge.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        ...(input.threshold === undefined ? {} : { threshold: input.threshold ?? null }),
        ...(input.xpReward === undefined ? {} : { xpReward: input.xpReward }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });

    await auditService.record({
      userId: actor.id,
      action: 'gamification.badge_updated',
      entityType: 'badge',
      entityId: id,
      metadata: { key: existing.key, threshold: input.threshold ?? existing.threshold },
      ...client,
    });

    return this.badges();
  },

  /** Qo‘lda XP berish yoki ayirish (admin) */
  async manualXp(actor: AuthUser, input: ManualXpInput, client: ClientInfo): Promise<GamificationProfileDto> {
    const student = await prisma.student.findFirst({ where: { id: input.studentId, deletedAt: null }, select: { id: true } });
    if (!student) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'studentId', message: 'O‘quvchi topilmadi' }]);
    }

    await prisma.$transaction(async (tx) => {
      await tx.xpTransaction.create({
        data: {
          studentId: input.studentId,
          points: input.points,
          source: 'MANUAL',
          description: input.description,
          awardedById: actor.id,
        },
      });
      const profile = await recalculateProfile(tx, input.studentId);
      const streak = await tx.streak.findUnique({ where: { studentId: input.studentId }, select: { current: true } });
      await evaluateBadges(tx, input.studentId, { totalXp: profile.totalXp, streak: streak?.current ?? 0 });
    });

    await auditService.record({
      userId: actor.id,
      action: 'gamification.xp_awarded',
      entityType: 'student',
      entityId: input.studentId,
      metadata: { points: input.points, description: input.description },
      ...client,
    });

    return this.profile(input.studentId);
  },

  /** Nishonni qo‘lda berish (MANUAL qoidali nishonlar uchun) */
  async awardBadge(actor: AuthUser, studentId: string, badgeId: string, client: ClientInfo): Promise<GamificationProfileDto> {
    const badge = await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true, key: true, name: true, xpReward: true } });
    if (!badge) {
      throw AppError.notFound('Nishon topilmadi');
    }
    const existing = await prisma.studentBadge.findUnique({
      where: { studentId_badgeId: { studentId, badgeId } },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('Bu nishon allaqachon berilgan');
    }

    await prisma.$transaction(async (tx) => {
      const studentBadge = await tx.studentBadge.create({ data: { studentId, badgeId }, select: { id: true } });
      if (badge.xpReward > 0) {
        await awardXp(tx, {
          studentId,
          points: badge.xpReward,
          source: 'BADGE',
          description: `Nishon: ${badge.name}`,
          entityType: 'badge',
          entityId: badge.id,
          dedupeKey: `badge:${studentBadge.id}`,
          awardedById: actor.id,
        });
      }
    });

    await auditService.record({
      userId: actor.id,
      action: 'gamification.badge_awarded',
      entityType: 'student',
      entityId: studentId,
      metadata: { badge: badge.key },
      ...client,
    });

    return this.profile(studentId);
  },

  /** Barcha o‘quvchilar uchun XP, daraja, seriya va nishonlarni qayta hisoblaydi */
  async recalculateAll(actor: AuthUser, client: ClientInfo): Promise<{ students: number }> {
    const students = await prisma.student.findMany({ where: { deletedAt: null }, select: { id: true } });

    for (const student of students) {
      await prisma.$transaction(async (tx) => {
        const profile = await recalculateProfile(tx, student.id);
        const streak = await recalculateStreak(tx, student.id);
        await evaluateBadges(tx, student.id, { totalXp: profile.totalXp, streak: streak.current });
      });
    }

    await auditService.record({
      userId: actor.id,
      action: 'gamification.recalculated',
      entityType: 'gamification',
      metadata: { students: students.length },
      ...client,
    });

    return { students: students.length };
  },
};
