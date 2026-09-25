import { prisma } from '../config/database.js';
import { llmAvailable } from './ai/llm.js';

/**
 * TZ 3.0 §76 "Owner uchun final control": rahbar bitta dashboarddan barcha yo'nalish holatini
 * ko'radi. Moliya, sotuv va o'quvchilar soni `executive.summary` da bor — bu yerda qolgan
 * yo'nalishlar (ota-ona, kurs, vazifa, imtihon, akademik progress, xavf, marketing, Telegram, AI).
 *
 * Faqat sanoq va o'rtacha (indeksli `count`/`groupBy`/`aggregate`) — N+1 yo'q, har biri bitta so'rov.
 */

const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface AcademyOverviewDto {
  windowDays: number;
  parents: { total: number; withPortal: number; telegramLinked: number };
  courses: { active: number };
  groups: { active: number; planned: number };
  attendance: { rate: number | null; marked: number };
  homework: { open: number; toGrade: number; submissionRate: number | null };
  exams: { held: number; averagePercentage: number | null; needsReview: number };
  progress: { averageMastery: number | null; masteredShare: number | null; tracked: number };
  risk: { healthy: number; attention: number; atRisk: number; critical: number };
  marketing: { leads: number; won: number; topSource: { name: string; leads: number } | null };
  telegram: { linkedChats: number; queued: number; failed: number };
  ai: { mode: 'LLM' | 'RULES'; analyses: number; awaitingDecision: number };
}

function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export const academyOverviewService = {
  async overview(now: Date = new Date()): Promise<AcademyOverviewDto> {
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const activeStudent = { deletedAt: null, status: 'ACTIVE' as const };

    const [
      parentsTotal,
      parentsWithPortal,
      parentsTelegram,
      coursesActive,
      groups,
      attendance,
      homeworkOpen,
      submissions,
      examsHeld,
      examAverage,
      needsReview,
      mastery,
      masteredCount,
      risk,
      leads,
      won,
      sources,
      linkedChats,
      deliveries,
      analyses,
      awaiting,
    ] = await Promise.all([
      prisma.parent.count(),
      prisma.parent.count({ where: { userId: { not: null } } }),
      prisma.telegramLink.count({ where: { parentId: { not: null }, verifiedAt: { not: null }, isActive: true } }),
      prisma.course.count({ where: { status: 'ACTIVE' } }),
      prisma.group.groupBy({ by: ['status'], where: { status: { in: ['ACTIVE', 'PLANNED'] } }, _count: { _all: true } }),
      prisma.attendance.groupBy({ by: ['status'], where: { date: { gte: since, lte: now }, student: activeStudent }, _count: { _all: true } }),
      prisma.homework.count({ where: { status: 'PUBLISHED', deadline: { gte: now } } }),
      prisma.homeworkSubmission.groupBy({
        by: ['status'],
        where: { homework: { status: { not: 'DRAFT' }, deadline: { gte: since, lte: now } }, student: activeStudent },
        _count: { _all: true },
      }),
      prisma.exam.count({ where: { date: { gte: since, lte: now }, status: { not: 'CANCELLED' } } }),
      prisma.examResult.aggregate({ where: { exam: { date: { gte: since, lte: now } } }, _avg: { percentage: true } }),
      prisma.examAttempt.count({ where: { status: 'NEEDS_REVIEW' } }),
      prisma.topicMastery.aggregate({ where: { score: { not: null }, student: activeStudent }, _avg: { score: true }, _count: { _all: true } }),
      prisma.topicMastery.count({ where: { status: 'MASTERED', score: { not: null }, student: activeStudent } }),
      prisma.student.groupBy({ by: ['riskLevel'], where: { ...activeStudent, riskLevel: { not: null } }, _count: { _all: true } }),
      prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: since } } }),
      prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: since }, status: 'WON' } }),
      prisma.lead.groupBy({ by: ['sourceId'], where: { deletedAt: null, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { sourceId: 'desc' } }, take: 1 }),
      prisma.telegramLink.count({ where: { verifiedAt: { not: null }, isActive: true, chatId: { not: null } } }),
      prisma.notificationDelivery.groupBy({
        by: ['status'],
        where: { channel: 'TELEGRAM', OR: [{ status: 'PENDING' }, { status: 'FAILED', createdAt: { gte: new Date(now.getTime() - DAY_MS) } }] },
        _count: { _all: true },
      }),
      prisma.aiAnalysis.count({ where: { createdAt: { gte: since } } }),
      // Qaror talab qiladigan (ball taklifi, remedial reja) — o'qituvchi hali tasdiqlamagan
      prisma.aiAnalysis.count({ where: { status: 'READY', kind: { in: ['HOMEWORK_REVIEW', 'REMEDIAL'] }, createdAt: { gte: since } } }),
    ]);

    const count = <T extends { _count: { _all: number } }>(rows: T[], match: (row: T) => boolean) => rows.filter(match).reduce((sum, row) => sum + row._count._all, 0);
    const attendanceTotal = count(attendance, () => true);
    const attended = count(attendance, (row) => row.status === 'PRESENT' || row.status === 'LATE');
    // Muddati o'tgan (oynadagi) barcha topshiriqlar — topshirilmaganlar ham
  const due = count(submissions, () => true);
    const done = count(submissions, (row) => ['SUBMITTED', 'LATE', 'GRADED', 'RETURNED'].includes(row.status));
    const toGrade = await prisma.homeworkSubmission.count({ where: { status: { in: ['SUBMITTED', 'LATE'] }, homework: { status: { not: 'DRAFT' } }, student: activeStudent } });
    const topSource = sources[0] ? await prisma.source.findUnique({ where: { id: sources[0].sourceId }, select: { name: true } }) : null;

    return {
      windowDays: WINDOW_DAYS,
      parents: { total: parentsTotal, withPortal: parentsWithPortal, telegramLinked: parentsTelegram },
      courses: { active: coursesActive },
      groups: { active: count(groups, (row) => row.status === 'ACTIVE'), planned: count(groups, (row) => row.status === 'PLANNED') },
      attendance: { rate: percent(attended, attendanceTotal), marked: attendanceTotal },
      homework: { open: homeworkOpen, toGrade, submissionRate: percent(done, due) },
      exams: { held: examsHeld, averagePercentage: examAverage._avg.percentage === null ? null : Math.round(examAverage._avg.percentage), needsReview },
      progress: {
        averageMastery: mastery._avg.score === null ? null : Math.round(mastery._avg.score),
        masteredShare: percent(masteredCount, mastery._count._all),
        tracked: mastery._count._all,
      },
      risk: {
        healthy: count(risk, (row) => row.riskLevel === 'HEALTHY'),
        attention: count(risk, (row) => row.riskLevel === 'ATTENTION'),
        atRisk: count(risk, (row) => row.riskLevel === 'AT_RISK'),
        critical: count(risk, (row) => row.riskLevel === 'CRITICAL'),
      },
      marketing: { leads, won, topSource: topSource && sources[0] ? { name: topSource.name, leads: sources[0]._count._all } : null },
      telegram: {
        linkedChats,
        queued: count(deliveries, (row) => row.status === 'PENDING'),
        failed: count(deliveries, (row) => row.status === 'FAILED'),
      },
      ai: { mode: llmAvailable() ? 'LLM' : 'RULES', analyses, awaitingDecision: awaiting },
    };
  },
};
