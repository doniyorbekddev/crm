import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Prisma, TopicProgressStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CreateModuleInput,
  CreateTopicInput,
  MarkTopicInput,
  UpdateModuleInput,
  UpdateTopicInput,
} from '../validators/curriculum.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';

/**
 * Kurrikulum: Kurs → Modul → Mavzu va o'quvchi progressi.
 *
 * Progress hisobi: `StudentTopicProgress` yozuvi **faqat holat o'zgarganda** yaratiladi.
 * Yozuvi yo'q mavzu `NOT_STARTED` deb hisoblanadi — shunda 1000 o'quvchi × 100 mavzu =
 * 100 000 bo'sh qator yaratilmaydi, faqat haqiqiy o'zgarishlar saqlanadi.
 */

export interface TopicDto {
  id: string;
  title: string;
  description: string | null;
  lessonCount: number;
  sortOrder: number;
  isActive: boolean;
  /** Shu mavzuni tugatgan o'quvchilar soni (kurs bo'yicha umumiy ko'rinishda) */
  completedCount?: number;
}

export interface ModuleDto {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  topics: TopicDto[];
}

export interface CurriculumDto {
  courseId: string;
  courseName: string;
  modules: ModuleDto[];
  /** Faol mavzular soni — progress maxraji */
  totalTopics: number;
  totalLessons: number;
}

export interface TopicProgressDto {
  topicId: string;
  topicTitle: string;
  moduleTitle: string;
  status: TopicProgressStatus;
  completedAt: string | null;
}

export interface StudentCurriculumProgressDto {
  courseId: string;
  courseName: string;
  /** 0–100 */
  percent: number;
  completed: number;
  total: number;
  modules: Array<{
    id: string;
    title: string;
    percent: number;
    completed: number;
    total: number;
    topics: TopicProgressDto[];
  }>;
}

const moduleSelect = {
  id: true,
  title: true,
  description: true,
  sortOrder: true,
  isActive: true,
  topics: {
    orderBy: [{ sortOrder: 'asc' as const }, { title: 'asc' as const }],
    select: {
      id: true,
      title: true,
      description: true,
      lessonCount: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { progress: { where: { status: 'COMPLETED' as const } } } },
    },
  },
} satisfies Prisma.CourseModuleSelect;

/** Ro'yxatdagi oxirgi tartibdan keyingi raqam */
async function nextSortOrder(kind: 'module' | 'topic', parentId: string): Promise<number> {
  const last =
    kind === 'module'
      ? await prisma.courseModule.findFirst({ where: { courseId: parentId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
      : await prisma.courseTopic.findFirst({ where: { moduleId: parentId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  return (last?.sortOrder ?? -1) + 1;
}

async function assertCourse(courseId: string): Promise<{ id: string; name: string }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } });
  if (!course) throw AppError.notFound('Kurs topilmadi');
  return course;
}

/** O'qituvchi faqat o'z guruhlari o'quvchilariga mavzu belgilay oladi */
async function assertCanMark(actor: AuthUser, studentIds: string[]): Promise<void> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  if (permissions.has(PERMISSIONS.COURSE_MANAGE) || permissions.has(PERMISSIONS.GROUP_MANAGE)) return;

  // DIQQAT: `NOT: { group: { teacherId } }` ishlatib bo'lmaydi — guruhda o'qituvchi biriktirilmagan
  // bo'lsa (NULL) SQL solishtiruvi NULL qaytaradi va tekshiruv jimgina o'tib ketadi.
  // Shuning uchun qiymatlar o'qib olinib, aniq solishtiriladi.
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, deletedAt: null },
    select: { id: true, group: { select: { teacherId: true } } },
  });
  const foreign = students.filter((student) => student.group?.teacherId !== actor.id);
  if (foreign.length > 0) {
    throw AppError.forbidden('Faqat o‘z guruhingiz o‘quvchilariga mavzu belgilay olasiz');
  }
}

/**
 * Dars sessiyasiga bog'langan kurs mavzusi shu guruh kursiniki ekanini tekshiradi
 * (begona kurs mavzusi bilan progress buzilmasin).
 */
export async function assertTopicForGroup(topicId: string, groupId: string): Promise<void> {
  const [topic, group] = await Promise.all([
    prisma.courseTopic.findFirst({ where: { id: topicId, isActive: true }, select: { module: { select: { courseId: true } } } }),
    prisma.group.findUnique({ where: { id: groupId }, select: { courseId: true } }),
  ]);
  if (!topic || !group || topic.module.courseId !== group.courseId) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'topicId', message: 'Mavzu bu guruh kursiga tegishli emas' }]);
  }
}

/**
 * Darsda mavzu o'tildi: kelgan (PRESENT/LATE) o'quvchilarda mavzu "o'rganilmoqda" bo'ladi.
 * Allaqachon boshlangan yoki tugatilgan mavzu **o'zgarmaydi** (`skipDuplicates`) —
 * "tugatildi" ni faqat o'qituvchi qo'yadi.
 */
export async function startTopicForAttendees(
  tx: Prisma.TransactionClient,
  input: { topicId: string; studentIds: string[]; markedById: string },
): Promise<number> {
  if (input.studentIds.length === 0) return 0;
  const result = await tx.studentTopicProgress.createMany({
    data: input.studentIds.map((studentId) => ({ studentId, topicId: input.topicId, status: 'IN_PROGRESS' as const, markedById: input.markedById })),
    skipDuplicates: true,
  });
  return result.count;
}

export const curriculumService = {
  /** Kurs dasturi — modul va mavzular bilan */
  async forCourse(courseId: string, includeInactive = false): Promise<CurriculumDto> {
    const course = await assertCourse(courseId);
    const modules = await prisma.courseModule.findMany({
      where: { courseId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: moduleSelect,
    });

    const dtos: ModuleDto[] = modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      sortOrder: module.sortOrder,
      isActive: module.isActive,
      topics: module.topics
        .filter((topic) => includeInactive || topic.isActive)
        .map((topic) => ({
          id: topic.id,
          title: topic.title,
          description: topic.description,
          lessonCount: topic.lessonCount,
          sortOrder: topic.sortOrder,
          isActive: topic.isActive,
          completedCount: topic._count.progress,
        })),
    }));

    const activeTopics = dtos.flatMap((module) => module.topics.filter((topic) => topic.isActive));
    return {
      courseId: course.id,
      courseName: course.name,
      modules: dtos,
      totalTopics: activeTopics.length,
      totalLessons: activeTopics.reduce((sum, topic) => sum + topic.lessonCount, 0),
    };
  },

  async createModule(actor: AuthUser, courseId: string, input: CreateModuleInput, client: ClientInfo): Promise<ModuleDto> {
    await assertCourse(courseId);
    // Tartib ko'rsatilmasa — ro'yxat oxiriga qo'shiladi (qo'shilish tartibi saqlanadi)
    const sortOrder = input.sortOrder ?? (await nextSortOrder('module', courseId));
    const module = await prisma.$transaction(async (tx) => {
      const created = await tx.courseModule.create({
        data: {
          courseId,
          title: input.title,
          description: input.description ?? null,
          sortOrder,
          isActive: input.isActive,
        },
        select: moduleSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'curriculum.module_created',
        entityType: 'course',
        entityId: courseId,
        metadata: { moduleId: created.id, title: created.title },
        ...client,
      });
      return created;
    });
    return { ...module, topics: [] };
  },

  async updateModule(actor: AuthUser, id: string, input: UpdateModuleInput, client: ClientInfo): Promise<ModuleDto> {
    const current = await prisma.courseModule.findUnique({ where: { id }, select: { id: true, courseId: true, title: true } });
    if (!current) throw AppError.notFound('Modul topilmadi');

    const module = await prisma.$transaction(async (tx) => {
      const saved = await tx.courseModule.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        select: moduleSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'curriculum.module_updated',
        entityType: 'course',
        entityId: current.courseId,
        metadata: { moduleId: id, titleFrom: current.title, titleTo: saved.title },
        ...client,
      });
      return saved;
    });

    return {
      id: module.id,
      title: module.title,
      description: module.description,
      sortOrder: module.sortOrder,
      isActive: module.isActive,
      topics: module.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        description: topic.description,
        lessonCount: topic.lessonCount,
        sortOrder: topic.sortOrder,
        isActive: topic.isActive,
        completedCount: topic._count.progress,
      })),
    };
  },

  async createTopic(actor: AuthUser, moduleId: string, input: CreateTopicInput, client: ClientInfo): Promise<TopicDto> {
    const module = await prisma.courseModule.findUnique({ where: { id: moduleId }, select: { id: true, courseId: true } });
    if (!module) throw AppError.notFound('Modul topilmadi');
    const sortOrder = input.sortOrder ?? (await nextSortOrder('topic', moduleId));

    return prisma.$transaction(async (tx) => {
      const created = await tx.courseTopic.create({
        data: {
          moduleId,
          title: input.title,
          description: input.description ?? null,
          lessonCount: input.lessonCount,
          sortOrder,
          isActive: input.isActive,
        },
        select: { id: true, title: true, description: true, lessonCount: true, sortOrder: true, isActive: true },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'curriculum.topic_created',
        entityType: 'course',
        entityId: module.courseId,
        metadata: { moduleId, topicId: created.id, title: created.title },
        ...client,
      });
      return created;
    });
  },

  async updateTopic(actor: AuthUser, id: string, input: UpdateTopicInput, client: ClientInfo): Promise<TopicDto> {
    const current = await prisma.courseTopic.findUnique({
      where: { id },
      select: { id: true, title: true, module: { select: { courseId: true } } },
    });
    if (!current) throw AppError.notFound('Mavzu topilmadi');

    return prisma.$transaction(async (tx) => {
      const saved = await tx.courseTopic.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.lessonCount === undefined ? {} : { lessonCount: input.lessonCount }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        select: { id: true, title: true, description: true, lessonCount: true, sortOrder: true, isActive: true },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'curriculum.topic_updated',
        entityType: 'course',
        entityId: current.module.courseId,
        metadata: { topicId: id, titleFrom: current.title, titleTo: saved.title },
        ...client,
      });
      return saved;
    });
  },

  /**
   * Mavzuni o'tilgan deb belgilash. Guruh ko'rsatilsa — guruhdagi barcha faol o'quvchilarga,
   * aks holda ko'rsatilgan o'quvchilarga. Takror belgilash holatni yangilaydi (idempotent).
   */
  async markTopic(actor: AuthUser, topicId: string, input: MarkTopicInput, client: ClientInfo): Promise<{ updated: number }> {
    const topic = await prisma.courseTopic.findUnique({
      where: { id: topicId },
      select: { id: true, title: true, module: { select: { courseId: true } } },
    });
    if (!topic) throw AppError.notFound('Mavzu topilmadi');

    const studentIds = input.groupId
      ? (
          await prisma.student.findMany({
            where: { groupId: input.groupId, deletedAt: null, status: 'ACTIVE' },
            select: { id: true },
          })
        ).map((student) => student.id)
      : (input.studentIds ?? []);

    if (studentIds.length === 0) {
      throw AppError.unprocessable('Belgilash uchun o‘quvchi topilmadi');
    }
    await assertCanMark(actor, studentIds);

    const completedAt = input.status === 'COMPLETED' ? new Date() : null;

    await prisma.$transaction(async (tx) => {
      for (const studentId of studentIds) {
        await tx.studentTopicProgress.upsert({
          where: { studentId_topicId: { studentId, topicId } },
          update: { status: input.status, completedAt, markedById: actor.id, note: input.note ?? null },
          create: {
            studentId,
            topicId,
            status: input.status,
            completedAt,
            markedById: actor.id,
            note: input.note ?? null,
          },
        });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'curriculum.topic_marked',
        entityType: 'course',
        entityId: topic.module.courseId,
        metadata: { topicId, title: topic.title, status: input.status, students: studentIds.length },
        ...client,
      });
    });

    return { updated: studentIds.length };
  },

  /** O'quvchining kurs dasturi bo'yicha progressi: "HTML 100%, CSS 82%" ko'rinishi uchun */
  async studentProgress(studentId: string): Promise<StudentCurriculumProgressDto | null> {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, courseId: true, course: { select: { name: true } } },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');

    const modules = await prisma.courseModule.findMany({
      where: { courseId: student.courseId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        topics: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          select: {
            id: true,
            title: true,
            progress: { where: { studentId }, select: { status: true, completedAt: true } },
          },
        },
      },
    });
    if (modules.length === 0) return null;

    let completedTotal = 0;
    let total = 0;
    const moduleDtos = modules.map((module) => {
      const topics: TopicProgressDto[] = module.topics.map((topic) => {
        const record = topic.progress[0];
        return {
          topicId: topic.id,
          topicTitle: topic.title,
          moduleTitle: module.title,
          status: record?.status ?? 'NOT_STARTED',
          completedAt: record?.completedAt?.toISOString() ?? null,
        };
      });
      const completed = topics.filter((topic) => topic.status === 'COMPLETED').length;
      completedTotal += completed;
      total += topics.length;
      return {
        id: module.id,
        title: module.title,
        percent: topics.length === 0 ? 0 : Math.round((completed / topics.length) * 100),
        completed,
        total: topics.length,
        topics,
      };
    });

    return {
      courseId: student.courseId,
      courseName: student.course.name,
      percent: total === 0 ? 0 : Math.round((completedTotal / total) * 100),
      completed: completedTotal,
      total,
      modules: moduleDtos,
    };
  },
};
