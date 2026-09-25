import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AttendanceStatus, SubmissionStatus } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { addDays, businessDateString, businessDayFromString, dateColumn, startOfBusinessWeek } from '../utils/dates.js';
import { curriculumService } from './curriculum.service.js';

/**
 * Haftalik hisobot (TZ 3.0 §11) — ota-ona va o'quvchi uchun bir hafta xulosasi.
 *
 * Hafta: dushanba 00:00 — keyingi dushanba 00:00 (o'quv markaz vaqti). Hisobot **faqat
 * mavjud ma'lumotdan** quriladi — taxmin yoki "o'ylab topilgan" narsa yo'q; ma'lumot bo'lmasa
 * bo'lim bo'sh qoladi. Matnli xulosa yumshoq ohangda (TZ §40: ota-onani qo'rqitmaslik).
 *
 * Mavzu kuchli/zaif — oxirgi 30 kundagi imtihon javoblari bo'yicha (bir hafta kam ma'lumot beradi).
 * Chegaralar imtihon mavzu kesimi bilan bir xil: < 60% zaif, ≥ 85% kuchli.
 */

const WEAK_THRESHOLD = 60;
const STRONG_THRESHOLD = 85;
const TOPIC_WINDOW_DAYS = 30;

export interface WeeklyReportDto {
  student: { id: string; code: string; fullName: string; groupName: string | null; courseName: string };
  week: { start: string; end: string; label: string };
  attendance: { present: number; late: number; excused: number; absent: number; total: number; rate: number | null; absentDates: string[] };
  homework: {
    total: number;
    submitted: number;
    late: number;
    missed: number;
    pending: number;
    averagePercent: number | null;
    items: Array<{ title: string; deadline: string; status: SubmissionStatus; score: number | null; maxPoints: number }>;
  };
  exams: Array<{ title: string; date: string; percentage: number; grade: string | null; passed: boolean | null }>;
  xp: { earned: number; total: number; level: number };
  progress: { coursePercent: number | null; topicsCompleted: string[] };
  topics: { strong: string[]; weak: string[] };
  feedback: Array<{ source: 'homework' | 'exam'; title: string; text: string; author: string | null; date: string }>;
  /** Qisqa, yumshoq xulosa — Telegram va web uchun */
  summary: string[];
}

function percent(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 100);
}

/** 21.09 — 27.09.2026 */
function weekLabel(start: Date): string {
  const first = businessDateString(start);
  const last = businessDateString(addDays(start, 6));
  return `${first.slice(8, 10)}.${first.slice(5, 7)} — ${last.slice(8, 10)}.${last.slice(5, 7)}.${last.slice(0, 4)}`;
}

function personName(person: { firstName: string; lastName: string } | null): string | null {
  return person ? `${person.firstName} ${person.lastName}` : null;
}

/**
 * Hafta boshini aniqlaydi: `week` berilsa — o'sha sana joylashgan hafta, aks holda joriy hafta.
 * Kelajakdagi hafta so'ralsa — rad etiladi (bo'sh hisobot chalkashtiradi).
 */
export function resolveWeekStart(week: string | undefined, now: Date = new Date()): Date {
  const start = startOfBusinessWeek(week ? businessDayFromString(week) : now);
  if (start.getTime() > now.getTime()) throw AppError.unprocessable('Kelajakdagi hafta uchun hisobot yo‘q');
  return start;
}

function buildSummary(report: Omit<WeeklyReportDto, 'summary'>): string[] {
  const lines: string[] = [];
  const { attendance, homework, exams, xp, topics } = report;
  if (attendance.total === 0) {
    lines.push('Bu hafta davomat belgilanmagan.');
  } else if (attendance.absent === 0) {
    lines.push(`Barcha ${attendance.total} ta darsda qatnashdi.`);
  } else {
    lines.push(`${attendance.total} ta darsdan ${attendance.total - attendance.absent} tasida qatnashdi.`);
  }
  if (homework.total > 0) {
    lines.push(`Uy vazifalari: ${homework.submitted}/${homework.total} topshirildi${homework.averagePercent === null ? '' : `, o‘rtacha ${homework.averagePercent}%`}.`);
    if (homework.pending + homework.missed > 0) lines.push(`${homework.pending + homework.missed} ta vazifa hali topshirilmagan — birga ko‘rib chiqish foydali bo‘ladi.`);
  }
  for (const exam of exams) lines.push(`«${exam.title}» imtihoni: ${exam.percentage}%${exam.grade ? ` (baho ${exam.grade})` : ''}.`);
  if (xp.earned > 0) lines.push(`Hafta davomida ${xp.earned} XP to‘pladi.`);
  if (topics.strong.length > 0) lines.push(`Yaxshi o‘zlashtirilgan: ${topics.strong.join(', ')}.`);
  if (topics.weak.length > 0) lines.push(`Qo‘shimcha mashq tavsiya etiladi: ${topics.weak.join(', ')}.`);
  return lines;
}

export const weeklyReportService = {
  /** Bitta o'quvchi uchun hafta hisoboti. Egalik tekshiruvi chaqiruvchida (portal/xodim). */
  async build(studentId: string, weekStart: Date): Promise<WeeklyReportDto> {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        group: { select: { name: true } },
        course: { select: { name: true } },
        gamification: { select: { totalXp: true, levelNumber: true } },
      },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');

    const start = weekStart;
    const end = addDays(start, 7);
    const topicWindowStart = addDays(end, -TOPIC_WINDOW_DAYS);
    const range = { gte: start, lt: end };

    const [attendanceRows, submissions, examResults, xpRows, completedTopics, answers, curriculum] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId, date: { gte: dateColumn(start), lt: dateColumn(end) } },
        select: { date: true, status: true },
        orderBy: { date: 'asc' },
      }),
      prisma.homeworkSubmission.findMany({
        where: { studentId, homework: { status: { not: 'DRAFT' }, deadline: range } },
        select: {
          status: true,
          score: true,
          feedback: true,
          gradedAt: true,
          gradedBy: { select: { firstName: true, lastName: true } },
          homework: { select: { title: true, deadline: true, maxPoints: true } },
        },
        orderBy: { homework: { deadline: 'asc' } },
      }),
      prisma.examResult.findMany({
        where: { studentId, gradedAt: range },
        select: {
          percentage: true,
          grade: true,
          comment: true,
          gradedAt: true,
          gradedBy: { select: { firstName: true, lastName: true } },
          exam: { select: { title: true, date: true, passScore: true, maxScore: true } },
          score: true,
        },
        orderBy: { gradedAt: 'asc' },
      }),
      prisma.xpTransaction.aggregate({ where: { studentId, createdAt: range }, _sum: { points: true } }),
      prisma.studentTopicProgress.findMany({
        where: { studentId, status: 'COMPLETED', completedAt: range },
        select: { topic: { select: { title: true } } },
      }),
      prisma.examAnswer.findMany({
        where: { attempt: { studentId, submittedAt: { gte: topicWindowStart, lt: end } }, question: { topicId: { not: null } } },
        select: { score: true, examQuestion: { select: { points: true } }, question: { select: { topic: { select: { title: true } } } } },
      }),
      curriculumService.studentProgress(studentId),
    ]);

    // Davomat
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0 };
    for (const row of attendanceRows) counts[row.status] += 1;
    const attendanceTotal = attendanceRows.length;

    // Uy vazifalari
    const graded = submissions.filter((row) => row.score !== null && row.homework.maxPoints > 0);
    const homeworkAverage = graded.length
      ? Math.round(graded.reduce((sum, row) => sum + (row.score! / row.homework.maxPoints) * 100, 0) / graded.length)
      : null;
    const submittedStatuses: SubmissionStatus[] = ['SUBMITTED', 'LATE', 'GRADED'];

    // Mavzular: ball / maksimal ball
    const topicScores = new Map<string, { score: number; max: number }>();
    for (const answer of answers) {
      const title = answer.question.topic?.title;
      if (!title) continue;
      const entry = topicScores.get(title) ?? { score: 0, max: 0 };
      entry.score += answer.score;
      entry.max += answer.examQuestion.points;
      topicScores.set(title, entry);
    }
    const topicPercents = [...topicScores.entries()].filter(([, value]) => value.max > 0).map(([title, value]) => ({ title, percent: Math.round((value.score / value.max) * 100) }));

    const feedback: WeeklyReportDto['feedback'] = [
      ...submissions
        .filter((row) => row.feedback)
        .map((row) => ({
          source: 'homework' as const,
          title: row.homework.title,
          text: row.feedback!,
          author: personName(row.gradedBy),
          date: (row.gradedAt ?? row.homework.deadline).toISOString(),
        })),
      ...examResults
        .filter((row) => row.comment)
        .map((row) => ({ source: 'exam' as const, title: row.exam.title, text: row.comment!, author: personName(row.gradedBy), date: row.gradedAt.toISOString() })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const base: Omit<WeeklyReportDto, 'summary'> = {
      student: {
        id: student.id,
        code: formatStudentNumber(student.number),
        fullName: `${student.firstName} ${student.lastName}`,
        groupName: student.group?.name ?? null,
        courseName: student.course.name,
      },
      week: { start: businessDateString(start), end: businessDateString(addDays(start, 6)), label: weekLabel(start) },
      attendance: {
        present: counts.PRESENT,
        late: counts.LATE,
        excused: counts.EXCUSED,
        absent: counts.ABSENT,
        total: attendanceTotal,
        rate: percent(counts.PRESENT + counts.LATE, attendanceTotal),
        absentDates: attendanceRows.filter((row) => row.status === 'ABSENT').map((row) => row.date.toISOString().slice(0, 10)),
      },
      homework: {
        total: submissions.length,
        submitted: submissions.filter((row) => submittedStatuses.includes(row.status)).length,
        late: submissions.filter((row) => row.status === 'LATE').length,
        missed: submissions.filter((row) => row.status === 'MISSED').length,
        pending: submissions.filter((row) => row.status === 'PENDING').length,
        averagePercent: homeworkAverage,
        items: submissions.map((row) => ({
          title: row.homework.title,
          deadline: row.homework.deadline.toISOString(),
          status: row.status,
          score: row.score,
          maxPoints: row.homework.maxPoints,
        })),
      },
      exams: examResults.map((row) => {
        const pass = row.exam.passScore ?? Math.ceil(row.exam.maxScore * 0.6);
        return {
          title: row.exam.title,
          date: row.exam.date.toISOString().slice(0, 10),
          percentage: row.percentage,
          grade: row.grade,
          passed: row.score >= pass,
        };
      }),
      xp: { earned: xpRows._sum.points ?? 0, total: student.gamification?.totalXp ?? 0, level: student.gamification?.levelNumber ?? 1 },
      progress: { coursePercent: curriculum ? curriculum.percent : null, topicsCompleted: completedTopics.map((row) => row.topic.title) },
      topics: {
        strong: topicPercents.filter((item) => item.percent >= STRONG_THRESHOLD).sort((a, b) => b.percent - a.percent).map((item) => item.title),
        weak: topicPercents.filter((item) => item.percent < WEAK_THRESHOLD).sort((a, b) => a.percent - b.percent).map((item) => item.title),
      },
      feedback,
    };
    return { ...base, summary: buildSummary(base) };
  },
};

/** Telegram uchun matn (HTML — `escape` chaqiruvchi tomonidan beriladi) */
export function weeklyReportText(report: WeeklyReportDto, escape: (value: string) => string): string {
  const lines = [
    `📊 <b>Haftalik hisobot</b> · ${escape(report.week.label)}`,
    `👤 ${escape(report.student.fullName)}${report.student.groupName ? ` · ${escape(report.student.groupName)}` : ''}`,
    '',
    `✅ Davomat: ${report.attendance.total ? `${report.attendance.rate}% (${report.attendance.total - report.attendance.absent}/${report.attendance.total})` : 'belgilanmagan'}`,
    `📝 Uy vazifasi: ${report.homework.total ? `${report.homework.submitted}/${report.homework.total}${report.homework.averagePercent === null ? '' : ` · o‘rtacha ${report.homework.averagePercent}%`}` : 'berilmagan'}`,
  ];
  if (report.exams.length) lines.push(`🎯 Imtihon: ${report.exams.map((exam) => `${escape(exam.title)} — ${exam.percentage}%`).join('; ')}`);
  lines.push(`⭐ XP: +${report.xp.earned} (jami ${report.xp.total}, ${report.xp.level}-daraja)`);
  if (report.progress.coursePercent !== null) lines.push(`📈 Kurs progressi: ${report.progress.coursePercent}%`);
  if (report.topics.strong.length) lines.push(`💪 Kuchli: ${escape(report.topics.strong.join(', '))}`);
  if (report.topics.weak.length) lines.push(`📚 Mashq kerak: ${escape(report.topics.weak.join(', '))}`);
  if (report.feedback.length) {
    lines.push('', '💬 <b>O‘qituvchi izohlari</b>');
    for (const item of report.feedback.slice(0, 3)) lines.push(`• ${escape(item.title)}: ${escape(item.text)}`);
  }
  return lines.join('\n');
}
