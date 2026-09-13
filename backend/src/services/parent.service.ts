import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { ParentRelation, Prisma, StudentStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CreateParentInput,
  LinkStudentInput,
  ParentListQuery,
  UpdateLinkInput,
  UpdateParentInput,
} from '../validators/parent.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';
import { studentService } from './student.service.js';

/**
 * Ota-ona profillari (promt.md 35-bo‘lim). Bir ota-onaga bir nechta farzand biriktiriladi.
 * O‘quvchining asosiy vakili (`isPrimary`) telefoni `student.parentPhone` ga yoziladi —
 * qarzdorlik ro‘yxati, qidiruv va eslatmalar shu maydondan foydalanadi.
 */

export interface ParentStudentLinkDto {
  linkId: string;
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  status: StudentStatus;
  group: { id: string; name: string } | null;
  relation: ParentRelation;
  isPrimary: boolean;
}

export interface ParentDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  telegram: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  students: ParentStudentLinkDto[];
}

export interface StudentParentDto {
  linkId: string;
  parentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  telegram: string | null;
  email: string | null;
  notes: string | null;
  relation: ParentRelation;
  isPrimary: boolean;
}

interface ParentAccess {
  userId: string;
  /** O‘qituvchi faqat o‘z guruhlaridagi o‘quvchilarning ota-onasini ko‘radi */
  onlyOwnGroups: boolean;
}

async function getParentAccess(actor: AuthUser): Promise<ParentAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return {
    userId: actor.id,
    onlyOwnGroups: !permissions.has(PERMISSIONS.STUDENT_MANAGE) && permissions.has(PERMISSIONS.ATTENDANCE_MARK),
  };
}

function linkedStudentFilter(access: ParentAccess): Prisma.StudentParentWhereInput {
  return {
    student: { deletedAt: null, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
  };
}

function parentSelect(access: ParentAccess) {
  return {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    telegram: true,
    email: true,
    notes: true,
    createdAt: true,
    students: {
      // O'qituvchiga boshqa guruhdagi farzandlar ko'rsatilmaydi
      where: linkedStudentFilter(access),
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        relation: true,
        isPrimary: true,
        student: {
          select: {
            id: true,
            number: true,
            firstName: true,
            lastName: true,
            status: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    },
  } satisfies Prisma.ParentSelect;
}

type ParentRecord = Prisma.ParentGetPayload<{ select: ReturnType<typeof parentSelect> }>;

function toDto(parent: ParentRecord): ParentDto {
  return {
    id: parent.id,
    firstName: parent.firstName,
    lastName: parent.lastName,
    phone: parent.phone,
    telegram: parent.telegram,
    email: parent.email,
    notes: parent.notes,
    createdAt: parent.createdAt.toISOString(),
    students: parent.students.map((link) => ({
      linkId: link.id,
      studentId: link.student.id,
      code: formatStudentNumber(link.student.number),
      firstName: link.student.firstName,
      lastName: link.student.lastName,
      status: link.student.status,
      group: link.student.group,
      relation: link.relation,
      isPrimary: link.isPrimary,
    })),
  };
}

function scopeWhere(access: ParentAccess): Prisma.ParentWhereInput {
  return access.onlyOwnGroups ? { students: { some: linkedStudentFilter(access) } } : {};
}

async function findVisible(access: ParentAccess, id: string): Promise<ParentRecord> {
  const parent = await prisma.parent.findFirst({ where: { id, ...scopeWhere(access) }, select: parentSelect(access) });
  if (!parent) {
    throw AppError.notFound('Ota-ona topilmadi');
  }
  return parent;
}

async function assertPhoneFree(phone: string, exceptId?: string): Promise<void> {
  const duplicate = await prisma.parent.findFirst({
    where: { phone, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true, firstName: true, lastName: true },
  });
  if (duplicate) {
    throw AppError.conflict('Bu telefon raqami bilan ota-ona allaqachon mavjud', [
      {
        field: 'phone',
        message: `${duplicate.firstName} ${duplicate.lastName} profili bor — yangi profil o‘rniga unga farzand biriktiring`,
      },
    ]);
  }
}

async function assertStudentsExist(studentIds: string[]): Promise<void> {
  if (studentIds.length === 0) return;
  const found = await prisma.student.count({ where: { id: { in: studentIds }, deletedAt: null } });
  if (found !== new Set(studentIds).size) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'studentId', message: 'O‘quvchi topilmadi' }]);
  }
}

/**
 * O‘quvchida asosiy vakil bittadan oshmasligini ta’minlaydi: `preferredLinkId` berilsa u asosiy bo‘ladi,
 * aks holda mavjud asosiy saqlanadi yoki eng birinchi biriktirilgan ota-ona tanlanadi.
 * `student.parentPhone` shunga moslanadi (ota-ona qolmasa — null).
 */
async function syncPrimary(tx: Prisma.TransactionClient, studentId: string, preferredLinkId?: string): Promise<void> {
  const links = await tx.studentParent.findMany({
    where: { studentId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, isPrimary: true, parent: { select: { phone: true } } },
  });
  if (links.length === 0) {
    await tx.student.update({ where: { id: studentId }, data: { parentPhone: null } });
    return;
  }
  const primary = links.find((link) => link.id === preferredLinkId) ?? links.find((link) => link.isPrimary) ?? links[0]!;
  await tx.studentParent.updateMany({ where: { studentId, NOT: { id: primary.id } }, data: { isPrimary: false } });
  if (!primary.isPrimary) {
    await tx.studentParent.update({ where: { id: primary.id }, data: { isPrimary: true } });
  }
  await tx.student.update({ where: { id: studentId }, data: { parentPhone: primary.parent.phone } });
}

export const parentService = {
  async list(actor: AuthUser, query: ParentListQuery): Promise<{ items: ParentDto[]; total: number }> {
    const access = await getParentAccess(actor);
    const conditions: Prisma.ParentWhereInput[] = [scopeWhere(access)];
    if (query.studentId) conditions.push({ students: { some: { studentId: query.studentId } } });
    for (const term of splitSearchTerms(query.search)) {
      const digits = term.replace(/\D/g, '');
      conditions.push({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { telegram: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          // Farzandining ismi bo'yicha ham topiladi
          { students: { some: { student: { OR: [{ firstName: { contains: term, mode: 'insensitive' as const } }, { lastName: { contains: term, mode: 'insensitive' as const } }] } } } },
        ],
      });
    }
    const where: Prisma.ParentWhereInput = { AND: conditions };

    const items = await prisma.parent.findMany({
      where,
      select: parentSelect(access),
      orderBy: query.sortBy === 'createdAt' ? [{ createdAt: query.sortOrder }] : [{ lastName: 'asc' }, { firstName: 'asc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.parent.count({ where });
    return { items: items.map(toDto), total };
  },

  async getById(actor: AuthUser, id: string): Promise<ParentDto> {
    return toDto(await findVisible(await getParentAccess(actor), id));
  },

  /** O‘quvchi profili uchun: uning ota-onalari (asosiysi birinchi) */
  async forStudent(actor: AuthUser, studentId: string): Promise<StudentParentDto[]> {
    await studentService.getById(actor, studentId);
    const links = await prisma.studentParent.findMany({
      where: { studentId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        relation: true,
        isPrimary: true,
        parent: { select: { id: true, firstName: true, lastName: true, phone: true, telegram: true, email: true, notes: true } },
      },
    });
    return links.map((link) => ({
      linkId: link.id,
      parentId: link.parent.id,
      firstName: link.parent.firstName,
      lastName: link.parent.lastName,
      phone: link.parent.phone,
      telegram: link.parent.telegram,
      email: link.parent.email,
      notes: link.parent.notes,
      relation: link.relation,
      isPrimary: link.isPrimary,
    }));
  },

  async create(actor: AuthUser, input: CreateParentInput, client: ClientInfo): Promise<ParentDto> {
    await assertPhoneFree(input.phone);
    await assertStudentsExist(input.students.map((link) => link.studentId));

    const id = await prisma.$transaction(async (tx) => {
      const parent = await tx.parent.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          telegram: input.telegram ?? null,
          email: input.email ?? null,
          notes: input.notes ?? null,
        },
        select: { id: true },
      });
      for (const link of input.students) {
        const created = await tx.studentParent.create({
          data: { parentId: parent.id, studentId: link.studentId, relation: link.relation, isPrimary: link.isPrimary },
          select: { id: true },
        });
        await syncPrimary(tx, link.studentId, link.isPrimary ? created.id : undefined);
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'parent.created',
        entityType: 'parent',
        entityId: parent.id,
        metadata: { name: `${input.firstName} ${input.lastName}`, phone: input.phone, students: input.students.length },
        ...client,
      });
      return parent.id;
    });

    return this.getById(actor, id);
  },

  async update(actor: AuthUser, id: string, input: UpdateParentInput, client: ClientInfo): Promise<ParentDto> {
    const parent = await findVisible(await getParentAccess(actor), id);
    if (input.phone && input.phone !== parent.phone) {
      await assertPhoneFree(input.phone, id);
    }

    await prisma.$transaction(async (tx) => {
      await tx.parent.update({
        where: { id },
        data: {
          ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
          ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.telegram === undefined ? {} : { telegram: input.telegram }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
        },
      });
      // Telefon o'zgarsa — asosiy vakil bo'lgan farzandlarning parentPhone maydoni ham yangilanadi
      if (input.phone && input.phone !== parent.phone) {
        const primaryFor = await tx.studentParent.findMany({ where: { parentId: id, isPrimary: true }, select: { studentId: true } });
        for (const link of primaryFor) await syncPrimary(tx, link.studentId);
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'parent.updated',
        entityType: 'parent',
        entityId: id,
        metadata: {
          before: { firstName: parent.firstName, lastName: parent.lastName, phone: parent.phone },
          after: { firstName: input.firstName ?? parent.firstName, lastName: input.lastName ?? parent.lastName, phone: input.phone ?? parent.phone },
        },
        ...client,
      });
    });

    return this.getById(actor, id);
  },

  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const parent = await findVisible(await getParentAccess(actor), id);
    const studentIds = (await prisma.studentParent.findMany({ where: { parentId: id }, select: { studentId: true } })).map((link) => link.studentId);

    await prisma.$transaction(async (tx) => {
      await tx.parent.delete({ where: { id } });
      for (const studentId of studentIds) await syncPrimary(tx, studentId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'parent.deleted',
        entityType: 'parent',
        entityId: id,
        metadata: { name: `${parent.firstName} ${parent.lastName}`, phone: parent.phone, students: studentIds.length },
        ...client,
      });
    });
  },

  async linkStudent(actor: AuthUser, parentId: string, input: LinkStudentInput, client: ClientInfo): Promise<ParentDto> {
    const parent = await findVisible(await getParentAccess(actor), parentId);
    await assertStudentsExist([input.studentId]);
    const existing = await prisma.studentParent.findUnique({
      where: { studentId_parentId: { studentId: input.studentId, parentId } },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('Bu o‘quvchi allaqachon biriktirilgan', [{ field: 'studentId', message: 'Allaqachon biriktirilgan' }]);
    }

    await prisma.$transaction(async (tx) => {
      const link = await tx.studentParent.create({
        data: { parentId, studentId: input.studentId, relation: input.relation, isPrimary: input.isPrimary },
        select: { id: true },
      });
      await syncPrimary(tx, input.studentId, input.isPrimary ? link.id : undefined);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'parent.linked',
        entityType: 'parent',
        entityId: parentId,
        metadata: { parent: `${parent.firstName} ${parent.lastName}`, studentId: input.studentId, relation: input.relation, isPrimary: input.isPrimary },
        ...client,
      });
    });

    return this.getById(actor, parentId);
  },

  async updateLink(actor: AuthUser, linkId: string, input: UpdateLinkInput, client: ClientInfo): Promise<StudentParentDto[]> {
    const link = await prisma.studentParent.findUnique({ where: { id: linkId }, select: { id: true, studentId: true, parentId: true } });
    if (!link) {
      throw AppError.notFound('Bog‘lanish topilmadi');
    }

    await prisma.$transaction(async (tx) => {
      await tx.studentParent.update({
        where: { id: linkId },
        data: {
          ...(input.relation === undefined ? {} : { relation: input.relation }),
          ...(input.isPrimary === false ? { isPrimary: false } : {}),
        },
      });
      await syncPrimary(tx, link.studentId, input.isPrimary ? linkId : undefined);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'parent.link_updated',
        entityType: 'parent',
        entityId: link.parentId,
        metadata: { studentId: link.studentId, relation: input.relation ?? null, isPrimary: input.isPrimary ?? null },
        ...client,
      });
    });

    return this.forStudent(actor, link.studentId);
  },

  async unlink(actor: AuthUser, linkId: string, client: ClientInfo): Promise<StudentParentDto[]> {
    const link = await prisma.studentParent.findUnique({ where: { id: linkId }, select: { id: true, studentId: true, parentId: true } });
    if (!link) {
      throw AppError.notFound('Bog‘lanish topilmadi');
    }

    await prisma.$transaction(async (tx) => {
      await tx.studentParent.delete({ where: { id: linkId } });
      await syncPrimary(tx, link.studentId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'parent.unlinked',
        entityType: 'parent',
        entityId: link.parentId,
        metadata: { studentId: link.studentId },
        ...client,
      });
    });

    return this.forStudent(actor, link.studentId);
  },
};
