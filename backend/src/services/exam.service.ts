import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ExamStatus, ExamType } from '../generated/prisma/client.js';
import type { Blueprint } from './examBlueprint.js';
import { BlueprintShortageError, generateVariant, planCells } from './examBlueprint.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CreateExamInput,
  ExamListQuery,
  SaveExamResultsInput,
  UpdateExamInput,
} from '../validators/homework.validator.js';
import { auditService } from './audit.service.js';
import { masteryService } from './mastery.service.js';
import { notifyExamResult, notifyExamScheduled } from './studentNotify.service.js';
import { dateColumn } from '../utils/dates.js';
import { gamificationHooks } from './gamification.service.js';
import { assertGroupVisible, getTeachingAccess } from './teachingAccess.js';
import type { TeachingAccess } from './homework.service.js';

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface ExamDto {
  id: string;
  title: string;
  description: string | null;
  status: ExamStatus;
  date: string;
  maxScore: number;
  passScore: number | null;
  /** Vaqt chegarasi (daqiqa) — bo‘sh bo‘lsa cheklanmagan */
  durationMinutes: number | null;
  /** Ruxsat etilgan urinishlar (0 — cheklanmagan) */
  maxAttempts: number;
  xpReward: number;
  type: ExamType;
  isOnline: boolean;
  startAt: string | null;
  endAt: string | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  blueprint: Blueprint | null;
  questionCount: number;
  course: { id: string; name: string } | null;
  group: { id: string; name: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
  stats: {
    students: number;
    graded: number;
    averageScore: number;
    averagePercentage: number;
    /** O‘tish balidan yuqori natijalar ulushi (%) */
    passRate: number;
    highest: number;
    lowest: number;
  };
}

export interface ExamResultDto {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  score: number | null;
  percentage: number | null;
  grade: string | null;
  comment: string | null;
  passed: boolean | null;
  xpAwarded: number;
  gradedAt: string | null;
  gradedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface ExamDetailDto extends ExamDto {
  results: ExamResultDto[];
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const examSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  date: true,
  maxScore: true,
  passScore: true,
  durationMinutes: true,
  maxAttempts: true,
  type: true,
  isOnline: true,
  startAt: true,
  endAt: true,
  shuffleQuestions: true,
  shuffleOptions: true,
  blueprint: true,
  _count: { select: { questions: true } },
  xpReward: true,
  groupId: true,
  course: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  results: {
    select: {
      score: true,
      percentage: true,
      grade: true,
      comment: true,
      xpAwarded: true,
      gradedAt: true,
      gradedBy: { select: { id: true, firstName: true, lastName: true } },
      student: { select: { id: true, number: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.ExamSelect;

type ExamRecord = Prisma.ExamGetPayload<{ select: typeof examSelect }>;

/** Foizdan baho: 90+ A, 80+ B, 70+ C, 60+ D, qolgani F */
export function gradeLetter(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDto(exam: ExamRecord, students: number): ExamDto {
  const scores = exam.results.map((row) => row.score);
  const percentages = exam.results.map((row) => row.percentage);
  const passThreshold = exam.passScore;
  const passed = passThreshold === null ? 0 : exam.results.filter((row) => row.score >= passThreshold).length;

  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    status: exam.status,
    date: toDateOnly(exam.date),
    maxScore: exam.maxScore,
    passScore: exam.passScore,
    durationMinutes: exam.durationMinutes,
    maxAttempts: exam.maxAttempts,
    type: exam.type,
    isOnline: exam.isOnline,
    startAt: exam.startAt?.toISOString() ?? null,
    endAt: exam.endAt?.toISOString() ?? null,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    blueprint: (exam.blueprint as Blueprint | null) ?? null,
    questionCount: exam._count.questions,
    xpReward: exam.xpReward,
    course: exam.course,
    group: exam.group,
    teacher: exam.teacher,
    stats: {
      students,
      graded: exam.results.length,
      averageScore: scores.length === 0 ? 0 : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
      averagePercentage:
        percentages.length === 0 ? 0 : Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
      passRate: exam.results.length === 0 || passThreshold === null ? 0 : Math.round((passed / exam.results.length) * 100),
      highest: scores.length === 0 ? 0 : Math.max(...scores),
      lowest: scores.length === 0 ? 0 : Math.min(...scores),
    },
  };
}

/** Natijasi yo‘q o‘quvchilar ham ro‘yxatda ko‘rinadi — baho qo‘yish uchun */
function toDetailDto(
  exam: ExamRecord,
  students: Array<{ id: string; number: number; firstName: string; lastName: string }>,
): ExamDetailDto {
  const byStudent = new Map(exam.results.map((row) => [row.student.id, row]));
  const known = new Set(students.map((student) => student.id));
  const extra = exam.results.filter((row) => !known.has(row.student.id)).map((row) => row.student);

  const results: ExamResultDto[] = [...students, ...extra]
    .map((student) => {
      const result = byStudent.get(student.id);
      return {
        studentId: student.id,
        code: formatStudentNumber(student.number),
        firstName: student.firstName,
        lastName: student.lastName,
        score: result?.score ?? null,
        percentage: result?.percentage ?? null,
        grade: result?.grade ?? null,
        comment: result?.comment ?? null,
        passed: result && exam.passScore !== null ? result.score >= exam.passScore : null,
        xpAwarded: result?.xpAwarded ?? 0,
        gradedAt: result?.gradedAt?.toISOString() ?? null,
        gradedBy: result?.gradedBy ?? null,
      };
    })
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));

  return { ...toDto(exam, students.length), results };
}

async function groupStudents(groupId: string) {
  return prisma.student.findMany({
    where: { groupId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, number: true, firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

function buildWhere(access: TeachingAccess, query: ExamListQuery): Prisma.ExamWhereInput {
  const conditions: Prisma.ExamWhereInput[] = [];
  if (access.onlyOwnGroups) conditions.push({ group: { teacherId: access.userId } });
  if (query.groupId) conditions.push({ groupId: query.groupId });
  if (query.courseId) conditions.push({ courseId: query.courseId });
  if (query.teacherId) conditions.push({ OR: [{ teacherId: query.teacherId }, { group: { teacherId: query.teacherId } }] });
  if (query.status) conditions.push({ status: query.status });
  if (query.from) conditions.push({ date: { gte: dayStart(query.from) } });
  if (query.to) conditions.push({ date: { lte: dayStart(query.to) } });

  const search = query.search?.trim();
  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { group: { name: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  return { AND: conditions };
}

async function findVisible(access: TeachingAccess, id: string): Promise<ExamRecord> {
  const exam = await prisma.exam.findFirst({
    where: { id, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
    select: examSelect,
  });
  if (!exam) {
    throw AppError.notFound('Imtihon topilmadi');
  }
  return exam;
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

/** Topshirish oynasi: tugash boshlanishdan keyin bo'lishi kerak */
function assertWindow(startAt: Date | null, endAt: Date | null): void {
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'endAt', message: 'Tugash vaqti boshlanishdan keyin bo‘lishi kerak' }]);
  }
}

/** Blueprint mavzulari imtihon kursiga tegishlimi */
async function assertBlueprintTopics(courseId: string, blueprint: Blueprint): Promise<void> {
  if (blueprint.topics.length === 0) return;
  const found = await prisma.courseTopic.count({ where: { id: { in: blueprint.topics.map((topic) => topic.topicId) }, module: { courseId } } });
  if (found !== blueprint.topics.length) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'blueprint', message: 'Blueprint mavzulari imtihon kursiga tegishli emas' }]);
  }
}

/**
 * TZ 3.0 §42 "Exam scheduled": faqat kelgusi (bugun yoki keyin) rejalashtirilgan imtihon —
 * o'tgan sanali imtihonga natija kiritilganda "rejalashtirildi" xabari ketmaydi.
 */
async function announceIfUpcoming(examId: string): Promise<void> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { date: true, status: true } });
  if (!exam || exam.status !== 'PLANNED' || exam.date.getTime() < dateColumn(new Date()).getTime()) return;
  await prisma.$transaction((tx) => notifyExamScheduled(tx, examId));
}

export interface BlueprintPreviewDto {
  poolSize: number;
  feasible: boolean;
  message: string | null;
  cells: Array<{ topicId: string | null; topicTitle: string; difficulty: string | null; target: number; available: number }>;
}

export const examService = {
  /**
   * Blueprint oldindan ko'rish: har mavzu × qiyinlik katagida kerakli va bankdagi savollar soni.
   * `feasible` — haqiqiy variant generatsiyasi bilan tekshiriladi (to'ldirish qoidalari hisobga olinadi).
   */
  async previewBlueprint(actor: AuthUser, groupId: string, blueprint: Blueprint): Promise<BlueprintPreviewDto> {
    const access = await getTeachingAccess(actor);
    const group = await assertGroupVisible(access, groupId);
    await assertBlueprintTopics(group.courseId, blueprint);
    const pool = await prisma.question.findMany({ where: { courseId: group.courseId, isActive: true }, select: { id: true, topicId: true, difficulty: true } });
    const topics = await prisma.courseTopic.findMany({ where: { id: { in: blueprint.topics.map((topic) => topic.topicId) } }, select: { id: true, title: true } });
    const titles = new Map(topics.map((topic) => [topic.id, topic.title]));
    const allowed = blueprint.topics.length > 0 ? new Set(blueprint.topics.map((topic) => topic.topicId)) : null;
    const eligible = pool.filter((question) => allowed === null || (question.topicId !== null && allowed.has(question.topicId)));
    let feasible = true;
    let message: string | null = null;
    try {
      generateVariant(pool, blueprint);
    } catch (error) {
      if (!(error instanceof BlueprintShortageError)) throw error;
      feasible = false;
      message = error.message;
    }
    return {
      poolSize: eligible.length,
      feasible,
      message,
      cells: planCells(blueprint, eligible).map((cell) => ({
        topicId: cell.topicId,
        topicTitle: cell.topicId ? (titles.get(cell.topicId) ?? 'Mavzu') : 'Barcha mavzular',
        difficulty: cell.difficulty,
        target: cell.target,
        available: cell.available,
      })),
    };
  },

  async list(actor: AuthUser, query: ExamListQuery): Promise<{ items: ExamDto[]; total: number }> {
    const access = await getTeachingAccess(actor);
    const where = buildWhere(access, query);
    const exams = await prisma.exam.findMany({
      where,
      select: examSelect,
      orderBy: query.sortBy === 'title' ? [{ title: query.sortOrder }] : [{ date: query.sortOrder }, { createdAt: 'desc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.exam.count({ where });

    const counts = await prisma.student.groupBy({
      by: ['groupId'],
      where: { deletedAt: null, status: 'ACTIVE', groupId: { in: exams.map((exam) => exam.groupId) } },
      _count: { _all: true },
    });
    const studentsByGroup = new Map(counts.map((row) => [row.groupId, row._count._all]));

    return { items: exams.map((exam) => toDto(exam, studentsByGroup.get(exam.groupId) ?? 0)), total };
  },

  async getById(actor: AuthUser, id: string): Promise<ExamDetailDto> {
    const access = await getTeachingAccess(actor);
    const exam = await findVisible(access, id);
    return toDetailDto(exam, await groupStudents(exam.groupId));
  },

  async create(actor: AuthUser, input: CreateExamInput, client: ClientInfo): Promise<ExamDetailDto> {
    const access = await getTeachingAccess(actor);
    const group = await assertGroupVisible(access, input.groupId);
    if (input.passScore !== undefined && input.passScore > input.maxScore) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'passScore', message: 'O‘tish bali maksimal balldan katta bo‘lmasligi kerak' },
      ]);
    }

    assertWindow(input.startAt ?? null, input.endAt ?? null);
    if (input.blueprint) await assertBlueprintTopics(group.courseId, input.blueprint);

    const exam = await prisma.exam.create({
      data: {
        type: input.type ?? 'MONTHLY_EXAM',
        isOnline: input.isOnline ?? false,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        shuffleQuestions: input.shuffleQuestions ?? false,
        shuffleOptions: input.shuffleOptions ?? false,
        ...(input.blueprint ? { blueprint: input.blueprint } : {}),
        title: input.title,
        description: input.description ?? null,
        groupId: group.id,
        courseId: group.courseId,
        teacherId: group.teacherId ?? actor.id,
        date: dayStart(input.date),
        maxScore: input.maxScore,
        passScore: input.passScore ?? null,
        durationMinutes: input.durationMinutes ?? null,
        maxAttempts: input.maxAttempts,
        xpReward: input.xpReward,
        status: input.status,
      },
      select: { id: true },
    });
    await auditService.record({
      userId: actor.id,
      action: 'exam.created',
      entityType: 'exam',
      entityId: exam.id,
      metadata: { title: input.title, group: group.name, date: input.date, maxScore: input.maxScore },
      ...client,
    });
    await announceIfUpcoming(exam.id);

    return this.getById(actor, exam.id);
  },

  async update(actor: AuthUser, id: string, input: UpdateExamInput, client: ClientInfo): Promise<ExamDetailDto> {
    const access = await getTeachingAccess(actor);
    const exam = await findVisible(access, id);
    const maxScore = input.maxScore ?? exam.maxScore;
    if (input.passScore !== undefined && input.passScore !== null && input.passScore > maxScore) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'passScore', message: 'O‘tish bali maksimal balldan katta bo‘lmasligi kerak' },
      ]);
    }
    if (input.maxScore !== undefined && exam.results.length > 0 && input.maxScore !== exam.maxScore) {
      throw AppError.conflict('Natijalar kiritilgan — maksimal ballni o‘zgartirib bo‘lmaydi');
    }

    const startAt = input.startAt === undefined ? exam.startAt : input.startAt;
    const endAt = input.endAt === undefined ? exam.endAt : input.endAt;
    assertWindow(startAt, endAt);
    if (input.blueprint) {
      const owner = await prisma.exam.findUniqueOrThrow({ where: { id }, select: { courseId: true, group: { select: { courseId: true } } } });
      await assertBlueprintTopics(owner.courseId ?? owner.group.courseId, input.blueprint);
    }
    // Boshlangan imtihonda variant qoidasi o'zgarmaydi — o'quvchilar teng sharoitda bo'lsin
    if (input.blueprint !== undefined && (await prisma.examAttempt.count({ where: { examId: id } })) > 0) {
      throw AppError.unprocessable('Imtihon boshlangan — blueprintni o‘zgartirib bo‘lmaydi');
    }

    await prisma.exam.update({
      where: { id },
      data: {
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.isOnline === undefined ? {} : { isOnline: input.isOnline }),
        ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
        ...(input.endAt === undefined ? {} : { endAt: input.endAt }),
        ...(input.shuffleQuestions === undefined ? {} : { shuffleQuestions: input.shuffleQuestions }),
        ...(input.shuffleOptions === undefined ? {} : { shuffleOptions: input.shuffleOptions }),
        ...(input.blueprint === undefined ? {} : { blueprint: input.blueprint ?? Prisma.DbNull }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.date === undefined ? {} : { date: dayStart(input.date) }),
        ...(input.maxScore === undefined ? {} : { maxScore: input.maxScore }),
        ...(input.passScore === undefined ? {} : { passScore: input.passScore }),
        ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
        ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
        ...(input.xpReward === undefined ? {} : { xpReward: input.xpReward }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
    });
    await auditService.record({
      userId: actor.id,
      action: 'exam.updated',
      entityType: 'exam',
      entityId: id,
      metadata: { title: input.title ?? exam.title, status: input.status ?? exam.status },
      ...client,
    });

    // Sana, oyna yoki holat o'zgardi — kelgusi imtihon haqida qayta xabar (dedupe sana bo'yicha)
    if (input.date !== undefined || input.startAt !== undefined || input.status !== undefined) await announceIfUpcoming(id);

    // Bekor qilingan imtihon o'zlashtirishga kirmaydi — holat o'zgarsa qayta hisoblanadi
    if (input.status !== undefined && (input.status === 'CANCELLED') !== (exam.status === 'CANCELLED')) {
      const graded = await prisma.examAttempt.findMany({ where: { examId: id, status: 'GRADED' }, select: { studentId: true }, distinct: ['studentId'] });
      await masteryService.refresh(graded.map((row) => row.studentId));
    }
    return this.getById(actor, id);
  },

  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getTeachingAccess(actor);
    const exam = await findVisible(access, id);
    if (exam.results.length > 0) {
      throw AppError.conflict('Natijalari bor imtihonni o‘chirib bo‘lmaydi — uni bekor qiling (CANCELLED)');
    }

    await prisma.$transaction(async (tx) => {
      await tx.exam.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'exam.deleted',
        entityType: 'exam',
        entityId: id,
        metadata: { title: exam.title, group: exam.group.name },
        ...client,
      });
    });
  },

  /**
   * Natijalarni saqlaydi: foiz va baho avtomatik hisoblanadi,
   * yuqori natijaga XP beriladi (qayta saqlansa takrorlanmaydi).
   */
  async saveResults(
    actor: AuthUser,
    id: string,
    input: SaveExamResultsInput,
    client: ClientInfo,
  ): Promise<ExamDetailDto> {
    const access = await getTeachingAccess(actor);
    const exam = await findVisible(access, id);
    if (exam.status === 'CANCELLED') {
      throw AppError.unprocessable('Bekor qilingan imtihonga natija kiritilmaydi');
    }

    const students = await groupStudents(exam.groupId);
    const known = new Set(students.map((student) => student.id));
    for (const record of input.records) {
      if (!known.has(record.studentId)) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'studentId', message: 'O‘quvchi bu guruhda emas' },
        ]);
      }
      if (record.score > exam.maxScore) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'score', message: `Ball ${exam.maxScore} dan oshmasligi kerak` },
        ]);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const record of input.records) {
        const percentage = Math.round((record.score / exam.maxScore) * 100);
        const result = await tx.examResult.upsert({
          where: { examId_studentId: { examId: id, studentId: record.studentId } },
          update: {
            score: record.score,
            percentage,
            grade: gradeLetter(percentage),
            comment: record.comment ?? null,
            gradedById: actor.id,
            gradedAt: new Date(),
          },
          create: {
            examId: id,
            studentId: record.studentId,
            score: record.score,
            percentage,
            grade: gradeLetter(percentage),
            comment: record.comment ?? null,
            gradedById: actor.id,
          },
          select: { id: true },
        });

        const points = await gamificationHooks.onExamGraded(tx, {
          studentId: record.studentId,
          resultId: result.id,
          percentage,
        });
        await tx.examResult.update({ where: { id: result.id }, data: { xpAwarded: points } });
        await notifyExamResult(tx, { examId: id, studentId: record.studentId });
      }

      // Hamma o‘quvchi baholansa — imtihon yakunlangan hisoblanadi
      const graded = await tx.examResult.count({ where: { examId: id } });
      const status: ExamStatus = graded >= students.length && students.length > 0 ? 'GRADED' : 'HELD';
      await tx.exam.update({ where: { id }, data: { status } });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'exam.graded',
        entityType: 'exam',
        entityId: id,
        metadata: { title: exam.title, group: exam.group.name, students: input.records.length, status },
        ...client,
      });
    });

    return this.getById(actor, id);
  },
};
