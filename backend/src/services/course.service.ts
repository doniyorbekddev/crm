import { prisma } from '../config/database.js';
import type { CourseCategory, CourseStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CourseListQuery, CreateCourseInput, UpdateCourseInput } from '../validators/course.validator.js';
import { auditService } from './audit.service.js';

const courseSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  durationMonths: true,
  price: true,
  discountAmount: true,
  finalPrice: true,
  status: true,
  createdAt: true,
  teacher: { select: { id: true, firstName: true, lastName: true } },
  _count: {
    select: {
      groups: true,
      students: { where: { deletedAt: null } },
      leads: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.CourseSelect;

type CourseRecord = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

export interface CourseDto {
  id: string;
  name: string;
  category: CourseCategory;
  description: string | null;
  durationMonths: number;
  price: number;
  discountAmount: number;
  finalPrice: number;
  status: CourseStatus;
  createdAt: string;
  teacher: { id: string; firstName: string; lastName: string } | null;
  counts: { groups: number; students: number; leads: number };
}

function toCourseDto(course: CourseRecord): CourseDto {
  return {
    id: course.id,
    name: course.name,
    category: course.category,
    description: course.description,
    durationMonths: course.durationMonths,
    price: course.price.toNumber(),
    discountAmount: course.discountAmount.toNumber(),
    finalPrice: course.finalPrice.toNumber(),
    status: course.status,
    createdAt: course.createdAt.toISOString(),
    teacher: course.teacher,
    counts: { groups: course._count.groups, students: course._count.students, leads: course._count.leads },
  };
}

function buildWhere(query: Partial<CourseListQuery>): Prisma.CourseWhereInput {
  const conditions: Prisma.CourseWhereInput[] = [];
  if (query.category) conditions.push({ category: query.category });
  if (query.status) conditions.push({ status: query.status });
  if (query.teacherId) conditions.push({ teacherId: query.teacherId });
  for (const term of splitSearchTerms(query.search)) {
    conditions.push({ name: { contains: term, mode: 'insensitive' } });
  }
  return conditions.length > 0 ? { AND: conditions } : {};
}

function buildOrderBy(sortBy: CourseListQuery['sortBy'], sortOrder: CourseListQuery['sortOrder']): Prisma.CourseOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'price':
      return [{ finalPrice: sortOrder }, { name: 'asc' }];
    case 'createdAt':
      return [{ createdAt: sortOrder }, { name: 'asc' }];
    case 'name':
      return [{ name: sortOrder === 'desc' ? 'desc' : 'asc' }];
  }
}

async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.course.findUnique({ where: { name }, select: { id: true } });
  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('Bunday nomli kurs allaqachon mavjud', [{ field: 'name', message: 'Bu nom band' }]);
  }
}

/** O‘qituvchi — faol xodim bo‘lishi kerak (rol cheklovi yo‘q: admin ham dars berishi mumkin). */
async function assertTeacherExists(teacherId: string | undefined): Promise<void> {
  if (!teacherId) return;
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!teacher) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'teacherId', message: 'Xodim topilmadi' }]);
  }
}

async function findCourse(id: string): Promise<CourseRecord> {
  const course = await prisma.course.findUnique({ where: { id }, select: courseSelect });
  if (!course) {
    throw AppError.notFound('Kurs topilmadi');
  }
  return course;
}

export const courseService = {
  async list(query: CourseListQuery): Promise<{ items: CourseDto[]; total: number }> {
    const where = buildWhere(query);
    const items = await prisma.course.findMany({
      where,
      select: courseSelect,
      orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.course.count({ where });
    return { items: items.map(toCourseDto), total };
  },

  async getById(id: string): Promise<CourseDto> {
    return toCourseDto(await findCourse(id));
  },

  async create(actor: AuthUser, input: CreateCourseInput, client: ClientInfo): Promise<CourseDto> {
    await assertNameAvailable(input.name);
    await assertTeacherExists(input.teacherId);

    const created = await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          durationMonths: input.durationMonths,
          price: input.price,
          discountAmount: input.discountAmount,
          // Yakuniy narx har doim serverda hisoblanadi
          finalPrice: input.price - input.discountAmount,
          teacherId: input.teacherId ?? null,
          status: input.status,
        },
        select: courseSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'course.created',
        entityType: 'course',
        entityId: course.id,
        metadata: { name: course.name, finalPrice: course.finalPrice.toNumber() },
        ...client,
      });
      return course;
    });

    return toCourseDto(created);
  },

  async update(actor: AuthUser, id: string, input: UpdateCourseInput, client: ClientInfo): Promise<CourseDto> {
    const course = await findCourse(id);
    await assertNameAvailable(input.name, id);
    await assertTeacherExists(input.teacherId);

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.course.update({
        where: { id },
        data: {
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          durationMonths: input.durationMonths,
          price: input.price,
          discountAmount: input.discountAmount,
          finalPrice: input.price - input.discountAmount,
          teacherId: input.teacherId ?? null,
          status: input.status,
        },
        select: courseSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'course.updated',
        entityType: 'course',
        entityId: id,
        metadata: {
          priceFrom: course.finalPrice.toNumber(),
          priceTo: record.finalPrice.toNumber(),
          statusFrom: course.status,
          statusTo: record.status,
        },
        ...client,
      });
      return record;
    });

    return toCourseDto(updated);
  },

  /**
   * Kursni o‘chirish faqat u hech qayerda ishlatilmagan bo‘lsa mumkin.
   * Aks holda narx tarixi va shartnomalar buziladi — buning o‘rniga "Arxivlangan" holatiga o‘tkaziladi.
   */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const course = await findCourse(id);
    const blockers: string[] = [];
    if (course._count.groups > 0) blockers.push(`${course._count.groups} ta guruh`);
    if (course._count.students > 0) blockers.push(`${course._count.students} ta o‘quvchi`);
    const payments = await prisma.payment.count({ where: { courseId: id } });
    if (payments > 0) blockers.push(`${payments} ta to‘lov`);

    if (blockers.length > 0) {
      throw AppError.conflict(
        `Bu kurs ishlatilmoqda (${blockers.join(', ')}). O‘chirish o‘rniga holatini "Arxivlangan" qiling`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.course.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'course.deleted',
        entityType: 'course',
        entityId: id,
        metadata: { name: course.name },
        ...client,
      });
    });
  },
};
