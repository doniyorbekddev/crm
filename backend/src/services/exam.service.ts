import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { ExamStatus, Prisma } from '../generated/prisma/client.js';
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
import { gamificationHooks } from './gamification.service.js';
import { assertGroupVisible, getTeachingAccess } from './homework.service.js';
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

export const examService = {
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

    const exam = await prisma.exam.create({
      data: {
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

    await prisma.exam.update({
      where: { id },
      data: {
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
