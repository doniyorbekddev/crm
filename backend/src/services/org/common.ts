import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { ROLE_KEYS } from '../../config/permissions.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { businessDateString } from '../../utils/dates.js';

/**
 * ORG tizimi modullari uchun umumiy yordamchilar.
 */

export type Person = { id: string; firstName: string; lastName: string };

export const personSelect = { select: { id: true, firstName: true, lastName: true } } as const;

export const fullName = (person: { firstName: string; lastName: string | null }) => `${person.firstName} ${person.lastName ?? ''}`.trim();

/** Xodim hisobi: o'quvchi va ota-ona kabinetlari emas */
export const staffRoleWhere: Prisma.RoleWhereInput = {
  permissions: { none: { permission: { key: { in: [PERMISSIONS.PORTAL_STUDENT, PERMISSIONS.PORTAL_PARENT] } } } },
};

/**
 * Ruxsat egalari: faol, shu filialda (yoki barcha filialni ko'radigan). `branchId` null — filialdan qat'i nazar hammasi.
 * Bildirishnoma qabul qiluvchilarini topish uchun.
 */
export async function permissionHolders(permission: string, branchId: string | null, exceptUserId?: string | null): Promise<string[]> {
  const withPermission = (key: string) => ({ permissions: { some: { permission: { key } } } });
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      role: withPermission(permission),
      ...(branchId ? { OR: [{ branchId }, { role: withPermission(PERMISSIONS.BRANCH_VIEW_ALL) }] } : {}),
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Markaz rahbari (CEO): Owner roli egalari, bo'lmasa Super Admin */
export async function ceoUsers(): Promise<Array<Person & { roleName: string }>> {
  for (const key of [ROLE_KEYS.OWNER, ROLE_KEYS.SUPER_ADMIN]) {
    const users = await prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE', role: { key } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    });
    if (users.length > 0) return users.map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, roleName: user.role.name }));
  }
  return [];
}

export const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

/** Markaz vaqti bo'yicha bugungi sana — `@db.Date` ustuni bilan solishtirish uchun */
export function businessToday(now: Date = new Date()): Date {
  return new Date(`${businessDateString(now)}T00:00:00.000Z`);
}

export const DAY_MS = 86_400_000;

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
