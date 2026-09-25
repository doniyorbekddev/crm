import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { GroupStatus, Prisma, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CreateGroupInput, GroupListQuery, UpdateGroupInput } from '../validators/group.validator.js';
import { auditService } from './audit.service.js';
import { scheduleConflictService } from './scheduleConflict.service.js';
import type { ScheduleConflict } from './scheduleConflict.service.js';
import { branchFilter, getBranchAccess, resolveBranchId } from './branchAccess.js';
import type { BranchAccess } from './branchAccess.js';
import { permissionService } from './permission.service.js';
import { isRosterLimited } from './teachingAccess.js';

const groupSelect = {
  id: true,
  name: true,
  room: true,
  roomId: true,
  branchId: true,
  roomRef: { select: { id: true, name: true, capacity: true } },
  startDate: true,
  endDate: true,
  scheduleDays: true,
  startTime: true,
  endTime: true,
  capacity: true,
  status: true,
  createdAt: true,
  course: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { students: { where: { deletedAt: null } } } },
} satisfies Prisma.GroupSelect;

type GroupRecord = Prisma.GroupGetPayload<{ select: typeof groupSelect }>;

export interface GroupDto {
  id: string;
  name: string;
  room: string | null;
  /** Xona kartochkasi (yangi model); eski matnli `room` mos kelish uchun saqlanadi */
  roomRef: { id: string; name: string; capacity: number } | null;
  startDate: string;
  endDate: string | null;
  scheduleDays: WeekDay[];
  startTime: string;
  endTime: string;
  capacity: number;
  studentCount: number;
  freeSeats: number;
  status: GroupStatus;
  createdAt: string;
  course: { id: string; name: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
}

/** @db.Date ustuni — vaqtsiz, "2026-09-15" ko‘rinishida qaytariladi */
function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toGroupDto(group: GroupRecord): GroupDto {
  return {
    id: group.id,
    name: group.name,
    room: group.room,
    roomRef: group.roomRef,
    startDate: toDateOnly(group.startDate),
    endDate: group.endDate ? toDateOnly(group.endDate) : null,
    scheduleDays: group.scheduleDays,
    startTime: group.startTime,
    endTime: group.endTime,
    capacity: group.capacity,
    studentCount: group._count.students,
    freeSeats: Math.max(group.capacity - group._count.students, 0),
    status: group.status,
    createdAt: group.createdAt.toISOString(),
    course: group.course,
    teacher: group.teacher,
  };
}

export interface GroupAccess {
  userId: string;
  canManage: boolean;
  /** O‘qituvchi faqat o‘zi dars beradigan guruhlarni ko‘radi */
  onlyOwnGroups: boolean;
  /** Filial doirasi — `branch.view_all` bo‘lmasa faqat o‘z filiali */
  branch: BranchAccess;
}

async function getGroupAccess(actor: AuthUser): Promise<GroupAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  const canManage = permissions.has(PERMISSIONS.GROUP_MANAGE);
  return {
    userId: actor.id,
    canManage,
    onlyOwnGroups: isRosterLimited(permissions, PERMISSIONS.GROUP_MANAGE),
    branch: await getBranchAccess(actor),
  };
}

function buildWhere(access: GroupAccess, query: Partial<GroupListQuery>): Prisma.GroupWhereInput {
  const conditions: Prisma.GroupWhereInput[] = [];
  conditions.push(branchFilter(access.branch, query.branchId));
  if (access.onlyOwnGroups) conditions.push({ teacherId: access.userId });
  if (query.courseId) conditions.push({ courseId: query.courseId });
  if (query.teacherId) conditions.push({ teacherId: query.teacherId });
  if (query.status) conditions.push({ status: query.status });
  for (const term of splitSearchTerms(query.search)) {
    conditions.push({
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { room: { contains: term, mode: 'insensitive' } },
        { course: { name: { contains: term, mode: 'insensitive' } } },
      ],
    });
  }
  return conditions.length > 0 ? { AND: conditions } : {};
}

function buildOrderBy(sortBy: GroupListQuery['sortBy'], sortOrder: GroupListQuery['sortOrder']): Prisma.GroupOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'name':
      return [{ name: sortOrder }];
    case 'createdAt':
      return [{ createdAt: sortOrder }, { name: 'asc' }];
    case 'startDate':
      return [{ startDate: sortOrder }, { name: 'asc' }];
  }
}

async function findVisibleGroup(access: GroupAccess, id: string): Promise<GroupRecord> {
  const group = await prisma.group.findFirst({
    where: { id, ...(access.onlyOwnGroups ? { teacherId: access.userId } : {}) },
    select: groupSelect,
  });
  if (!group) {
    throw AppError.notFound('Guruh topilmadi');
  }
  return group;
}

async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.group.findUnique({ where: { name }, select: { id: true } });
  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('Bunday nomli guruh allaqachon mavjud', [{ field: 'name', message: 'Bu nom band' }]);
  }
}

/**
 * Jadval konfliktini tekshiradi. `allowConflict: true` bo'lsa ogohlantirish qaytariladi,
 * lekin saqlashga yo'l qo'yiladi (ba'zan rahbar ataylab ikki guruhni bitta xonaga qo'yadi —
 * masalan qo'shma dars). Standart holatda konflikt saqlashni to'xtatadi.
 */
async function assertNoScheduleConflict(
  candidate: Parameters<typeof scheduleConflictService.find>[0],
  allowConflict: boolean,
): Promise<ScheduleConflict[]> {
  const conflicts = await scheduleConflictService.find(candidate);
  if (conflicts.length === 0 || allowConflict) return conflicts;

  throw AppError.conflict(
    conflicts.length === 1 ? conflicts[0]!.message : `Jadvalda ${conflicts.length} ta to‘qnashuv bor`,
    conflicts.map((conflict) => ({
      field: conflict.kind === 'ROOM' ? 'roomId' : 'teacherId',
      message: conflict.message,
    })),
  );
}

async function assertReferences(courseId: string, teacherId: string | undefined): Promise<void> {
  const [course, teacher] = [
    await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }),
    teacherId ? await prisma.user.findFirst({ where: { id: teacherId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } }) : null,
  ];
  const errors = [
    ...(!course ? [{ field: 'courseId', message: 'Kurs topilmadi' }] : []),
    ...(teacherId && !teacher ? [{ field: 'teacherId', message: 'O‘qituvchi topilmadi' }] : []),
  ];
  if (errors.length > 0) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', errors);
  }
}

export const groupService = {
  async list(actor: AuthUser, query: GroupListQuery): Promise<{ items: GroupDto[]; total: number }> {
    const access = await getGroupAccess(actor);
    const where = buildWhere(access, query);
    const items = await prisma.group.findMany({
      where,
      select: groupSelect,
      orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.group.count({ where });
    return { items: items.map(toGroupDto), total };
  },

  async getById(actor: AuthUser, id: string): Promise<GroupDto> {
    const access = await getGroupAccess(actor);
    return toGroupDto(await findVisibleGroup(access, id));
  },

  async create(actor: AuthUser, input: CreateGroupInput, client: ClientInfo): Promise<GroupDto> {
    await assertNameAvailable(input.name);
    await assertReferences(input.courseId, input.teacherId);
    const branchId = resolveBranchId(await getBranchAccess(actor));
    await assertNoScheduleConflict(
      {
        branchId,
        roomId: input.roomId ?? null,
        teacherId: input.teacherId ?? null,
        scheduleDays: input.scheduleDays,
        startTime: input.startTime,
        endTime: input.endTime,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
      },
      input.allowConflict ?? false,
    );

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: input.name,
          courseId: input.courseId,
          teacherId: input.teacherId ?? null,
          room: input.room ?? null,
          roomId: input.roomId ?? null,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          scheduleDays: input.scheduleDays,
          startTime: input.startTime,
          endTime: input.endTime,
          capacity: input.capacity,
          status: input.status,
          branchId,
        },
        select: groupSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'group.created',
        entityType: 'group',
        entityId: group.id,
        metadata: { name: group.name, courseId: input.courseId },
        ...client,
      });
      return group;
    });

    return toGroupDto(created);
  },

  async update(actor: AuthUser, id: string, input: UpdateGroupInput, client: ClientInfo): Promise<GroupDto> {
    const access = await getGroupAccess(actor);
    const group = await findVisibleGroup(access, id);
    await assertNameAvailable(input.name, id);
    await assertReferences(input.courseId, input.teacherId);

    if (input.capacity < group._count.students) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'capacity', message: `Guruhda ${group._count.students} ta o‘quvchi bor — sig‘im undan kam bo‘lmasin` },
      ]);
    }

    await assertNoScheduleConflict(
      {
        groupId: id,
        branchId: group.branchId,
        roomId: input.roomId ?? null,
        teacherId: input.teacherId ?? null,
        scheduleDays: input.scheduleDays,
        startTime: input.startTime,
        endTime: input.endTime,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
      },
      input.allowConflict ?? false,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.group.update({
        where: { id },
        data: {
          name: input.name,
          courseId: input.courseId,
          teacherId: input.teacherId ?? null,
          room: input.room ?? null,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          scheduleDays: input.scheduleDays,
          startTime: input.startTime,
          endTime: input.endTime,
          capacity: input.capacity,
          status: input.status,
        },
        select: groupSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'group.updated',
        entityType: 'group',
        entityId: id,
        metadata: { statusFrom: group.status, statusTo: record.status },
        ...client,
      });
      return record;
    });

    return toGroupDto(updated);
  },

  /** O‘quvchisi bor guruh o‘chirilmaydi — avval o‘quvchilarni boshqa guruhga o‘tkazish kerak. */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getGroupAccess(actor);
    const group = await findVisibleGroup(access, id);

    if (group._count.students > 0) {
      throw AppError.conflict(
        `Guruhda ${group._count.students} ta o‘quvchi bor. Avval ularni boshqa guruhga o‘tkazing yoki guruh holatini o‘zgartiring`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.group.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'group.deleted',
        entityType: 'group',
        entityId: id,
        metadata: { name: group.name },
        ...client,
      });
    });
  },
};
