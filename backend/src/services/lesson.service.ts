import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { LessonMaterialKind, LessonStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { detectFileType, removeStoredFile, resolveStoredPath, sanitizeFileName, saveFile } from '../utils/fileStorage.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CreateLessonInput, LessonLinkMaterialInput, UpdateLessonInput } from '../validators/lesson.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';
import { masteryService } from './mastery.service.js';

/**
 * LMS darslari (TZ 3.0 §12–14): Kurs → Modul → Mavzu → **Dars** → Material.
 *
 * Ko'rish: `course.view` bor har bir xodim (kurs dasturi ochiq ma'lumot).
 * Tahrirlash: `lesson.manage` + doira — `course.manage` bor (admin) hamma kursda,
 * o'qituvchi faqat **o'zi dars beradigan** kurslarda (guruhi bor yoki kurs o'qituvchisi).
 *
 * O'quvchi faqat **nashr qilingan** (`PUBLISHED`) darslarni, faqat o'z kursida ko'radi
 * (`portal.service` → `forStudent`). Qoralama va arxiv unga ko'rinmaydi.
 *
 * Fayl siyosati hujjatlar bilan bir xil: tur baytlar bo'yicha (PDF/PNG/JPG/WEBP), hajm
 * `MAX_UPLOAD_MB`. Boshqa format (slayd, arxiv) — havola sifatida (Google Drive va h.k.).
 */

export interface LessonMaterialDto {
  id: string;
  kind: LessonMaterialKind;
  title: string;
  /** Havola/video uchun; fayl uchun — null (yuklab olish endpointi orqali) */
  url: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  sortOrder: number;
}

export interface LessonDto {
  id: string;
  topicId: string;
  title: string;
  description: string | null;
  content: string | null;
  teacher: { id: string; name: string } | null;
  durationMinutes: number | null;
  videoUrl: string | null;
  sortOrder: number;
  status: LessonStatus;
  publishedAt: string | null;
  updatedAt: string;
  materials: LessonMaterialDto[];
}

export interface LessonSummaryDto {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  hasVideo: boolean;
  materialCount: number;
  sortOrder: number;
  status: LessonStatus;
  publishedAt: string | null;
  /** Kabinetda: o'quvchi tugatganmi */
  completed?: boolean;
}

export interface LessonTreeDto {
  courseId: string;
  courseName: string;
  /** Joriy foydalanuvchi shu kursda dars tahrirlay oladimi */
  canEdit: boolean;
  modules: Array<{
    id: string;
    title: string;
    topics: Array<{ id: string; title: string; lessons: LessonSummaryDto[] }>;
  }>;
  totals: { lessons: number; published: number; completed?: number };
}

const materialSelect = {
  id: true,
  kind: true,
  title: true,
  url: true,
  originalName: true,
  mimeType: true,
  size: true,
  sortOrder: true,
} satisfies Prisma.LessonMaterialSelect;

const lessonSelect = {
  id: true,
  topicId: true,
  title: true,
  description: true,
  content: true,
  durationMinutes: true,
  videoUrl: true,
  sortOrder: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  teacher: { select: { id: true, firstName: true, lastName: true } },
  materials: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: materialSelect },
} satisfies Prisma.LessonSelect;

type LessonRecord = Prisma.LessonGetPayload<{ select: typeof lessonSelect }>;

function toLessonDto(record: LessonRecord): LessonDto {
  return {
    id: record.id,
    topicId: record.topicId,
    title: record.title,
    description: record.description,
    content: record.content,
    teacher: record.teacher ? { id: record.teacher.id, name: `${record.teacher.firstName} ${record.teacher.lastName}` } : null,
    durationMinutes: record.durationMinutes,
    videoUrl: record.videoUrl,
    sortOrder: record.sortOrder,
    status: record.status,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    materials: record.materials.map((material) => ({ ...material })),
  };
}

/** Qaysi kurslarda dars tahrirlay oladi: `all` yoki kurs id'lari */
async function editableCourses(actor: AuthUser): Promise<'all' | Set<string>> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  if (!permissions.has(PERMISSIONS.LESSON_MANAGE)) return new Set();
  if (permissions.has(PERMISSIONS.COURSE_MANAGE)) return 'all';
  const [groups, courses] = await Promise.all([
    prisma.group.findMany({ where: { teacherId: actor.id, status: { in: ['PLANNED', 'ACTIVE'] } }, select: { courseId: true } }),
    prisma.course.findMany({ where: { teacherId: actor.id }, select: { id: true } }),
  ]);
  return new Set([...groups.map((group) => group.courseId), ...courses.map((course) => course.id)]);
}

async function assertCanEditCourse(actor: AuthUser, courseId: string): Promise<void> {
  const editable = await editableCourses(actor);
  if (editable !== 'all' && !editable.has(courseId)) {
    throw AppError.forbidden('Bu kurs darslarini faqat uni o‘qitadigan o‘qituvchi yoki admin tahrirlaydi');
  }
}

async function courseOfTopic(topicId: string): Promise<string> {
  const topic = await prisma.courseTopic.findUnique({ where: { id: topicId }, select: { module: { select: { courseId: true } } } });
  if (!topic) throw AppError.notFound('Mavzu topilmadi');
  return topic.module.courseId;
}

async function findLessonWithCourse(id: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { ...lessonSelect, topic: { select: { module: { select: { courseId: true } } } } },
  });
  if (!lesson) throw AppError.notFound('Dars topilmadi');
  return lesson;
}

async function assertTeacher(teacherId: string | null | undefined): Promise<void> {
  if (!teacherId) return;
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, deletedAt: null }, select: { id: true } });
  if (!teacher) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'teacherId', message: 'O‘qituvchi topilmadi' }]);
}

/** Nashr qilinganda sana bir marta qo'yiladi; qayta nashrda saqlanadi */
function publishedAtFor(status: LessonStatus | undefined, current: Date | null): Date | null | undefined {
  if (status === 'PUBLISHED' && !current) return new Date();
  return undefined;
}

export const lessonService = {
  /**
   * Kurs dasturi daraxti darslar bilan. Xodim barcha holatdagi darslarni ko'radi
   * (arxiv — `includeArchived` bilan).
   */
  async treeForCourse(actor: AuthUser, courseId: string, includeArchived: boolean): Promise<LessonTreeDto> {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } });
    if (!course) throw AppError.notFound('Kurs topilmadi');
    const [modules, editable] = await Promise.all([
      prisma.courseModule.findMany({
        where: { courseId, isActive: true },
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
              lessons: {
                where: includeArchived ? {} : { status: { not: 'ARCHIVED' } },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                  id: true,
                  title: true,
                  description: true,
                  durationMinutes: true,
                  videoUrl: true,
                  sortOrder: true,
                  status: true,
                  publishedAt: true,
                  _count: { select: { materials: true } },
                },
              },
            },
          },
        },
      }),
      editableCourses(actor),
    ]);

    let total = 0;
    let published = 0;
    const tree = modules.map((module) => ({
      id: module.id,
      title: module.title,
      topics: module.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        lessons: topic.lessons.map((lesson) => {
          total += 1;
          if (lesson.status === 'PUBLISHED') published += 1;
          return {
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            durationMinutes: lesson.durationMinutes,
            hasVideo: Boolean(lesson.videoUrl),
            materialCount: lesson._count.materials,
            sortOrder: lesson.sortOrder,
            status: lesson.status,
            publishedAt: lesson.publishedAt?.toISOString() ?? null,
          };
        }),
      })),
    }));
    return {
      courseId: course.id,
      courseName: course.name,
      canEdit: editable === 'all' || editable.has(course.id),
      modules: tree,
      totals: { lessons: total, published },
    };
  },

  async getById(id: string): Promise<LessonDto> {
    const lesson = await findLessonWithCourse(id);
    return toLessonDto(lesson);
  },

  async create(actor: AuthUser, topicId: string, input: CreateLessonInput, client: ClientInfo): Promise<LessonDto> {
    const courseId = await courseOfTopic(topicId);
    await assertCanEditCourse(actor, courseId);
    await assertTeacher(input.teacherId);
    const last = await prisma.lesson.findFirst({ where: { topicId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const status = input.status ?? 'DRAFT';

    const lesson = await prisma.$transaction(async (tx) => {
      const created = await tx.lesson.create({
        data: {
          topicId,
          title: input.title,
          description: input.description ?? null,
          content: input.content ?? null,
          teacherId: input.teacherId ?? actor.id,
          durationMinutes: input.durationMinutes ?? null,
          videoUrl: input.videoUrl ?? null,
          sortOrder: input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : null,
          createdById: actor.id,
        },
        select: lessonSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lesson.created',
        entityType: 'lesson',
        entityId: created.id,
        after: { title: created.title, status: created.status, topicId },
        ...client,
      });
      return created;
    });
    return toLessonDto(lesson);
  },

  async update(actor: AuthUser, id: string, input: UpdateLessonInput, client: ClientInfo): Promise<LessonDto> {
    const current = await findLessonWithCourse(id);
    await assertCanEditCourse(actor, current.topic.module.courseId);
    await assertTeacher(input.teacherId);
    const publishedAt = publishedAtFor(input.status, current.publishedAt ? new Date(current.publishedAt) : null);

    const lesson = await prisma.$transaction(async (tx) => {
      const updated = await tx.lesson.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description || null }),
          ...(input.content === undefined ? {} : { content: input.content || null }),
          ...(input.teacherId === undefined ? {} : { teacherId: input.teacherId }),
          ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
          ...(input.videoUrl === undefined ? {} : { videoUrl: input.videoUrl }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(publishedAt === undefined ? {} : { publishedAt }),
        },
        select: lessonSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: input.status && input.status !== current.status ? `lesson.${input.status.toLowerCase()}` : 'lesson.updated',
        entityType: 'lesson',
        entityId: id,
        before: { title: current.title, status: current.status },
        after: { title: updated.title, status: updated.status },
        ...client,
      });
      return updated;
    });
    return toLessonDto(lesson);
  },

  /**
   * O'chirish faqat **qoralama** uchun: nashr qilingan darsni o'quvchilar ko'rgan — uni
   * arxivlash kerak (tarix va progress saqlanadi).
   */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const lesson = await findLessonWithCourse(id);
    await assertCanEditCourse(actor, lesson.topic.module.courseId);
    if (lesson.status !== 'DRAFT') {
      throw AppError.unprocessable('Nashr qilingan darsni o‘chirib bo‘lmaydi — arxivlang');
    }
    const files = lesson.materials.length
      ? await prisma.lessonMaterial.findMany({ where: { lessonId: id, storagePath: { not: null } }, select: { storagePath: true } })
      : [];
    await prisma.$transaction(async (tx) => {
      await tx.lesson.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lesson.deleted',
        entityType: 'lesson',
        entityId: id,
        before: { title: lesson.title },
        ...client,
      });
    });
    await Promise.all(files.map((file) => removeStoredFile(file.storagePath!).catch(() => undefined)));
  },

  async addLinkMaterial(actor: AuthUser, lessonId: string, input: LessonLinkMaterialInput, client: ClientInfo): Promise<LessonMaterialDto> {
    const lesson = await findLessonWithCourse(lessonId);
    await assertCanEditCourse(actor, lesson.topic.module.courseId);
    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.lessonMaterial.create({
        data: { lessonId, kind: input.kind, title: input.title, url: input.url, sortOrder: lesson.materials.length },
        select: materialSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lesson.material_added',
        entityType: 'lesson',
        entityId: lessonId,
        metadata: { kind: input.kind, title: input.title },
        ...client,
      });
      return created;
    });
    return { ...material };
  },

  async uploadMaterial(
    actor: AuthUser,
    lessonId: string,
    file: { buffer: unknown; fileName: string | undefined; title: string | undefined },
    client: ClientInfo,
  ): Promise<LessonMaterialDto> {
    const lesson = await findLessonWithCourse(lessonId);
    await assertCanEditCourse(actor, lesson.topic.module.courseId);
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw AppError.unprocessable('Fayl bo‘sh', [{ field: 'file', message: 'Faylni tanlang' }]);
    }
    const type = detectFileType(file.buffer);
    if (!type) {
      throw AppError.unprocessable('Faqat PDF yoki rasm (JPG, PNG, WEBP). Boshqa formatlarni havola sifatida qo‘shing', [
        { field: 'file', message: 'Fayl turi qo‘llanmaydi' },
      ]);
    }
    const originalName = sanitizeFileName(file.fileName ?? `material.${type.ext}`, type.ext);
    const storagePath = await saveFile(file.buffer, type.ext);
    const title = (file.title?.trim() || originalName).slice(0, 200);

    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.lessonMaterial.create({
        data: {
          lessonId,
          kind: 'FILE',
          title,
          storagePath,
          originalName,
          mimeType: type.mime,
          size: file.buffer instanceof Buffer ? file.buffer.length : null,
          sortOrder: lesson.materials.length,
        },
        select: materialSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lesson.material_added',
        entityType: 'lesson',
        entityId: lessonId,
        metadata: { kind: 'FILE', title, size: created.size },
        ...client,
      });
      return created;
    });
    return { ...material };
  },

  async removeMaterial(actor: AuthUser, materialId: string, client: ClientInfo): Promise<void> {
    const material = await prisma.lessonMaterial.findUnique({
      where: { id: materialId },
      select: { id: true, title: true, storagePath: true, lessonId: true, lesson: { select: { topic: { select: { module: { select: { courseId: true } } } } } } },
    });
    if (!material) throw AppError.notFound('Material topilmadi');
    await assertCanEditCourse(actor, material.lesson.topic.module.courseId);
    await prisma.$transaction(async (tx) => {
      await tx.lessonMaterial.delete({ where: { id: materialId } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lesson.material_removed',
        entityType: 'lesson',
        entityId: material.lessonId,
        metadata: { title: material.title },
        ...client,
      });
    });
    if (material.storagePath) await removeStoredFile(material.storagePath).catch(() => undefined);
  },

  /**
   * Material faylini berish. `studentCourseId` berilsa (kabinet) — faqat o'z kursidagi
   * nashr qilingan dars materiali.
   */
  async materialFile(
    materialId: string,
    studentCourseId?: string,
  ): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const material = await prisma.lessonMaterial.findUnique({
      where: { id: materialId },
      select: {
        storagePath: true,
        originalName: true,
        mimeType: true,
        lesson: { select: { status: true, topic: { select: { module: { select: { courseId: true } } } } } },
      },
    });
    if (!material?.storagePath) throw AppError.notFound('Fayl topilmadi');
    if (studentCourseId !== undefined) {
      const visible = material.lesson.status === 'PUBLISHED' && material.lesson.topic.module.courseId === studentCourseId;
      if (!visible) throw AppError.notFound('Fayl topilmadi');
    }
    return {
      absolutePath: resolveStoredPath(material.storagePath),
      fileName: material.originalName ?? 'material',
      mimeType: material.mimeType ?? 'application/octet-stream',
    };
  },

  // -------------------------------------------------------------------
  // Kabinet (o'quvchi) — faqat nashr qilingan darslar, faqat o'z kursi
  // -------------------------------------------------------------------

  async treeForStudent(studentId: string): Promise<LessonTreeDto> {
    const student = await prisma.student.findFirstOrThrow({
      where: { id: studentId, deletedAt: null },
      select: { courseId: true, course: { select: { name: true } } },
    });
    const [modules, progress] = await Promise.all([
      prisma.courseModule.findMany({
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
              lessons: {
                where: { status: 'PUBLISHED' },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                  id: true,
                  title: true,
                  description: true,
                  durationMinutes: true,
                  videoUrl: true,
                  sortOrder: true,
                  status: true,
                  publishedAt: true,
                  _count: { select: { materials: true } },
                },
              },
            },
          },
        },
      }),
      prisma.lessonProgress.findMany({ where: { studentId, completedAt: { not: null } }, select: { lessonId: true } }),
    ]);
    const done = new Set(progress.map((row) => row.lessonId));
    let total = 0;
    let completed = 0;
    const tree = modules
      .map((module) => ({
        id: module.id,
        title: module.title,
        topics: module.topics
          .map((topic) => ({
            id: topic.id,
            title: topic.title,
            lessons: topic.lessons.map((lesson) => {
              total += 1;
              const isDone = done.has(lesson.id);
              if (isDone) completed += 1;
              return {
                id: lesson.id,
                title: lesson.title,
                description: lesson.description,
                durationMinutes: lesson.durationMinutes,
                hasVideo: Boolean(lesson.videoUrl),
                materialCount: lesson._count.materials,
                sortOrder: lesson.sortOrder,
                status: lesson.status,
                publishedAt: lesson.publishedAt?.toISOString() ?? null,
                completed: isDone,
              };
            }),
          }))
          .filter((topic) => topic.lessons.length > 0),
      }))
      .filter((module) => module.topics.length > 0);
    return {
      courseId: student.courseId,
      courseName: student.course.name,
      canEdit: false,
      modules: tree,
      totals: { lessons: total, published: total, completed },
    };
  },

  /** Bitta dars (o'quvchi uchun) — ochilganini yozadi; o'quvchi emas (ota-ona) ko'rsa — yozilmaydi */
  async lessonForStudent(studentId: string, lessonId: string, recordView: boolean): Promise<LessonDto & { completed: boolean }> {
    const student = await prisma.student.findFirstOrThrow({ where: { id: studentId, deletedAt: null }, select: { courseId: true } });
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, status: 'PUBLISHED', topic: { isActive: true, module: { courseId: student.courseId } } },
      select: lessonSelect,
    });
    if (!lesson) throw AppError.notFound('Dars topilmadi');
    const now = new Date();
    const progress = recordView
      ? await prisma.lessonProgress.upsert({
          where: { lessonId_studentId: { lessonId, studentId } },
          create: { lessonId, studentId, firstViewedAt: now, lastViewedAt: now },
          update: { lastViewedAt: now },
          select: { completedAt: true },
        })
      : await prisma.lessonProgress.findUnique({ where: { lessonId_studentId: { lessonId, studentId } }, select: { completedAt: true } });
    return { ...toLessonDto(lesson), completed: Boolean(progress?.completedAt) };
  },

  /** O'quvchi darsni "o'rgandim" deb belgilaydi (yoki bekor qiladi) */
  async setCompleted(studentId: string, lessonId: string, completed: boolean): Promise<{ completed: boolean }> {
    await this.lessonForStudent(studentId, lessonId, false);
    const now = new Date();
    await prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      create: { lessonId, studentId, firstViewedAt: now, lastViewedAt: now, completedAt: completed ? now : null },
      update: { completedAt: completed ? now : null, lastViewedAt: now },
    });
    await masteryService.refresh([studentId]);
    return { completed };
  },
};
