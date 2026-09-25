import { prisma } from '../config/database.js';
import { resolveWeekStart, weeklyReportService } from './weeklyReport.service.js';
import type { WeeklyReportDto } from './weeklyReport.service.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { AttendanceStatus, ExamStatus, HomeworkStatus, SubmissionStatus, XpSource } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { PAYMENT_METHOD_LABELS } from '../config/paymentLabels.js';
import type { GamificationProfileDto } from './gamification.service.js';
import { gamificationService } from './gamification.service.js';
import { permissionService } from './permission.service.js';
import type { StudentDto } from './student.service.js';
import { studentService } from './student.service.js';
import { refundTotal } from './revenue.js';
import { moneyUz } from '../utils/money.js';
import { aiAcademicService } from './ai/academic.service.js';

/**
 * O‘quvchi profili va progressi: davomat, uy vazifasi, imtihon, XP va o‘qituvchi
 * izohlari bitta joyda (promt.md 15 va 38-bo‘limlar). Ko‘rinish qoidalari
 * `studentService.getById` dan olinadi — o‘qituvchi faqat o‘z guruhi o‘quvchisini ko‘radi.
 */

const SUBMITTED: readonly SubmissionStatus[] = ['SUBMITTED', 'LATE', 'GRADED'];
const MONTHS = 6;
const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

export interface ProgressPointDto {
  /** "2026-09" */
  month: string;
  label: string;
  attendanceRate: number | null;
  homeworkRate: number | null;
  examAverage: number | null;
  xp: number;
}

export interface FeedbackDto {
  type: 'homework' | 'exam';
  title: string;
  text: string;
  /** Natija foizda (uy vazifasi uchun ball / maksimal ball) */
  percentage: number | null;
  author: { id: string; firstName: string; lastName: string } | null;
  date: string;
}

export interface ActivityDto {
  type: 'attendance' | 'payment' | 'homework' | 'exam' | 'xp' | 'badge' | 'group';
  title: string;
  description: string;
  date: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface StudentProfileDto {
  student: StudentDto;
  gamification: GamificationProfileDto;
  attendance: { total: number; present: number; absent: number; late: number; excused: number; rate: number };
  homework: {
    assigned: number;
    submitted: number;
    graded: number;
    late: number;
    missed: number;
    pending: number;
    rate: number;
    /** Baholangan vazifalar bo‘yicha o‘rtacha foiz */
    averagePercent: number;
  };
  exams: { count: number; averagePercent: number; best: number | null; lastGrade: string | null };
  /** To‘lov ruxsati bo‘lmasa null */
  payments: { total: number; count: number; lastPaidAt: string | null } | null;
  progress: ProgressPointDto[];
  feedback: FeedbackDto[];
  activity: ActivityDto[];
}

export interface StudentHomeworkRowDto {
  homeworkId: string;
  title: string;
  groupName: string;
  deadline: string;
  homeworkStatus: HomeworkStatus;
  status: SubmissionStatus;
  submittedAt: string | null;
  score: number | null;
  maxPoints: number;
  feedback: string | null;
  xpAwarded: number;
}

export interface StudentExamRowDto {
  examId: string;
  title: string;
  groupName: string;
  date: string;
  examStatus: ExamStatus;
  score: number;
  maxScore: number;
  percentage: number;
  grade: string | null;
  passed: boolean | null;
  comment: string | null;
  xpAwarded: number;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

const ATTENDANCE_TITLES: Record<AttendanceStatus, string> = {
  PRESENT: 'Darsga keldi',
  LATE: 'Kechikib keldi',
  ABSENT: 'Darsga kelmadi',
  EXCUSED: 'Sababli qoldirdi',
};

const XP_SOURCE_TITLES: Record<XpSource, string> = {
  ATTENDANCE: 'Davomat',
  HOMEWORK: 'Uy vazifasi',
  EXAM: 'Imtihon',
  STREAK: 'Seriya',
  REFERRAL: 'Do‘st taklifi',
  COURSE_COMPLETED: 'Kurs yakuni',
  BADGE: 'Nishon',
  MANUAL: 'Qo‘lda berildi',
};

/**
 * Profil ma'lumotini yig'adi. **Ruxsat tekshirmaydi** — chaqiruvchi tomondan
 * tekshirilgan bo'lishi shart (`studentProgressService.profile` xodim uchun,
 * `portal.service` esa kabinet egasi uchun tekshiradi).
 */
export async function buildStudentProfile(
  student: StudentDto,
  options: { includePayments: boolean },
): Promise<StudentProfileDto> {
  const studentId = student.id;
  {

    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));

    const [gamification, attendanceRows, submissions, results, xpRows, badges] = await Promise.all([
      gamificationService.profile(studentId),
      prisma.attendance.findMany({
        where: { studentId },
        select: { status: true, date: true, group: { select: { name: true } } },
        orderBy: { date: 'desc' },
      }),
      prisma.homeworkSubmission.findMany({
        where: { studentId, homework: { status: { not: 'DRAFT' } } },
        select: {
          status: true,
          score: true,
          feedback: true,
          submittedAt: true,
          gradedAt: true,
          gradedBy: { select: { id: true, firstName: true, lastName: true } },
          homework: { select: { title: true, deadline: true, maxPoints: true } },
        },
      }),
      prisma.examResult.findMany({
        where: { studentId, exam: { status: { not: 'CANCELLED' } } },
        select: {
          score: true,
          percentage: true,
          grade: true,
          comment: true,
          gradedAt: true,
          gradedBy: { select: { id: true, firstName: true, lastName: true } },
          exam: { select: { title: true, date: true } },
        },
        orderBy: { exam: { date: 'desc' } },
      }),
      prisma.xpTransaction.findMany({
        where: { studentId, createdAt: { gte: since } },
        select: { points: true, source: true, description: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.studentBadge.findMany({
        where: { studentId },
        select: { awardedAt: true, badge: { select: { name: true, icon: true } } },
        orderBy: { awardedAt: 'desc' },
        take: 10,
      }),
    ]);

    // --- Davomat ---
    const countAttendance = (status: AttendanceStatus) => attendanceRows.filter((row) => row.status === status).length;
    const present = countAttendance('PRESENT');
    const late = countAttendance('LATE');
    const attendance = {
      total: attendanceRows.length,
      present,
      absent: countAttendance('ABSENT'),
      late,
      excused: countAttendance('EXCUSED'),
      rate: percent(present + late, attendanceRows.length),
    };

    // --- Uy vazifasi ---
    const gradedSubmissions = submissions.filter((row) => row.score !== null);
    const submittedCount = submissions.filter((row) => SUBMITTED.includes(row.status)).length;
    const homework = {
      assigned: submissions.length,
      submitted: submittedCount,
      graded: gradedSubmissions.length,
      late: submissions.filter((row) => row.status === 'LATE').length,
      missed: submissions.filter((row) => row.status === 'MISSED').length,
      pending: submissions.filter((row) => row.status === 'PENDING').length,
      rate: percent(submittedCount, submissions.length),
      averagePercent:
        gradedSubmissions.length === 0
          ? 0
          : Math.round(
              gradedSubmissions.reduce((sum, row) => sum + ((row.score ?? 0) / row.homework.maxPoints) * 100, 0) /
                gradedSubmissions.length,
            ),
    };

    // --- Imtihonlar ---
    const exams = {
      count: results.length,
      averagePercent:
        results.length === 0 ? 0 : Math.round(results.reduce((sum, row) => sum + row.percentage, 0) / results.length),
      best: results.length === 0 ? null : Math.max(...results.map((row) => row.percentage)),
      lastGrade: results[0]?.grade ?? null,
    };

    // --- To'lovlar (faqat ruxsat bo'lsa) ---
    let payments: StudentProfileDto['payments'] = null;
    if (options.includePayments) {
      const aggregate = await prisma.payment.aggregate({
        where: { studentId, deletedAt: null },
        _sum: { amount: true },
        _count: { _all: true },
        _max: { paidAt: true },
      });
      payments = {
        total: (aggregate._sum.amount?.toNumber() ?? 0) - (await refundTotal(undefined, { studentId })),
        count: aggregate._count._all,
        lastPaidAt: aggregate._max.paidAt?.toISOString() ?? null,
      };
    }

    // --- Oylik progress (oxirgi 6 oy) ---
    const progress: ProgressPointDto[] = [];
    for (let index = MONTHS - 1; index >= 0; index -= 1) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
      const key = monthKey(start);

      const monthAttendance = attendanceRows.filter((row) => monthKey(row.date) === key);
      const monthHomework = submissions.filter((row) => monthKey(row.homework.deadline) === key);
      const monthExams = results.filter((row) => monthKey(row.exam.date) === key);

      progress.push({
        month: key,
        label: MONTH_LABELS[start.getUTCMonth()] ?? key,
        attendanceRate:
          monthAttendance.length === 0
            ? null
            : percent(monthAttendance.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').length, monthAttendance.length),
        homeworkRate:
          monthHomework.length === 0
            ? null
            : percent(monthHomework.filter((row) => SUBMITTED.includes(row.status)).length, monthHomework.length),
        examAverage:
          monthExams.length === 0
            ? null
            : Math.round(monthExams.reduce((sum, row) => sum + row.percentage, 0) / monthExams.length),
        xp: xpRows.filter((row) => monthKey(row.createdAt) === key).reduce((sum, row) => sum + row.points, 0),
      });
    }

    // --- O'qituvchi izohlari ---
    const feedback: FeedbackDto[] = [
      ...submissions
        .filter((row) => row.feedback)
        .map((row) => ({
          type: 'homework' as const,
          title: row.homework.title,
          text: row.feedback ?? '',
          percentage: row.score === null ? null : Math.round((row.score / row.homework.maxPoints) * 100),
          author: row.gradedBy,
          date: (row.gradedAt ?? row.submittedAt ?? row.homework.deadline).toISOString(),
        })),
      ...results
        .filter((row) => row.comment)
        .map((row) => ({
          type: 'exam' as const,
          title: row.exam.title,
          text: row.comment ?? '',
          percentage: row.percentage,
          author: row.gradedBy,
          date: row.gradedAt.toISOString(),
        })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    // --- Faollik tasmasi ---
    const activity: ActivityDto[] = [
      ...attendanceRows.slice(0, 15).map((row) => ({
        type: 'attendance' as const,
        title: ATTENDANCE_TITLES[row.status],
        description: row.group.name,
        date: row.date.toISOString(),
        tone: row.status === 'ABSENT' ? ('negative' as const) : row.status === 'EXCUSED' ? ('neutral' as const) : ('positive' as const),
      })),
      ...submissions
        .filter((row) => row.submittedAt)
        .map((row) => ({
          type: 'homework' as const,
          title: row.status === 'LATE' ? 'Uy vazifasini kechikib topshirdi' : 'Uy vazifasini topshirdi',
          description:
            row.score === null ? row.homework.title : `${row.homework.title} · ${row.score}/${row.homework.maxPoints}`,
          date: (row.submittedAt ?? row.homework.deadline).toISOString(),
          tone: row.status === 'LATE' ? ('neutral' as const) : ('positive' as const),
        })),
      ...results.map((row) => ({
        type: 'exam' as const,
        title: `Imtihon: ${row.grade ?? '—'}`,
        description: `${row.exam.title} · ${row.percentage}%`,
        date: row.gradedAt.toISOString(),
        tone: row.percentage >= 60 ? ('positive' as const) : ('negative' as const),
      })),
      ...xpRows
        .filter((row) => row.source !== 'ATTENDANCE')
        .slice(0, 10)
        .map((row) => ({
          type: 'xp' as const,
          title: `${row.points > 0 ? '+' : ''}${row.points} XP`,
          description: `${XP_SOURCE_TITLES[row.source]} · ${row.description}`,
          date: row.createdAt.toISOString(),
          tone: row.points >= 0 ? ('positive' as const) : ('negative' as const),
        })),
      ...badges.map((row) => ({
        type: 'badge' as const,
        title: `${row.badge.icon} ${row.badge.name}`,
        description: 'Yangi nishon oldi',
        date: row.awardedAt.toISOString(),
        tone: 'positive' as const,
      })),
    ];

    if (payments) {
      const recentPayments = await prisma.payment.findMany({
        where: { studentId, deletedAt: null },
        select: { amount: true, paidAt: true, method: true },
        orderBy: { paidAt: 'desc' },
        take: 5,
      });
      for (const payment of recentPayments) {
        activity.push({
          type: 'payment',
          title: `${moneyUz(payment.amount.toNumber())} to‘lov`,
          description: PAYMENT_METHOD_LABELS[payment.method],
          date: payment.paidAt.toISOString(),
          tone: 'positive',
        });
      }
    }

    const groupChanges = await prisma.studentGroupChange.findMany({
      where: { studentId },
      orderBy: { changedAt: 'desc' },
      take: 10,
      select: { fromGroupName: true, toGroupName: true, reason: true, changedAt: true },
    });
    for (const change of groupChanges) {
      const { fromGroupName: from, toGroupName: to } = change;
      activity.push({
        type: 'group',
        title: from && to ? `Guruh almashtirildi: ${from} → ${to}` : to ? `Guruhga qo‘shildi: ${to}` : `Guruhdan chiqarildi: ${from ?? '—'}`,
        description: change.reason ?? '',
        date: change.changedAt.toISOString(),
        tone: from && !to ? 'negative' : 'neutral',
      });
    }

    activity.sort((a, b) => b.date.localeCompare(a.date));

    return {
      student,
      gamification,
      attendance,
      homework,
      exams,
      payments,
      progress,
      feedback,
      activity: activity.slice(0, 30),
    };
  }
}

export const studentProgressService = {
  /** Xodim uchun haftalik hisobot — ko'rinish tekshiruvi `getById` orqali (o'qituvchi faqat o'z guruhi) */
  async weeklyReport(actor: AuthUser, studentId: string, week: string | undefined): Promise<WeeklyReportDto> {
    await studentService.getById(actor, studentId);
    return aiAcademicService.withAiSummary(await weeklyReportService.build(studentId, resolveWeekStart(week)));
  },

  async profile(actor: AuthUser, studentId: string): Promise<StudentProfileDto> {
    // Ko'rinish tekshiruvi: topilmasa yoki o'qituvchining guruhida bo'lmasa 404
    const student = await studentService.getById(actor, studentId);
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    return buildStudentProfile(student, { includePayments: permissions.has(PERMISSIONS.PAYMENT_VIEW) });
  },

  async homework(actor: AuthUser, studentId: string): Promise<StudentHomeworkRowDto[]> {
    await studentService.getById(actor, studentId);
    return buildStudentHomeworkRows(studentId);
  },

  async exams(actor: AuthUser, studentId: string): Promise<StudentExamRowDto[]> {
    await studentService.getById(actor, studentId);
    return buildStudentExamRows(studentId);
  },
};

/**
 * O'quvchining vazifalari. **Ruxsat tekshirmaydi** — `buildStudentProfile` kabi, chaqiruvchi
 * tomonda egalik aniqlangan bo'lishi shart (xodim, kabinet yoki Telegram bot).
 */
export async function buildStudentHomeworkRows(studentId: string): Promise<StudentHomeworkRowDto[]> {
  {
    const rows = await prisma.homeworkSubmission.findMany({
      where: { studentId, homework: { status: { not: 'DRAFT' } } },
      select: {
        status: true,
        submittedAt: true,
        score: true,
        feedback: true,
        xpAwarded: true,
        homework: {
          select: { id: true, title: true, deadline: true, maxPoints: true, status: true, group: { select: { name: true } } },
        },
      },
      orderBy: { homework: { deadline: 'desc' } },
    });
    return rows.map((row) => ({
      homeworkId: row.homework.id,
      title: row.homework.title,
      groupName: row.homework.group.name,
      deadline: row.homework.deadline.toISOString(),
      homeworkStatus: row.homework.status,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      score: row.score,
      maxPoints: row.homework.maxPoints,
      feedback: row.feedback,
      xpAwarded: row.xpAwarded,
    }));
  }
}

/** O'quvchining imtihon natijalari. Ruxsat tekshirmaydi — yuqoridagi kabi. */
export async function buildStudentExamRows(studentId: string): Promise<StudentExamRowDto[]> {
  {
    const rows = await prisma.examResult.findMany({
      where: { studentId },
      select: {
        score: true,
        percentage: true,
        grade: true,
        comment: true,
        xpAwarded: true,
        exam: {
          select: { id: true, title: true, date: true, maxScore: true, passScore: true, status: true, group: { select: { name: true } } },
        },
      },
      orderBy: { exam: { date: 'desc' } },
    });
    return rows.map((row) => ({
      examId: row.exam.id,
      title: row.exam.title,
      groupName: row.exam.group.name,
      date: row.exam.date.toISOString().slice(0, 10),
      examStatus: row.exam.status,
      score: row.score,
      maxScore: row.exam.maxScore,
      percentage: row.percentage,
      grade: row.grade,
      passed: row.exam.passScore === null ? null : row.score >= row.exam.passScore,
      comment: row.comment,
      xpAwarded: row.xpAwarded,
    }));
  }
}
