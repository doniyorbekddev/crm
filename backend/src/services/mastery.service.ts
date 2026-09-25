import { prisma } from '../config/database.js';
import type { MasteryStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { logger } from '../utils/logger.js';
import { auditService } from './audit.service.js';
import { studentService } from './student.service.js';
import { assertGroupVisible, getTeachingAccess } from './teachingAccess.js';

/**
 * Mavzu bo'yicha o'zlashtirish (TZ 3.0 §26–27). Progress faqat "74%" emas — har mavzu 0–100.
 *
 * **Manbalar** (har biri 0–100, og'irliklar sozlanadi):
 *  - imtihon — baholangan urinishlarning mavzu kesimi (har imtihondan oxirgi baholangan urinish);
 *  - uy vazifasi — mavzuli vazifalar bali (topshirmagan — 0);
 *  - davomat — mavzu o'tilgan darslarda qatnashish (sababli — hisobga olinmaydi);
 *  - LMS — mavzuning nashr qilingan darslaridan "o'rgandim" ulushi.
 *
 * **Baho faqat baholash dalili (imtihon yoki vazifa) bo'lsa** chiqariladi: faqat darsga kelgani
 * uchun mavzu "o'zlashtirildi" bo'lmaydi — bunday mavzu LEARNING, bahosi yo'q.
 *
 * Holat (sozlanadigan chegaralar, standart 40/60/80):
 *   baho ≥ mastered → MASTERED; ≥ good → PRACTICING; aks holda LEARNING; dalil yo'q → NOT_STARTED.
 * Daraja (ko'rsatish uchun): <40 Weak, 40–59 Developing, 60–79 Good, 80+ Mastered.
 */

export const MASTERY_SETTINGS_KEY = 'mastery.settings';

export interface MasterySettings {
  thresholds: { developing: number; good: number; mastered: number };
  /** Manba og'irliklari (nisbiy) */
  weights: { exam: number; homework: number; attendance: number; lessons: number };
}

export const DEFAULT_MASTERY_SETTINGS: MasterySettings = {
  thresholds: { developing: 40, good: 60, mastered: 80 },
  weights: { exam: 50, homework: 30, attendance: 10, lessons: 10 },
};

export type MasteryLevel = 'WEAK' | 'DEVELOPING' | 'GOOD' | 'MASTERED';

export interface TopicMasteryDto {
  topicId: string;
  title: string;
  score: number | null;
  status: MasteryStatus;
  level: MasteryLevel | null;
  sources: { exam: number | null; homework: number | null; attendance: number | null; lessons: number | null };
  evidence: { examQuestions: number; homework: number; sessions: number; lessons: number };
  calculatedAt: string | null;
}

export interface StudentMasteryDto {
  studentId: string;
  courseId: string;
  settings: MasterySettings;
  overall: { score: number | null; mastered: number; practicing: number; learning: number; notStarted: number; topics: number };
  modules: Array<{ id: string; title: string; score: number | null; topics: TopicMasteryDto[] }>;
}

export interface GroupMasteryDto {
  groupId: string;
  settings: MasterySettings;
  topics: Array<{ id: string; title: string; moduleTitle: string; average: number | null; mastered: number }>;
  students: Array<{
    id: string;
    fullName: string;
    overall: number | null;
    cells: Record<string, { score: number | null; status: MasteryStatus }>;
  }>;
}

type Evidence = TopicMasteryDto['evidence'];

interface TopicCalc {
  exam: { score: number; max: number; count: number };
  homework: { sum: number; count: number };
  attendance: { attended: number; count: number };
  lessons: { done: number };
  started: boolean;
}

function emptyCalc(): TopicCalc {
  return { exam: { score: 0, max: 0, count: 0 }, homework: { sum: 0, count: 0 }, attendance: { attended: 0, count: 0 }, lessons: { done: 0 }, started: false };
}

function mergeSettings(value: unknown): MasterySettings {
  const raw = (value ?? {}) as Partial<MasterySettings>;
  return {
    thresholds: { ...DEFAULT_MASTERY_SETTINGS.thresholds, ...(raw.thresholds ?? {}) },
    weights: { ...DEFAULT_MASTERY_SETTINGS.weights, ...(raw.weights ?? {}) },
  };
}

export async function getMasterySettings(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<MasterySettings> {
  const row = await client.setting.findUnique({ where: { key: MASTERY_SETTINGS_KEY }, select: { value: true } });
  return mergeSettings(row?.value);
}

export function masteryStatus(score: number | null, started: boolean, settings: MasterySettings): MasteryStatus {
  if (score === null) return started ? 'LEARNING' : 'NOT_STARTED';
  if (score >= settings.thresholds.mastered) return 'MASTERED';
  if (score >= settings.thresholds.good) return 'PRACTICING';
  return 'LEARNING';
}

export function masteryLevel(score: number | null, settings: MasterySettings): MasteryLevel | null {
  if (score === null) return null;
  if (score >= settings.thresholds.mastered) return 'MASTERED';
  if (score >= settings.thresholds.good) return 'GOOD';
  if (score >= settings.thresholds.developing) return 'DEVELOPING';
  return 'WEAK';
}

/**
 * Manbalardan yakuniy baho. Baholash dalili (imtihon/vazifa) bo'lmasa — null.
 * Mavjud manbalar og'irligi qayta normallashtiriladi (bo'sh manba bahoni tushirmaydi).
 */
export function combineScore(
  sources: { exam: number | null; homework: number | null; attendance: number | null; lessons: number | null },
  weights: MasterySettings['weights'],
): number | null {
  if (sources.exam === null && sources.homework === null) return null;
  let total = 0;
  let weight = 0;
  for (const key of ['exam', 'homework', 'attendance', 'lessons'] as const) {
    const value = sources[key];
    if (value === null || weights[key] <= 0) continue;
    total += value * weights[key];
    weight += weights[key];
  }
  return weight === 0 ? null : Math.round(total / weight);
}

const pct = (part: number, total: number) => (total === 0 ? null : Math.round((part / total) * 100));

/** Bir guruh o'quvchi uchun barcha manbalarni bir necha so'rovda yig'adi (N+1 yo'q) */
async function collect(studentIds: string[]): Promise<{ calcs: Map<string, Map<string, TopicCalc>>; lessonTotals: Map<string, number> }> {
  const calcs = new Map<string, Map<string, TopicCalc>>(studentIds.map((id) => [id, new Map()]));
  const touch = (studentId: string, topicId: string) => {
    const topics = calcs.get(studentId)!;
    const calc = topics.get(topicId) ?? emptyCalc();
    topics.set(topicId, calc);
    return calc;
  };

  const [attempts, submissions, attendance, lessonDone, started] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { studentId: { in: studentIds }, status: 'GRADED', exam: { status: { not: 'CANCELLED' } } },
      select: { id: true, examId: true, studentId: true, attemptNo: true },
    }),
    prisma.homeworkSubmission.findMany({
      where: {
        studentId: { in: studentIds },
        homework: { topicId: { not: null }, status: { not: 'DRAFT' } },
        OR: [{ score: { not: null } }, { status: 'MISSED' }],
      },
      select: { studentId: true, score: true, status: true, homework: { select: { topicId: true, maxPoints: true } } },
    }),
    prisma.attendance.findMany({
      where: { studentId: { in: studentIds }, status: { not: 'EXCUSED' }, session: { topicId: { not: null }, status: { not: 'CANCELLED' } } },
      select: { studentId: true, status: true, session: { select: { topicId: true } } },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId: { in: studentIds }, completedAt: { not: null }, lesson: { status: 'PUBLISHED' } },
      select: { studentId: true, lesson: { select: { topicId: true } } },
    }),
    prisma.studentTopicProgress.findMany({
      where: { studentId: { in: studentIds }, status: { not: 'NOT_STARTED' } },
      select: { studentId: true, topicId: true },
    }),
  ]);

  // Har imtihondan oxirgi baholangan urinish — qayta topshirish ikki marta hisoblanmasin
  const latest = new Map<string, { id: string; attemptNo: number }>();
  for (const attempt of attempts) {
    const key = `${attempt.studentId}:${attempt.examId}`;
    const current = latest.get(key);
    if (!current || attempt.attemptNo > current.attemptNo) latest.set(key, { id: attempt.id, attemptNo: attempt.attemptNo });
  }
  const attemptIds = [...latest.values()].map((row) => row.id);
  if (attemptIds.length > 0) {
    const [answers, snapshots] = await Promise.all([
      prisma.examAnswer.findMany({
        where: { attemptId: { in: attemptIds }, question: { topicId: { not: null } } },
        select: { score: true, examQuestionId: true, attempt: { select: { id: true, studentId: true } }, examQuestion: { select: { points: true } }, question: { select: { topicId: true } } },
      }),
      prisma.attemptQuestion.findMany({ where: { attemptId: { in: attemptIds } }, select: { attemptId: true, examQuestionId: true, points: true } }),
    ]);
    const snapshotPoints = new Map(snapshots.map((row) => [`${row.attemptId}:${row.examQuestionId}`, row.points]));
    for (const answer of answers) {
      const calc = touch(answer.attempt.studentId, answer.question.topicId!);
      calc.exam.score += answer.score;
      calc.exam.max += snapshotPoints.get(`${answer.attempt.id}:${answer.examQuestionId}`) ?? answer.examQuestion.points;
      calc.exam.count += 1;
    }
  }

  for (const row of submissions) {
    const calc = touch(row.studentId, row.homework.topicId!);
    const percent = row.status === 'MISSED' || row.score === null ? 0 : Math.min(100, (row.score / Math.max(1, row.homework.maxPoints)) * 100);
    calc.homework.sum += percent;
    calc.homework.count += 1;
  }
  for (const row of attendance) {
    const calc = touch(row.studentId, row.session!.topicId!);
    calc.attendance.count += 1;
    if (row.status === 'PRESENT' || row.status === 'LATE') calc.attendance.attended += 1;
  }
  for (const row of lessonDone) touch(row.studentId, row.lesson.topicId).lessons.done += 1;
  for (const row of started) touch(row.studentId, row.topicId).started = true;

  const topicIds = [...new Set([...calcs.values()].flatMap((topics) => [...topics.keys()]))];
  const lessonCounts = topicIds.length
    ? await prisma.lesson.groupBy({ by: ['topicId'], where: { topicId: { in: topicIds }, status: 'PUBLISHED' }, _count: { _all: true } })
    : [];
  return { calcs, lessonTotals: new Map(lessonCounts.map((row) => [row.topicId, row._count._all])) };
}

function toRow(calc: TopicCalc, lessonTotal: number, settings: MasterySettings) {
  const sources = {
    exam: pct(calc.exam.score, calc.exam.max),
    homework: calc.homework.count === 0 ? null : Math.round(calc.homework.sum / calc.homework.count),
    attendance: pct(calc.attendance.attended, calc.attendance.count),
    lessons: lessonTotal === 0 ? null : pct(Math.min(calc.lessons.done, lessonTotal), lessonTotal),
  };
  const score = combineScore(sources, settings.weights);
  const evidence: Evidence = { examQuestions: calc.exam.count, homework: calc.homework.count, sessions: calc.attendance.count, lessons: calc.lessons.done };
  const started = calc.started || evidence.sessions > 0 || evidence.lessons > 0;
  return { sources, score, status: masteryStatus(score, started, settings), evidence };
}

/**
 * Mavzu bo'yicha o'zlashtirishni qayta hisoblaydi va saqlaydi. Faqat o'zgargan qatorlar yoziladi;
 * dalili yo'qolgan mavzu (masalan imtihon bekor qilindi) NOT_STARTED bo'ladi.
 */
async function recalculate(studentIds: string[], now: Date = new Date()): Promise<number> {
  const ids = [...new Set(studentIds)].filter(Boolean);
  if (ids.length === 0) return 0;
  const settings = await getMasterySettings();
  const { calcs, lessonTotals } = await collect(ids);
  const existing = await prisma.topicMastery.findMany({
    where: { studentId: { in: ids } },
    select: { id: true, studentId: true, topicId: true, score: true, status: true, examScore: true, homeworkScore: true, attendanceScore: true, lessonScore: true, evidence: true },
  });
  const byKey = new Map(existing.map((row) => [`${row.studentId}:${row.topicId}`, row]));

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const [studentId, topics] of calcs) {
    for (const [topicId, calc] of topics) {
      const row = toRow(calc, lessonTotals.get(topicId) ?? 0, settings);
      const data = {
        score: row.score,
        status: row.status,
        examScore: row.sources.exam,
        homeworkScore: row.sources.homework,
        attendanceScore: row.sources.attendance,
        lessonScore: row.sources.lessons,
        evidence: row.evidence as unknown as Prisma.InputJsonValue,
        calculatedAt: now,
      };
      const current = byKey.get(`${studentId}:${topicId}`);
      byKey.delete(`${studentId}:${topicId}`);
      if (
        current &&
        current.score === data.score &&
        current.status === data.status &&
        current.examScore === data.examScore &&
        current.homeworkScore === data.homeworkScore &&
        current.attendanceScore === data.attendanceScore &&
        current.lessonScore === data.lessonScore &&
        JSON.stringify(current.evidence) === JSON.stringify(row.evidence)
      ) {
        continue;
      }
      writes.push(
        current
          ? prisma.topicMastery.update({ where: { id: current.id }, data })
          : prisma.topicMastery.create({ data: { studentId, topicId, ...data } }),
      );
    }
  }
  // Dalili qolmagan mavzular — o'chirilmaydi, "boshlanmagan" holatiga qaytadi
  const stale = [...byKey.values()].filter((row) => row.status !== 'NOT_STARTED' || row.score !== null);
  if (stale.length > 0) {
    writes.push(
      prisma.topicMastery.updateMany({
        where: { id: { in: stale.map((row) => row.id) } },
        data: { score: null, status: 'NOT_STARTED', examScore: null, homeworkScore: null, attendanceScore: null, lessonScore: null, evidence: { examQuestions: 0, homework: 0, sessions: 0, lessons: 0 }, calculatedAt: now },
      }),
    );
  }
  if (writes.length > 0) await prisma.$transaction(writes);
  return writes.length;
}

async function courseTopics(courseId: string) {
  return prisma.courseModule.findMany({
    where: { courseId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, title: true, topics: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } } },
  });
}

function average(values: Array<number | null>): number | null {
  const scored = values.filter((value): value is number => value !== null);
  return scored.length === 0 ? null : Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
}

/** O'quvchi kursining barcha mavzulari + saqlangan o'zlashtirish (ruxsat chaqiruvchida) */
export async function buildStudentMastery(studentId: string): Promise<StudentMasteryDto> {
  const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { courseId: true } });
  if (!student) throw AppError.notFound('O‘quvchi topilmadi');
  const [settings, modules, rows] = await Promise.all([
    getMasterySettings(),
    courseTopics(student.courseId),
    prisma.topicMastery.findMany({ where: { studentId } }),
  ]);
  const byTopic = new Map(rows.map((row) => [row.topicId, row]));
  const dtoModules = modules.map((module) => {
    const topics: TopicMasteryDto[] = module.topics.map((topic) => {
      const row = byTopic.get(topic.id);
      const evidence = (row?.evidence as Evidence | null) ?? { examQuestions: 0, homework: 0, sessions: 0, lessons: 0 };
      return {
        topicId: topic.id,
        title: topic.title,
        score: row?.score ?? null,
        // Holat saqlangan chegaralar bo'yicha; chegara o'zgarsa `updateSettings` qayta yozadi
        status: row?.status ?? 'NOT_STARTED',
        level: masteryLevel(row?.score ?? null, settings),
        sources: { exam: row?.examScore ?? null, homework: row?.homeworkScore ?? null, attendance: row?.attendanceScore ?? null, lessons: row?.lessonScore ?? null },
        evidence,
        calculatedAt: row?.calculatedAt.toISOString() ?? null,
      };
    });
    return { id: module.id, title: module.title, score: average(topics.map((topic) => topic.score)), topics };
  });
  const all = dtoModules.flatMap((module) => module.topics);
  const count = (status: MasteryStatus) => all.filter((topic) => topic.status === status).length;
  return {
    studentId,
    courseId: student.courseId,
    settings,
    overall: {
      score: average(all.map((topic) => topic.score)),
      mastered: count('MASTERED'),
      practicing: count('PRACTICING'),
      learning: count('LEARNING'),
      notStarted: count('NOT_STARTED'),
      topics: all.length,
    },
    modules: dtoModules,
  };
}

export const masteryService = {
  recalculate,

  /**
   * Hook: akademik hodisadan keyin (baholash, davomat, dars). Asosiy amalni **to'xtatmaydi** —
   * xato bo'lsa log qilinadi, tungi job baribir to'g'rilaydi.
   */
  async refresh(studentIds: string[]): Promise<void> {
    try {
      await recalculate(studentIds);
    } catch (error) {
      logger.error({ err: error, studentIds }, 'Mavzu o‘zlashtirishini yangilab bo‘lmadi');
    }
  },

  /** Tungi to'liq qayta hisob — faol o'quvchilar, bo'laklab */
  async recalculateAll(batchSize = 200): Promise<{ students: number; writes: number }> {
    let cursor: string | undefined;
    let students = 0;
    let writes = 0;
    for (;;) {
      const batch = await prisma.student.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true },
      });
      if (batch.length === 0) break;
      writes += await recalculate(batch.map((row) => row.id));
      students += batch.length;
      cursor = batch.at(-1)!.id;
    }
    return { students, writes };
  },

  /** Xodim: o'quvchi profili (ko'rinish — `studentService.getById`, o'qituvchi faqat o'z guruhi) */
  async forStudent(actor: AuthUser, studentId: string): Promise<StudentMasteryDto> {
    await studentService.getById(actor, studentId);
    return buildStudentMastery(studentId);
  },

  /** Guruh matritsasi: o'quvchi × mavzu */
  async forGroup(actor: AuthUser, groupId: string): Promise<GroupMasteryDto> {
    const access = await getTeachingAccess(actor);
    // Ko'rish so'rovi: begona yoki yo'q guruh — 404 (mavjudligi oshkor bo'lmaydi)
    const group = await assertGroupVisible(access, groupId).catch(() => {
      throw AppError.notFound('Guruh topilmadi');
    });
    const [settings, modules, students] = await Promise.all([
      getMasterySettings(),
      courseTopics(group.courseId),
      prisma.student.findMany({
        where: { groupId, deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const topics = modules.flatMap((module) => module.topics.map((topic) => ({ ...topic, moduleTitle: module.title })));
    const rows = await prisma.topicMastery.findMany({
      where: { studentId: { in: students.map((student) => student.id) }, topicId: { in: topics.map((topic) => topic.id) } },
      select: { studentId: true, topicId: true, score: true, status: true },
    });
    const cell = new Map(rows.map((row) => [`${row.studentId}:${row.topicId}`, row]));
    return {
      groupId,
      settings,
      topics: topics.map((topic) => {
        const scores = students.map((student) => cell.get(`${student.id}:${topic.id}`)?.score ?? null);
        return {
          id: topic.id,
          title: topic.title,
          moduleTitle: topic.moduleTitle,
          average: average(scores),
          mastered: students.filter((student) => cell.get(`${student.id}:${topic.id}`)?.status === 'MASTERED').length,
        };
      }),
      students: students.map((student) => {
        const cells = Object.fromEntries(
          topics.map((topic) => {
            const row = cell.get(`${student.id}:${topic.id}`);
            return [topic.id, { score: row?.score ?? null, status: row?.status ?? ('NOT_STARTED' as const) }];
          }),
        );
        return {
          id: student.id,
          fullName: `${student.lastName} ${student.firstName}`,
          overall: average(Object.values(cells).map((value) => value.score)),
          cells,
        };
      }),
    };
  },

  async settings(): Promise<MasterySettings> {
    return getMasterySettings();
  },

  /** Chegaralar/og'irliklar. Chegara o'zgarsa saqlangan holatlar darhol qayta yoziladi */
  async updateSettings(actor: AuthUser, input: MasterySettings, client: ClientInfo): Promise<MasterySettings> {
    const { developing, good, mastered } = input.thresholds;
    if (!(developing < good && good < mastered)) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'thresholds', message: 'Chegaralar o‘suvchi bo‘lsin: rivojlanmoqda < yaxshi < o‘zlashtirilgan' }]);
    }
    const weights = input.weights;
    if (weights.exam + weights.homework + weights.attendance + weights.lessons === 0 || weights.exam + weights.homework === 0) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'weights', message: 'Imtihon yoki vazifa og‘irligi 0 dan katta bo‘lsin' }]);
    }
    const before = await getMasterySettings();
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: MASTERY_SETTINGS_KEY },
        create: { key: MASTERY_SETTINGS_KEY, value: input as unknown as Prisma.InputJsonValue, description: 'Mavzu o‘zlashtirish chegaralari va og‘irliklari', updatedById: actor.id },
        update: { value: input as unknown as Prisma.InputJsonValue, updatedById: actor.id },
      });
      // Holat faqat bahoga bog'liq — chegaralar o'zgarsa uch so'rov bilan qayta yoziladi
      await tx.topicMastery.updateMany({ where: { score: { gte: mastered } }, data: { status: 'MASTERED' } });
      await tx.topicMastery.updateMany({ where: { score: { gte: good, lt: mastered } }, data: { status: 'PRACTICING' } });
      await tx.topicMastery.updateMany({ where: { score: { lt: good } }, data: { status: 'LEARNING' } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'mastery.settings_updated',
        entityType: 'setting',
        entityId: MASTERY_SETTINGS_KEY,
        metadata: { before, after: input } as unknown as Prisma.InputJsonValue,
        ...client,
      });
    });
    const weightsChanged = JSON.stringify(before.weights) !== JSON.stringify(input.weights);
    // Og'irlik o'zgarsa baholar ham o'zgaradi — fon rejimida to'liq qayta hisob
    if (weightsChanged) void masteryService.recalculateAll().catch((error: unknown) => logger.error({ err: error }, 'Mastery qayta hisobida xatolik'));
    return getMasterySettings();
  },
};
