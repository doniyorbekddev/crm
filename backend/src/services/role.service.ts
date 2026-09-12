import { prisma } from '../config/database.js';
import { PERMISSION_DEFINITIONS, ROLE_KEYS, SYSTEM_ROLES } from '../config/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CreateRoleInput, SetRolePermissionsInput, UpdateRoleInput } from '../validators/role.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';

const roleSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: { where: { deletedAt: null } } } },
} satisfies Prisma.RoleSelect;

type RoleRecord = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
  createdAt: string;
}

export interface PermissionDto {
  id: string;
  key: string;
  module: string;
  description: string;
}

/** Ro‘yxatlarda kodda belgilangan tartib saqlanadi (Super Admin birinchi, modullar mantiqiy ketma-ketlikda). */
const ROLE_ORDER = new Map<string, number>(SYSTEM_ROLES.map((role, index) => [role.key, index]));
const PERMISSION_ORDER = new Map<string, number>(PERMISSION_DEFINITIONS.map((permission, index) => [permission.key, index]));

function permissionRank(key: string): number {
  return PERMISSION_ORDER.get(key) ?? Number.MAX_SAFE_INTEGER;
}

function toRoleDto(role: RoleRecord): RoleDto {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: role.permissions.map((item) => item.permission.key).sort((a, b) => permissionRank(a) - permissionRank(b)),
    createdAt: role.createdAt.toISOString(),
  };
}

async function findRole(id: string): Promise<RoleRecord> {
  const role = await prisma.role.findUnique({ where: { id }, select: roleSelect });
  if (!role) {
    throw AppError.notFound('Rol topilmadi');
  }
  return role;
}

/** Kalitlar bazadagi permissionlarga mos kelishini tekshiradi va ularning ID larini qaytaradi. */
async function resolvePermissionIds(keys: readonly string[]): Promise<string[]> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return [];

  const permissions = await prisma.permission.findMany({ where: { key: { in: unique } }, select: { id: true, key: true } });
  const found = new Set(permissions.map((permission) => permission.key));
  const unknown = unique.filter((key) => !found.has(key));
  if (unknown.length > 0) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
      { field: 'permissionKeys', message: `Noma’lum ruxsat: ${unknown.join(', ')}` },
    ]);
  }
  return permissions.map((permission) => permission.id);
}

export const roleService = {
  async list(): Promise<RoleDto[]> {
    const roles = await prisma.role.findMany({ select: roleSelect });
    return roles
      .map(toRoleDto)
      .sort(
        (a, b) =>
          (ROLE_ORDER.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (ROLE_ORDER.get(b.key) ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name),
      );
  },

  async listPermissions(): Promise<PermissionDto[]> {
    const permissions = await prisma.permission.findMany({ select: { id: true, key: true, module: true, description: true } });
    return permissions.sort((a, b) => permissionRank(a.key) - permissionRank(b.key));
  },

  async create(actor: AuthUser, input: CreateRoleInput, client: ClientInfo): Promise<RoleDto> {
    const existing = await prisma.role.findUnique({ where: { key: input.key }, select: { id: true } });
    if (existing) {
      throw AppError.conflict('Bunday kalitli rol allaqachon mavjud', [{ field: 'key', message: 'Bu kalit band' }]);
    }
    const permissionIds = await resolvePermissionIds(input.permissionKeys);

    return prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description ?? null,
          isSystem: false,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
        select: roleSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'role.created',
        entityType: 'role',
        entityId: created.id,
        metadata: { key: created.key, name: created.name, permissions: input.permissionKeys },
        ...client,
      });
      return toRoleDto(created);
    });
  },

  async update(actor: AuthUser, id: string, input: UpdateRoleInput, client: ClientInfo): Promise<RoleDto> {
    const role = await findRole(id);
    const updated = await prisma.role.update({
      where: { id },
      data: { name: input.name, description: input.description ?? null },
      select: roleSelect,
    });
    await auditService.record({
      userId: actor.id,
      action: 'role.updated',
      entityType: 'role',
      entityId: id,
      metadata: {
        from: { name: role.name, description: role.description },
        to: { name: updated.name, description: updated.description },
      },
      ...client,
    });
    return toRoleDto(updated);
  },

  async setPermissions(actor: AuthUser, id: string, input: SetRolePermissionsInput, client: ClientInfo): Promise<RoleDto> {
    const role = await findRole(id);
    if (role.key === ROLE_KEYS.SUPER_ADMIN) {
      throw AppError.forbidden('Super Admin roli har doim barcha ruxsatlarga ega — uni o‘zgartirib bo‘lmaydi');
    }

    const permissionIds = await resolvePermissionIds(input.permissionKeys);
    const before = new Set(role.permissions.map((item) => item.permission.key));
    const after = new Set(input.permissionKeys);
    const added = [...after].filter((key) => !before.has(key));
    const removed = [...before].filter((key) => !after.has(key));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId: { notIn: permissionIds } } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }
      if (added.length > 0 || removed.length > 0) {
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'role.permissions_updated',
          entityType: 'role',
          entityId: id,
          metadata: { role: role.key, added, removed },
          ...client,
        });
      }
      return tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect });
    });

    permissionService.invalidate(id);
    return toRoleDto(updated);
  },

  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const role = await findRole(id);
    if (role.isSystem) {
      throw AppError.forbidden('Tizim rolini o‘chirib bo‘lmaydi');
    }
    if (role._count.users > 0) {
      throw AppError.conflict(`Bu rolda ${role._count.users} ta xodim bor. Avval ularni boshqa rolga o‘tkazing`);
    }

    // O‘chirilgan (soft delete) xodimlar ham rolga bog‘langan — ular eng kam huquqli tizim roliga o‘tkaziladi
    const fallbackRole = await prisma.role.findUnique({ where: { key: ROLE_KEYS.CALL_CENTER }, select: { id: true } });

    await prisma.$transaction(async (tx) => {
      if (fallbackRole) {
        await tx.user.updateMany({ where: { roleId: id, deletedAt: { not: null } }, data: { roleId: fallbackRole.id } });
      }
      await tx.role.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'role.deleted',
        entityType: 'role',
        entityId: id,
        metadata: { key: role.key, name: role.name },
        ...client,
      });
    });

    permissionService.invalidate(id);
  },
};
