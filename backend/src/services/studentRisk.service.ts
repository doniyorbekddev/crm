import { prisma } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';
import type { RiskLevel, StudentStatus } from '../generated/prisma/client.js';
import { ATTENDED_STATUSES } from '../utils/attendance.js';
import { addDays, startOfBusinessDay } from '../utils/dates.js';
import { getAlertSettings } from './alert.service.js';
import type { AlertSettings } from './alert.service.js';
import { scheduleDueStats } from './paymentSchedule.service.js';

/**
 * O'quvchining ketib qolish xavfi (churn risk).
 *
 * Tamoyillar:
 *  - Risk — **holat emas**, alohida o'lchov: o'quvchi bir vaqtda ACTIVE va CRITICAL bo'lishi mumkin.
 *  - Baho markaz sog'lomlik bahosi bilan **bir xil usulda** hisoblanadi (`executive.service.ts`):
 *    har bir signal 0–100 ballga keltiriladi, vazn bilan o'rtacha olinadi va
 *    ma'lumoti yo'q signal bahoga umuman kirmaydi (nol deb hisoblanmaydi).
 *  - Chegaralar ogohlantirish sozlamalaridan olinadi (`alerts.settings`), shuning uchun
 *    ogohlantirish va risk bitta haqiqatdan ishlaydi.
 *  - Davomat foizining maxraji — guruhda **o'tkazilgan** darslar soni (belgilanmagan dars
 *    foizni sun'iy oshirmasligi uchun), qatnashgan deb PRESENT/LATE/EXCUSED sanaladi.
 */

/** Risk hisobiga kiradigan o'quvchilar: o'qiyotgan va muzlatilganlar */
const TRACKED_STATUSES: readonly StudentStatus[] = ['ACTIVE', 'FROZEN'];

const ATTENDANCE_WINDOW_DAYS = 30;
const HOMEWORK_WINDOW_DAYS = 60;
const EXAM_WINDOW_DAYS = 90;
/** Shu belgidan kam davomat bo'lsa, davomat signali ishonchsiz — hisobga kirmaydi */
const MIN_ATTENDANCE_MARKS = 3;
/** Ball shu qiymatdan past bo'lsa, signal "sabab" sifatida ko'rsatiladi */
const REASON_THRESHOLD = 60;

export type RiskFactorKey =
  | 'attendance'
  | 'absences'
  | 'debt'
  | 'overdue'
  | 'homework'
  | 'exam'
  // TZ 3.0 §29: imtihon pasaymoqda, ketma-ket topshirmagan, faollik past, kabinetga kirmagan
  | 'examTrend'
  | 'missedHomework'
  | 'activity'
  | 'login';

/** Imtihon dinamikasi: "yaqin" oyna va undan oldingi solishtirish oynasi */
const EXAM_RECENT_DAYS = 30;
const EXAM_TREND_DAYS = 120;
/** Ketma-ket topshirilmagan vazifalar — shuncha oxirgisi ko'riladi */
const MISSED_HOMEWORK_WINDOW = 5;
/** Shuncha kundan keyin faolsizlik signali hisobga kiradi (yangi o'quvchi ayblanmaydi) */
const ACTIVITY_GRACE_DAYS = 14;
/** Kabinet ochilgandan shuncha kun o'tib hali kirmagan bo'lsa — signal */
const LOGIN_GRACE_DAYS = 7;

export interface RiskFactor {
  key: RiskFactorKey;
  label: string;
  weight: number;
  /** 0–100; `null` — ma'lumot yo'q (bahoga kirmaydi) */
  score: number | null;
  /** Foydalanuvchiga ko'rinadigan qiymat: "58%", "12 kun" */
  value: string;
  hint: string;
}

export interface StudentRiskDto {
  studentId: string;
  healthScore: number | null;
  riskLevel: RiskLevel | null;
  factors: RiskFactor[];
  /** Eng past ballardan boshlab tartiblangan sabablar */
  reasons: string[];
  updatedAt: string | null;
}

/** `executive.service.ts` dagi bilan bir xil: qiymatni 0–100 ballga keltiradi */
function scale(value: number, bad: number, good: number): number {
  const score = Math.round(((value - bad) / (good - bad)) * 100);
  return Math.min(Math.max(score, 0), 100);
}

export function riskLevelFor(score: number | null): RiskLevel | null {
  if (score === null) return null;
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'ATTENTION';
  if (score >= 40) return 'AT_RISK';
  return 'CRITICAL';
}

interface RawSignals {
  attendedMarks: number;
  totalMarks: number;
  /** Guruhda o'tkazilgan darslar (davomat foizining haqiqiy maxraji) */
  heldLessons: number;
  trailingAbsences: number;
  contractTotal: number;
  debtRemaining: number;
  overdueDays: number;
  /** To'lov jadvali bormi (yo'q bo'lsa kechikish signali hisobga kirmaydi) */
  hasSchedule: boolean;
  /** O'qish boshlanganidan beri o'tgan kun — yangi o'quvchini qarzi uchun ayblamaslik uchun */
  daysSinceStart: number;
  homeworkDone: number;
  homeworkTotal: number;
  examAverage: number | null;
  /** Oxirgi 30 kun va undan oldingi 30–120 kun imtihon o'rtachasi */
  examRecent: number | null;
  examEarlier: number | null;
  /** Muddati o'tgan oxirgi vazifalardan ketma-ket nechtasi topshirilmagan; `null` — vazifa yo'q */
  missedHomework: number | null;
  /** Oxirgi o'quv faolligi: darsga kelish, vazifa topshirish, dars ochish, imtihon boshlash */
  lastActivityAt: Date | null;
  /** Kabinet hisobi (bo'lmasa "kirmagan" signali hisobga kirmaydi) */
  account: { createdAt: Date; lastLoginAt: Date | null } | null;
  now: Date;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(Math.floor((to.getTime() - from.getTime()) / 86_400_000), 0);
}

function agoLabel(days: number): string {
  return days === 0 ? 'bugun' : `${days} kun oldin`;
}

function buildFactors(signals: RawSignals, settings: AlertSettings): RiskFactor[] {
  // Maxraj: o'tkazilgan darslar (belgilanmaganlari ham kiradi), lekin hech bo'lmasa belgilar soni
  const attendanceBase = Math.max(signals.heldLessons, signals.totalMarks);
  const attendanceRate = attendanceBase > 0 ? Math.round((signals.attendedMarks / attendanceBase) * 100) : null;
  // Qarz signali faqat imtiyoz muddatidan keyin hisobga kiradi: yangi yozilgan o'quvchining
  // to'lanmagan shartnomasi normal holat (ogohlantirish tizimidagi `debtGraceDays` bilan bir xil).
  const debtCounts = signals.contractTotal > 0 && signals.daysSinceStart >= settings.debtGraceDays;
  const debtShare = debtCounts ? Math.round((signals.debtRemaining / signals.contractTotal) * 100) : null;
  const homeworkRate = signals.homeworkTotal > 0 ? Math.round((signals.homeworkDone / signals.homeworkTotal) * 100) : null;
  const hasAttendance = attendanceBase >= MIN_ATTENDANCE_MARKS;

  return [
    {
      key: 'attendance',
      label: 'Davomat',
      weight: 30,
      score: hasAttendance && attendanceRate !== null ? scale(attendanceRate, settings.attendanceCritical - 10, 95) : null,
      value: hasAttendance && attendanceRate !== null ? `${attendanceRate}%` : '—',
      hint: `Oxirgi ${ATTENDANCE_WINDOW_DAYS} kunda darsga qatnashish ulushi`,
    },
    {
      key: 'absences',
      label: 'Ketma-ket kelmaslik',
      weight: 20,
      score: hasAttendance ? scale(signals.trailingAbsences, settings.dropoutAbsences, 0) : null,
      value: hasAttendance ? `${signals.trailingAbsences} ta` : '—',
      hint: `Oxirgi darslardan ketma-ket nechtasiga kelmagani (${settings.dropoutAbsences} ta — xavfli)`,
    },
    {
      key: 'debt',
      label: 'Qarzdorlik',
      weight: 20,
      score: debtShare === null ? null : scale(debtShare, settings.debtSharePercent, 0),
      value: debtShare === null ? '—' : `${debtShare}%`,
      hint: 'Shartnoma summasidan qolgan qarz ulushi',
    },
    {
      key: 'overdue',
      label: 'To‘lov kechikishi',
      weight: 15,
      score: signals.hasSchedule ? scale(signals.overdueDays, 30, 0) : null,
      value: !signals.hasSchedule ? '—' : signals.overdueDays > 0 ? `${signals.overdueDays} kun` : 'yo‘q',
      hint: 'To‘lov jadvali bo‘yicha eng eski kechikish',
    },
    {
      key: 'homework',
      label: 'Uy vazifasi',
      weight: 10,
      score: homeworkRate === null ? null : scale(homeworkRate, 40, 90),
      value: homeworkRate === null ? '—' : `${homeworkRate}%`,
      hint: `Oxirgi ${HOMEWORK_WINDOW_DAYS} kunda topshirilgan vazifalar ulushi`,
    },
    {
      key: 'exam',
      label: 'Imtihon natijalari',
      weight: 5,
      score: signals.examAverage === null ? null : scale(signals.examAverage, 40, 85),
      value: signals.examAverage === null ? '—' : `${signals.examAverage}%`,
      hint: `Oxirgi ${EXAM_WINDOW_DAYS} kundagi o‘rtacha natija`,
    },
    ...extendedFactors(signals),
  ];
}

/** TZ 3.0 §29 qo'shimcha sabablari — ma'lumoti yo'q signal bahoga kirmaydi (`null`) */
function extendedFactors(signals: RawSignals): RiskFactor[] {
  const drop = signals.examRecent !== null && signals.examEarlier !== null ? signals.examEarlier - signals.examRecent : null;
  const activityDays = signals.lastActivityAt ? daysBetween(signals.lastActivityAt, signals.now) : null;
  const activityCounts = activityDays !== null || signals.daysSinceStart >= ACTIVITY_GRACE_DAYS;
  const loginDays = signals.account?.lastLoginAt ? daysBetween(signals.account.lastLoginAt, signals.now) : null;
  const neverLoggedIn = signals.account !== null && signals.account.lastLoginAt === null;
  const loginCounts = signals.account !== null && (loginDays !== null || daysBetween(signals.account.createdAt, signals.now) >= LOGIN_GRACE_DAYS);

  return [
    {
      key: 'examTrend',
      label: 'Imtihon natijasi pasaymoqda',
      weight: 5,
      score: drop === null ? null : scale(drop, 20, 0),
      value: drop === null ? '—' : `${signals.examEarlier}% → ${signals.examRecent}%`,
      hint: `Oxirgi ${EXAM_RECENT_DAYS} kun o‘rtachasi undan oldingi davr bilan solishtiriladi (20 ball pasayish — xavfli)`,
    },
    {
      key: 'missedHomework',
      label: 'Ketma-ket topshirilmagan vazifa',
      weight: 5,
      score: signals.missedHomework === null ? null : scale(signals.missedHomework, 3, 0),
      value: signals.missedHomework === null ? '—' : `${signals.missedHomework} ta`,
      hint: `Muddati o‘tgan oxirgi ${MISSED_HOMEWORK_WINDOW} ta vazifadan ketma-ket topshirilmaganlari`,
    },
    {
      key: 'activity',
      label: 'Oxirgi faollik',
      weight: 5,
      score: !activityCounts ? null : activityDays === null ? 0 : scale(activityDays, 21, 3),
      value: !activityCounts ? '—' : activityDays === null ? 'yo‘q' : agoLabel(activityDays),
      hint: 'Darsga kelish, vazifa topshirish, dars materialini ochish yoki imtihon boshlash',
    },
    {
      key: 'login',
      label: 'Kabinetga kirish',
      weight: 5,
      score: !loginCounts ? null : neverLoggedIn ? 0 : scale(loginDays!, 21, 3),
      value: signals.account === null ? 'hisob yo‘q' : !loginCounts ? '—' : neverLoggedIn ? 'kirmagan' : agoLabel(loginDays!),
      hint: 'O‘quvchi kabinetiga oxirgi kirish (hisob ochilgan bo‘lsa)',
    },
  ];
}

/**
 * Daraja berish uchun kerakli eng kam vazn. Bitta zaif signal (masalan faqat to'lov kechikishi)
 * bilan o'quvchini "kritik" deb belgilash noto'g'ri bo'lardi.
 */
const MIN_SCORED_WEIGHT = 35;

function summarize(factors: RiskFactor[]): { healthScore: number | null; riskLevel: RiskLevel | null; reasons: string[] } {
  const scored = factors.filter((factor) => factor.score !== null);
  const weight = scored.reduce((sum, factor) => sum + factor.weight, 0);
  const healthScore =
    weight === 0 ? null : Math.round(scored.reduce((sum, factor) => sum + factor.score! * factor.weight, 0) / weight);

  const reasons = scored
    .filter((factor) => factor.score! < REASON_THRESHOLD)
    .sort((a, b) => a.score! - b.score!)
    .map((factor) => `${factor.label}: ${factor.value}`);

  return { healthScore, riskLevel: weight >= MIN_SCORED_WEIGHT ? riskLevelFor(healthScore) : null, reasons };
}

/** Bitta SQL: har bir o'quvchining oxirgi belgilaridan ketma-ket nechtasi ABSENT ekanini sanaydi */
async function loadTrailingAbsences(studentIds: string[], limit: number): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ studentId: string; trailing: number }>>`
    WITH ranked AS (
      SELECT a."studentId", a."status",
        ROW_NUMBER() OVER (PARTITION BY a."studentId" ORDER BY a."date" DESC) AS rn
      FROM "attendances" a
      WHERE a."studentId" IN (${Prisma.join(studentIds)})
    ), recent AS (
      SELECT "studentId", "status", rn FROM ranked WHERE rn <= ${limit}
    )
    SELECT r."studentId",
      COALESCE(MIN(CASE WHEN r."status" <> 'ABSENT' THEN r.rn END) - 1, MAX(r.rn))::int AS "trailing"
    FROM recent r
    GROUP BY r."studentId"
  `;
  return new Map(rows.map((row) => [row.studentId, Number(row.trailing ?? 0)]));
}

/** Bitta SQL: muddati o'tgan oxirgi vazifalardan ketma-ket nechtasi topshirilmagan */
async function loadMissedHomework(studentIds: string[], now: Date): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ studentId: string; trailing: number }>>`
    WITH ranked AS (
      SELECT s."studentId", s."status",
        ROW_NUMBER() OVER (PARTITION BY s."studentId" ORDER BY h."deadline" DESC) AS rn
      FROM "homework_submissions" s
      JOIN "homework" h ON h."id" = s."homeworkId"
      WHERE s."studentId" IN (${Prisma.join(studentIds)}) AND h."status" <> 'DRAFT' AND h."deadline" < ${now}
    ), recent AS (
      SELECT "studentId", "status", rn FROM ranked WHERE rn <= ${MISSED_HOMEWORK_WINDOW}
    )
    SELECT r."studentId",
      COALESCE(MIN(CASE WHEN r."status" IN ('SUBMITTED', 'LATE', 'GRADED') THEN r.rn END) - 1, MAX(r.rn))::int AS "trailing"
    FROM recent r
    GROUP BY r."studentId"
  `;
  return new Map(rows.map((row) => [row.studentId, Number(row.trailing ?? 0)]));
}

async function loadSignals(now: Date, studentIds: string[]): Promise<Map<string, RawSignals>> {
  const today = startOfBusinessDay(now);
  const attendanceFrom = addDays(today, -ATTENDANCE_WINDOW_DAYS);
  const homeworkFrom = addDays(today, -HOMEWORK_WINDOW_DAYS);
  const examFrom = addDays(today, -EXAM_WINDOW_DAYS);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      groupId: true,
      startDate: true,
      debt: { select: { totalAmount: true, remainingAmount: true } },
    },
  });
  const groupIds = [...new Set(students.map((student) => student.groupId).filter((id): id is string => Boolean(id)))];

  const trendFrom = addDays(today, -EXAM_TREND_DAYS);
  const recentFrom = addDays(today, -EXAM_RECENT_DAYS);
  const attendedStatuses = ['PRESENT', 'LATE'] as const;

  const [attendance, heldSessions, trailing, dueStats, homework, exams, examRecent, examEarlier, missed, lastAttended, lastSubmitted, lastViewed, lastAttempt, accounts] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds }, date: { gte: attendanceFrom } },
      _count: { _all: true },
    }),
    groupIds.length === 0
      ? Promise.resolve([])
      : prisma.attendanceSession.groupBy({
          by: ['groupId'],
          where: { groupId: { in: groupIds }, status: 'HELD', date: { gte: attendanceFrom } },
          _count: { _all: true },
        }),
    loadTrailingAbsences(studentIds, 10),
    scheduleDueStats(now, studentIds),
    prisma.homeworkSubmission.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds }, homework: { deadline: { gte: homeworkFrom } } },
      _count: { _all: true },
    }),
    prisma.examResult.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, exam: { date: { gte: examFrom } } },
      _avg: { percentage: true },
    }),
    prisma.examResult.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, exam: { status: { not: 'CANCELLED' }, date: { gte: recentFrom } } },
      _avg: { percentage: true },
    }),
    prisma.examResult.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, exam: { status: { not: 'CANCELLED' }, date: { gte: trendFrom, lt: recentFrom } } },
      _avg: { percentage: true },
    }),
    loadMissedHomework(studentIds, now),
    prisma.attendance.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds }, status: { in: [...attendedStatuses] } }, _max: { date: true } }),
    prisma.homeworkSubmission.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds }, submittedAt: { not: null } }, _max: { submittedAt: true } }),
    prisma.lessonProgress.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds } }, _max: { lastViewedAt: true } }),
    prisma.examAttempt.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds } }, _max: { startedAt: true } }),
    prisma.student.findMany({
      where: { id: { in: studentIds }, user: { isNot: null } },
      select: { id: true, user: { select: { createdAt: true, lastLoginAt: true } } },
    }),
  ]);

  const averageOf = (rows: Array<{ studentId: string; _avg: { percentage: number | null } }>) =>
    new Map(rows.filter((row) => row._avg.percentage !== null).map((row) => [row.studentId, Math.round(row._avg.percentage!)]));
  const recentBy = averageOf(examRecent);
  const earlierBy = averageOf(examEarlier);
  const latestOf = (id: string) =>
    [
      lastAttended.find((row) => row.studentId === id)?._max.date,
      lastSubmitted.find((row) => row.studentId === id)?._max.submittedAt,
      lastViewed.find((row) => row.studentId === id)?._max.lastViewedAt,
      lastAttempt.find((row) => row.studentId === id)?._max.startedAt,
    ]
      .filter((value): value is Date => value instanceof Date)
      .reduce<Date | null>((latest, value) => (latest === null || value > latest ? value : latest), null);
  const accountBy = new Map(accounts.map((row) => [row.id, row.user!]));

  const heldByGroup = new Map(heldSessions.map((row) => [row.groupId, row._count._all]));
  const examByStudent = new Map(exams.map((row) => [row.studentId, row._avg.percentage]));

  const signals = new Map<string, RawSignals>();
  for (const student of students) {
    signals.set(student.id, {
      attendedMarks: 0,
      totalMarks: 0,
      heldLessons: student.groupId ? (heldByGroup.get(student.groupId) ?? 0) : 0,
      trailingAbsences: trailing.get(student.id) ?? 0,
      contractTotal: student.debt?.totalAmount.toNumber() ?? 0,
      debtRemaining: student.debt?.remainingAmount.toNumber() ?? 0,
      overdueDays: dueStats.get(student.id)?.overdueDays ?? 0,
      hasSchedule: dueStats.has(student.id),
      daysSinceStart: Math.max(Math.floor((today.getTime() - student.startDate.getTime()) / 86_400_000), 0),
      homeworkDone: 0,
      homeworkTotal: 0,
      examAverage: examByStudent.get(student.id) === null ? null : Math.round(examByStudent.get(student.id) ?? 0),
      examRecent: recentBy.get(student.id) ?? null,
      examEarlier: earlierBy.get(student.id) ?? null,
      missedHomework: missed.get(student.id) ?? null,
      lastActivityAt: latestOf(student.id),
      account: accountBy.get(student.id) ?? null,
      now,
    });
  }

  for (const row of attendance) {
    const entry = signals.get(row.studentId);
    if (!entry) continue;
    entry.totalMarks += row._count._all;
    if (ATTENDED_STATUSES.includes(row.status)) entry.attendedMarks += row._count._all;
  }

  for (const row of homework) {
    const entry = signals.get(row.studentId);
    if (!entry) continue;
    entry.homeworkTotal += row._count._all;
    // Topshirilgan deb hisoblanadi: vaqtida, kech yoki baholangan
    if (row.status === 'SUBMITTED' || row.status === 'LATE' || row.status === 'GRADED') {
      entry.homeworkDone += row._count._all;
    }
  }

  for (const [id, entry] of signals) {
    if (examByStudent.get(id) === undefined) entry.examAverage = null;
  }

  return signals;
}

/** O'qituvchi markazi jadvali uchun xom ko'rsatkichlar (risk bilan bitta hisobdan) */
export interface StudentRiskMetrics {
  attendanceRate: number | null;
  homeworkRate: number | null;
  examAverage: number | null;
  lastActivityAt: string | null;
  lastLoginAt: string | null;
  hasPortalAccount: boolean;
}

function metricsOf(raw: RawSignals): StudentRiskMetrics {
  const attendanceBase = Math.max(raw.heldLessons, raw.totalMarks);
  return {
    attendanceRate: attendanceBase >= MIN_ATTENDANCE_MARKS ? Math.round((raw.attendedMarks / attendanceBase) * 100) : null,
    homeworkRate: raw.homeworkTotal > 0 ? Math.round((raw.homeworkDone / raw.homeworkTotal) * 100) : null,
    examAverage: raw.examAverage,
    lastActivityAt: raw.lastActivityAt?.toISOString() ?? null,
    lastLoginAt: raw.account?.lastLoginAt?.toISOString() ?? null,
    hasPortalAccount: raw.account !== null,
  };
}

export const studentRiskService = {
  /**
   * Bir nechta o'quvchi uchun yangidan hisoblangan risk va ko'rsatkichlar (saqlamaydi).
   * O'qituvchi markazi guruh jadvali shu bilan ishlaydi — N+1 yo'q, bitta signal yig'imi.
   */
  async forStudents(studentIds: string[], now: Date = new Date()): Promise<Map<string, StudentRiskDto & { metrics: StudentRiskMetrics }>> {
    if (studentIds.length === 0) return new Map();
    const settings = await getAlertSettings();
    const signals = await loadSignals(now, studentIds);
    const stamp = new Date().toISOString();
    return new Map(
      [...signals].map(([id, raw]) => {
        const factors = buildFactors(raw, settings);
        return [id, { studentId: id, ...summarize(factors), factors, updatedAt: stamp, metrics: metricsOf(raw) }];
      }),
    );
  },

  /** Bitta o'quvchi uchun risk — har doim yangidan hisoblanadi (profil sahifasi uchun) */
  async forStudent(studentId: string, now: Date = new Date()): Promise<StudentRiskDto> {
    const settings = await getAlertSettings();
    const signals = await loadSignals(now, [studentId]);
    const raw = signals.get(studentId);
    if (!raw) {
      return { studentId, healthScore: null, riskLevel: null, factors: [], reasons: [], updatedAt: null };
    }
    const factors = buildFactors(raw, settings);
    const summary = summarize(factors);
    return { studentId, ...summary, factors, updatedAt: new Date().toISOString() };
  },

  /**
   * Barcha kuzatiladigan o'quvchilar bo'yicha qayta hisoblash va natijani saqlash.
   * Fon vazifasi (`jobs/studentRisk.job.ts`) shuni chaqiradi.
   */
  async recalculateAll(now: Date = new Date()): Promise<{ updated: number; critical: number }> {
    const settings = await getAlertSettings();
    const students = await prisma.student.findMany({
      where: { deletedAt: null, status: { in: [...TRACKED_STATUSES] } },
      select: { id: true, riskLevel: true, healthScore: true },
    });
    if (students.length === 0) return { updated: 0, critical: 0 };

    const signals = await loadSignals(now, students.map((student) => student.id));
    const stamp = new Date();
    let updated = 0;
    let critical = 0;

    for (const student of students) {
      const raw = signals.get(student.id);
      if (!raw) continue;
      const factors = buildFactors(raw, settings);
      const { healthScore, riskLevel } = summarize(factors);
      if (riskLevel === 'CRITICAL') critical += 1;

      // O'zgarmagan bo'lsa ham `riskUpdatedAt` yangilanadi — hisob qachon yurganini ko'rsatadi
      await prisma.student.update({
        where: { id: student.id },
        data: {
          healthScore,
          riskLevel,
          riskFactors: factors as unknown as Prisma.InputJsonValue,
          riskUpdatedAt: stamp,
        },
      });
      updated += 1;
    }

    return { updated, critical };
  },
};
