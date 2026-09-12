import { prisma } from '../config/database.js';
import { ROLE_KEYS } from '../config/permissions.js';
import type { Prisma, UserStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import { hashPassword } from '../utils/password.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CreateUserInput,
  ResetUserPasswordInput,
  UpdateUserInput,
  UpdateUserStatusInput,
  UserListQuery,
  UserSummaryQuery,
} from '../validators/user.validator.js';
import { auditService } from './audit.service.js';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, key: true, name: true } },
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; key: string; name: string };
}

export type UserStatusSummary = Record<'ALL' | UserStatus, number>;

function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    role: user.role,
  };
}

function buildWhere(filters: { search?: string | undefined; roleId?: string | undefined; status?: UserStatus | undefined }): Prisma.UserWhereInput {
  const terms = splitSearchTerms(filters.search);
  return {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.roleId ? { roleId: filters.roleId } : {}),
    ...(terms.length > 0
      ? {
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term, mode: 'insensitive' as const } },
              { lastName: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
              { phone: { contains: term } },
            ],
          })),
        }
      : {}),
  };
}

function buildOrderBy(sortBy: UserListQuery['sortBy'], sortOrder: UserListQuery['sortOrder']): Prisma.UserOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'lastLoginAt':
      return [{ lastLoginAt: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }];
    case 'firstName':
      return [{ firstName: sortOrder }, { lastName: sortOrder }, { id: 'asc' }];
    case 'email':
      return [{ email: sortOrder }];
    case 'createdAt':
      return [{ createdAt: sortOrder }, { id: 'asc' }];
  }
}

async function findActiveUser(id: string): Promise<UserRecord> {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!user) {
    throw AppError.notFound('Xodim topilmadi');
  }
  return user;
}

function assertNotSelf(actor: AuthUser, targetId: string, message: string): void {
  if (actor.id === targetId) {
    throw AppError.forbidden(message);
  }
}

function assertCanManage(actor: AuthUser, target: UserRecord): void {
  if (target.role.key === ROLE_KEYS.SUPER_ADMIN && actor.roleKey !== ROLE_KEYS.SUPER_ADMIN) {
    throw AppError.forbidden('Super Admin hisobini faqat Super Admin boshqara oladi');
  }
}

async function resolveAssignableRole(actor: AuthUser, roleId: string): Promise<{ id: string; key: string; name: string }> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, key: true, name: true } });
  if (!role) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'roleId', message: 'Rol topilmadi' }]);
  }
  if (role.key === ROLE_KEYS.SUPER_ADMIN && actor.roleKey !== ROLE_KEYS.SUPER_ADMIN) {
    throw AppError.forbidden('Super Admin rolini faqat Super Admin bera oladi');
  }
  return role;
}

/** Tizimda kamida bitta faol Super Admin qolishi shart — aks holda hech kim xodim va rollarni boshqara olmaydi. */
async function assertKeepsActiveSuperAdmin(target: UserRecord): Promise<void> {
  if (target.role.key !== ROLE_KEYS.SUPER_ADMIN || target.status !== 'ACTIVE') return;
  const others = await prisma.user.count({
    where: { id: { not: target.id }, deletedAt: null, status: 'ACTIVE', role: { key: ROLE_KEYS.SUPER_ADMIN } },
  });
  if (others === 0) {
    throw AppError.conflict('Tizimda kamida bitta faol Super Admin qolishi kerak');
  }
}

async function assertEmailAvailable(email: string, exceptUserId?: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptUserId) {
    throw AppError.conflict('Bu email bilan xodim allaqachon mavjud', [{ field: 'email', message: 'Bu email band' }]);
  }
}

async function revokeSessions(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export const userService = {
  async list(query: UserListQuery): Promise<{ items: UserDto[]; total: number }> {
    const where = buildWhere(query);
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        ...toSkipTake(query.page, query.limit),
      }),
      prisma.user.count({ where }),
    ]);
    return { items: items.map(toUserDto), total };
  },

  /** Holatlar bo‘yicha sonlar (tablar uchun) — qidiruv va rol filtrini hisobga oladi. */
  async summary(filters: UserSummaryQuery): Promise<UserStatusSummary> {
    const groups = await prisma.user.groupBy({
      by: ['status'],
      where: buildWhere(filters),
      _count: { _all: true },
    });
    const summary: UserStatusSummary = { ALL: 0, ACTIVE: 0, PENDING: 0, BLOCKED: 0 };
    for (const group of groups) {
      summary[group.status] = group._count._all;
      summary.ALL += group._count._all;
    }
    return summary;
  },

  async getById(id: string): Promise<UserDto> {
    return toUserDto(await findActiveUser(id));
  },

  async create(actor: AuthUser, input: CreateUserInput, client: ClientInfo): Promise<UserDto> {
    await assertEmailAvailable(input.email);
    const role = await resolveAssignableRole(actor, input.roleId);
    const passwordHash = await hashPassword(input.password);

    return prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          status: 'ACTIVE',
          roleId: role.id,
        },
        select: userSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'user.created',
        entityType: 'user',
        entityId: created.id,
        metadata: { email: created.email, role: role.key },
        ...client,
      });
      return toUserDto(created);
    });
  },

  async update(actor: AuthUser, id: string, input: UpdateUserInput, client: ClientInfo): Promise<UserDto> {
    const target = await findActiveUser(id);
    assertCanManage(actor, target);
    await assertEmailAvailable(input.email, id);

    const roleChanged = input.roleId !== target.role.id;
    let roleKey = target.role.key;
    if (roleChanged) {
      assertNotSelf(actor, id, 'O‘z rolingizni o‘zgartira olmaysiz');
      roleKey = (await resolveAssignableRole(actor, input.roleId)).key;
      await assertKeepsActiveSuperAdmin(target);
    }

    const before = { firstName: target.firstName, lastName: target.lastName, email: target.email, phone: target.phone, role: target.role.key };
    const after = { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone ?? null, role: roleKey };
    const changes = (Object.keys(before) as Array<keyof typeof before>)
      .filter((field) => before[field] !== after[field])
      .map((field) => ({ field, from: before[field], to: after[field] }));

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone ?? null, roleId: input.roleId },
        select: userSelect,
      });
      if (changes.length > 0) {
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: roleChanged ? 'user.role_changed' : 'user.updated',
          entityType: 'user',
          entityId: id,
          metadata: { changes },
          ...client,
        });
      }
      return toUserDto(updated);
    });
  },

  async setStatus(actor: AuthUser, id: string, input: UpdateUserStatusInput, client: ClientInfo): Promise<UserDto> {
    assertNotSelf(actor, id, 'O‘z hisobingiz holatini o‘zgartira olmaysiz');
    const target = await findActiveUser(id);
    assertCanManage(actor, target);

    let roleId = target.role.id;
    if (input.roleId && input.roleId !== target.role.id) {
      roleId = (await resolveAssignableRole(actor, input.roleId)).id;
    }
    if (input.status === target.status && roleId === target.role.id) {
      return toUserDto(target);
    }
    if (input.status === 'BLOCKED') {
      await assertKeepsActiveSuperAdmin(target);
    }

    const action =
      input.status === 'BLOCKED' ? 'user.blocked' : target.status === 'PENDING' ? 'user.approved' : 'user.unblocked';

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: input.status, roleId },
        select: userSelect,
      });
      if (input.status === 'BLOCKED') {
        await revokeSessions(tx, id);
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action,
        entityType: 'user',
        entityId: id,
        metadata: { from: target.status, to: input.status, role: updated.role.key },
        ...client,
      });
      return toUserDto(updated);
    });
  },

  async resetPassword(actor: AuthUser, id: string, input: ResetUserPasswordInput, client: ClientInfo): Promise<void> {
    assertNotSelf(actor, id, 'O‘z parolingizni Profil sahifasida o‘zgartiring');
    const target = await findActiveUser(id);
    assertCanManage(actor, target);
    const passwordHash = await hashPassword(input.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, passwordChangedAt: new Date() } });
      await revokeSessions(tx, id);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'user.password_reset_by_admin',
        entityType: 'user',
        entityId: id,
        ...client,
      });
    });
  },

  /**
   * Soft delete: xodim tarixiy yozuvlarda (leadlar, to‘lovlar) qoladi, lekin tizimga kira olmaydi.
   * Email bo‘shatiladi — shu email bilan yangi xodim qo‘shish mumkin bo‘lsin.
   */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    assertNotSelf(actor, id, 'O‘z hisobingizni o‘chira olmaysiz');
    const target = await findActiveUser(id);
    assertCanManage(actor, target);
    await assertKeepsActiveSuperAdmin(target);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'BLOCKED', email: `deleted.${id}@deleted.invalid` },
      });
      await revokeSessions(tx, id);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'user.deleted',
        entityType: 'user',
        entityId: id,
        metadata: { email: target.email, name: `${target.firstName} ${target.lastName}`, role: target.role.key },
        ...client,
      });
    });
  },
};
