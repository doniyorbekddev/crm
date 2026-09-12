import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { HomeworkStatus, Prisma, SubmissionStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  BulkGradeInput,
  CreateHomeworkInput,
  GradeSubmissionInput,
  HomeworkListQuery,
  UpdateHomeworkInput,
} from '../validators/homework.validator.js';
import { auditService } from './audit.service.js';
import { gamificationHooks } from './gamification.service.js';
import { permissionService } from './permission.service.js';

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface HomeworkDto {
  id: string;
  title: string;
  description: string | null;
  status: HomeworkStatus;
  assignedAt: string;
  deadline: string;
  maxPoints: number;
  xpReward: number;
  attachmentPath: string | null;
  /** Muddati o‘tgan va yopilmagan */
  isOverdue: boolean;
  course: { id: string; name: string } | null;
  group: { id: string; name: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
  stats: {
    students: number;
    submitted: number;
    graded: number;
    pending: number;
    missed: number;
    /** Topshirganlar ulushi (%) */
    submissionRate: number;
    averageScore: number;
  };
}

export interface SubmissionDto {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  score: number | null;
  feedback: string | null;
  xpAwarded: number;
  gradedBy: { id: string; firstName: string; lastName: string } | null;
  gradedAt: string | null;
}

export interface HomeworkDetailDto extends HomeworkDto {
  submissions: SubmissionDto[];
}

export interface TeachingAccess {
  userId: string;
  /** Barcha guruhlar bilan ishlay oladi (admin, owner) */
  canManageAll: boolean;
  /** O‘qituvchi faqat o‘z guruhlari bilan ishlaydi */
  onlyOwnGroups: boolean;
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const homeworkSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  assignedAt: true,
  deadline: true,
  maxPoints: true,
  xpReward: true,
  attachmentPath: true,
  course: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  submissions: {
    select: {
      status: true,
      score: true,
      submittedAt: true,
      feedback: true,
      xpAwarded: true,
      gradedAt: true,
      gradedBy: { select: { id: true, firstName: true, lastName: true } },
      student: { select: { id: true, number: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.HomeworkSelect;

type HomeworkRecord = Prisma.HomeworkGetPayload<{ select: typeof homeworkSelect }>;

const SUBMITTED_STATUSES: readonly SubmissionStatus[] = ['SUBMITTED', 'LATE', 'GRADED'];

function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayStart(value: string): Date {
  return new Date(dayStart(value).getTime() + 86_400_000);
}

function toDto(homework: HomeworkRecord): HomeworkDto {
  const submissions = homework.submissions;
  const submitted = submissions.filter((row) => SUBMITTED_STATUSES.includes(row.status)).length;
  const graded = submissions.filter((row) => row.status === 'GRADED').length;
  const missed = submissions.filter((row) => row.status === 'MISSED').length;
  const scores = submissions.flatMap((row) => (row.score === null ? [] : [row.score]));

  return {
    id: homework.id,
    title: homework.title,
    description: homework.description,
    status: homework.status,
    assignedAt: homework.assignedAt.toISOString(),
    deadline: homework.deadline.toISOString(),
    maxPoints: homework.maxPoints,
    xpReward: homework.xpReward,
    attachmentPath: homework.attachmentPath,
    isOverdue: homework.status !== 'CLOSED' && homework.deadline.getTime() < Date.now(),
    course: homework.course,
    group: homework.group,
    teacher: homework.teacher,
    stats: {
      students: submissions.length,
      submitted,
      graded,
      pending: submissions.filter((row) => row.status === 'PENDING').length,
      missed,
      submissionRate: submissions.length === 0 ? 0 : Math.round((submitted / submissions.length) * 100),
      averageScore: scores.length === 0 ? 0 : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    },
  };
}

function toDetailDto(homework: HomeworkRecord): HomeworkDetailDto {
  return {
    ...toDto(homework),
    submissions: homework.submissions
      .map((row) => ({
        studentId: row.student.id,
        code: formatStudentNumber(row.student.number),
        firstName: row.student.firstName,
        lastName: row.student.lastName,
        status: row.status,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        score: row.score,
        feedback: row.feedback,
        xpAwarded: row.xpAwarded,
        gradedBy: row.gradedBy,
        gradedAt: row.gradedAt?.toISOString() ?? null,
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)),
  };
}

/** O‘qituvchi faqat o‘z guruhlari bilan ishlaydi, admin — hammasi bilan */
export async function getTeachingAccess(actor: AuthUser): Promise<TeachingAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  const canManageAll = permissions.has(PERMISSIONS.GROUP_MANAGE);
  return { userId: actor.id, canManageAll, onlyOwnGroups: !canManageAll };
}

export async function assertGroupVisible(
  access: TeachingAccess,
  groupId: string,
): Promise<{ id: string; name: string; courseId: string; teacherId: string | null }> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, courseId: true, teacherId: true },
  });
  if (!group || (access.onlyOwnGroups && group.teacherId !== access.userId)) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'groupId', message: 'Guruh topilmadi' }]);
  }
  return group;
}

/** Vazifa e’lon qilinganda guruhdagi har bir faol o‘quvchiga bo‘sh topshiriq ochiladi */
async function ensureSubmissions(tx: Prisma.TransactionClient, homeworkId: string, groupId: string): Promise<number> {
  const students = await tx.student.findMany({
    where: { groupId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  });
  if (students.length === 0) return 0;

  await tx.homeworkSubmission.createMany({
    data: students.map((student) => ({ homeworkId, studentId: student.id })),
    skipDuplicates: true,
  });
  return students.length;
}

function buildWhere(access: TeachingAccess, query: HomeworkListQuery): Prisma.HomeworkWhereInput {
  const conditions: Prisma.HomeworkWhereInput[] = [];
  if (access.onlyOwnGroups) conditions.push({ group: { teacherId: access.userId } });
  if (query.groupId) conditions.push({ groupId: query.groupId });
  if (query.courseId) conditions.push({ courseId: query.courseId });
  if (query.teacherId) conditions.push({ OR: [{ teacherId: query.teacherId }, { group: { teacherId: query.teacherId } }] });
  if (query.status) conditions.push({ status: query.status });
  if (query.from) conditions.push({ deadline: { gte: dayStart(query.from) } });
  if (query.to) conditions.push({ deadline: { lt: nextDayStart(query.to) } });

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

async function findVisible(access: TeachingAccess, id: string): Promise<HomeworkRecord> {
  const homework = await prisma.homework.findFirst({
    where: { id, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
    select: homeworkSelect,
  });
  if (!homework) {
    throw AppError.notFound('Uy vazifasi topilmadi');
  }
  return homework;
}

/** Ball qo‘yilsa holat GRADED bo‘ladi; muddatdan keyin topshirilsa — LATE */
function resolveStatus(
  current: SubmissionStatus,
  input: { status?: SubmissionStatus; score?: number },
  deadlinePassed: boolean,
): SubmissionStatus {
  if (input.status) return input.status;
  if (input.score !== undefined) return 'GRADED';
  if (current === 'PENDING') return deadlinePassed ? 'LATE' : 'SUBMITTED';
  return current;
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

export const homeworkService = {
  async list(actor: AuthUser, query: HomeworkListQuery): Promise<{ items: HomeworkDto[]; total: number }> {
    const access = await getTeachingAccess(actor);
    const where = buildWhere(access, query);
    const items = await prisma.homework.findMany({
      where,
      select: homeworkSelect,
      orderBy:
        query.sortBy === 'title'
          ? [{ title: query.sortOrder }]
          : query.sortBy === 'assignedAt'
            ? [{ assignedAt: query.sortOrder }]
            : [{ deadline: query.sortOrder }, { createdAt: 'desc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.homework.count({ where });
    return { items: items.map(toDto), total };
  },

  async getById(actor: AuthUser, id: string): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    return toDetailDto(await findVisible(access, id));
  },

  async create(actor: AuthUser, input: CreateHomeworkInput, client: ClientInfo): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    const group = await assertGroupVisible(access, input.groupId);

    const id = await prisma.$transaction(async (tx) => {
      const homework = await tx.homework.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          groupId: group.id,
          courseId: group.courseId,
          teacherId: group.teacherId ?? actor.id,
          deadline: input.deadline,
          maxPoints: input.maxPoints,
          xpReward: input.xpReward,
          status: input.status,
        },
        select: { id: true },
      });

      const students = input.status === 'PUBLISHED' ? await ensureSubmissions(tx, homework.id, group.id) : 0;

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.created',
        entityType: 'homework',
        entityId: homework.id,
        metadata: { title: input.title, group: group.name, deadline: input.deadline.toISOString(), students },
        ...client,
      });
      return homework.id;
    });

    return this.getById(actor, id);
  },

  async update(actor: AuthUser, id: string, input: UpdateHomeworkInput, client: ClientInfo): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);

    await prisma.$transaction(async (tx) => {
      await tx.homework.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
          ...(input.maxPoints === undefined ? {} : { maxPoints: input.maxPoints }),
          ...(input.xpReward === undefined ? {} : { xpReward: input.xpReward }),
          ...(input.status === undefined ? {} : { status: input.status }),
        },
      });

      // Qoralamadan e'lon qilinganda o‘quvchilar ro‘yxati ochiladi
      if (input.status === 'PUBLISHED' && homework.status === 'DRAFT') {
        await ensureSubmissions(tx, id, homework.group.id);
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.updated',
        entityType: 'homework',
        entityId: id,
        metadata: { title: input.title ?? homework.title, status: input.status ?? homework.status },
        ...client,
      });
    });

    return this.getById(actor, id);
  },

  /** Baholangan vazifa o‘chirilmaydi — XP allaqachon berilgan */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);
    if (homework.submissions.some((row) => row.status === 'GRADED')) {
      throw AppError.conflict('Baholangan uy vazifasini o‘chirib bo‘lmaydi — uni yoping (CLOSED)');
    }

    await prisma.$transaction(async (tx) => {
      await tx.homework.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.deleted',
        entityType: 'homework',
        entityId: id,
        metadata: { title: homework.title, group: homework.group.name },
        ...client,
      });
    });
  },

  /** Bitta o‘quvchining topshirig‘i: holat, ball, izoh va XP */
  async grade(
    actor: AuthUser,
    id: string,
    studentId: string,
    input: GradeSubmissionInput,
    client: ClientInfo,
  ): Promise<HomeworkDetailDto> {
    return this.bulkGrade(actor, id, { records: [{ studentId, ...input }] }, client);
  },

  /**
   * Butun guruhni bir marta baholaydi. Topshirgan o‘quvchiga XP beriladi
   * (kechikkaniga berilmaydi), ball qo‘yilsa holat avtomatik GRADED bo‘ladi.
   */
  async bulkGrade(actor: AuthUser, id: string, input: BulkGradeInput, client: ClientInfo): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);
    if (homework.status === 'DRAFT') {
      throw AppError.unprocessable('Avval uy vazifasini e’lon qiling');
    }

    const known = new Map(homework.submissions.map((row) => [row.student.id, row]));
    for (const record of input.records) {
      if (!known.has(record.studentId)) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'studentId', message: 'O‘quvchi bu vazifaga biriktirilmagan' },
        ]);
      }
      if (record.score !== undefined && record.score > homework.maxPoints) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'score', message: `Ball ${homework.maxPoints} dan oshmasligi kerak` },
        ]);
      }
    }

    const deadlinePassed = homework.deadline.getTime() < Date.now();
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const record of input.records) {
        const current = known.get(record.studentId);
        if (!current) continue;
        const status = resolveStatus(current.status, record, deadlinePassed);
        const submittedAt = SUBMITTED_STATUSES.includes(status) ? (current.submittedAt ?? now) : null;

        const submission = await tx.homeworkSubmission.update({
          where: { homeworkId_studentId: { homeworkId: id, studentId: record.studentId } },
          data: {
            status,
            submittedAt,
            ...(record.score === undefined ? {} : { score: record.score }),
            ...(record.feedback === undefined ? {} : { feedback: record.feedback }),
            ...(record.score === undefined ? {} : { gradedById: actor.id, gradedAt: now }),
          },
          select: { id: true },
        });

        // XP faqat topshirgan o‘quvchiga; qayta baholansa dedupeKey takrorlamaydi
        if (SUBMITTED_STATUSES.includes(status)) {
          const points = await gamificationHooks.onHomeworkSubmitted(tx, {
            studentId: record.studentId,
            submissionId: submission.id,
            onTime: status !== 'LATE',
          });
          await tx.homeworkSubmission.update({ where: { id: submission.id }, data: { xpAwarded: points } });
        }
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.graded',
        entityType: 'homework',
        entityId: id,
        metadata: { title: homework.title, group: homework.group.name, students: input.records.length },
        ...client,
      });
    });

    return this.getById(actor, id);
  },
};
