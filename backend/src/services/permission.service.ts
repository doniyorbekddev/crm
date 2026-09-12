import { prisma } from '../config/database.js';

/** Rol ruxsatlari har so‘rovda bazadan o‘qilmasligi uchun qisqa muddatli kesh. */
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: ReadonlySet<string>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export const permissionService = {
  async getRolePermissions(roleId: string): Promise<ReadonlySet<string>> {
    const cached = cache.get(roleId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const rows = await prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { key: true } } },
    });
    const permissions: ReadonlySet<string> = new Set(rows.map((row) => row.permission.key));
    cache.set(roleId, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
    return permissions;
  },

  async hasPermission(roleId: string, permission: string): Promise<boolean> {
    return (await this.getRolePermissions(roleId)).has(permission);
  },

  /**
   * Rol ruxsatlari o‘zgarganda chaqiriladi. Bitta server nusxasida o‘zgarish darhol kuchga kiradi;
   * bir nechta nusxa ishlasa — boshqalarida kesh muddati (60 soniya) tugagach.
   */
  invalidate(roleId?: string): void {
    if (roleId) {
      cache.delete(roleId);
    } else {
      cache.clear();
    }
  },
};
