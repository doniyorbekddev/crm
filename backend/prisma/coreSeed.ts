/**
 * Ishlab chiqarish (production) va development uchun umumiy asosiy ma'lumotlar:
 * permissionlar, tizim rollari va lead manbalari. Har safar upsert — takrorlanmaydi.
 *
 * Bu modul `seed.ts` (development) va `bootstrap.ts` (production) tomonidan ishlatiladi,
 * shuning uchun bir xil ro‘yxat ikki joyda saqlanmaydi.
 */
import { MAIN_BRANCH_ID, MAIN_BRANCH_KEY, MAIN_BRANCH_NAME } from '../src/config/branch.js';
import { PERMISSION_DEFINITIONS, SYSTEM_ROLES } from '../src/config/permissions.js';
import type { RoleKey } from '../src/config/permissions.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

type Log = (message: string) => void;

export const LEAD_SOURCES: ReadonlyArray<{ key: string; name: string }> = [
  { key: 'INSTAGRAM', name: 'Instagram' },
  { key: 'TELEGRAM', name: 'Telegram' },
  { key: 'FACEBOOK', name: 'Facebook' },
  { key: 'YOUTUBE', name: 'YouTube' },
  { key: 'GOOGLE', name: 'Google' },
  { key: 'WEBSITE', name: 'Veb-sayt' },
  { key: 'RECOMMENDATION', name: 'Tavsiya' },
  { key: 'WALK_IN', name: 'O‘zi kelgan (walk-in)' },
  { key: 'PHONE', name: 'Telefon qo‘ng‘irog‘i' },
  { key: 'ADVERTISEMENT', name: 'Reklama' },
  { key: 'OTHER', name: 'Boshqa' },
];

/**
 * "Asosiy filial" — migratsiya uni yaratadi, lekin bo'sh bazada (test, e2e) ham
 * bo'lishi shart: `branchId` ustunlarining DEFAULT qiymati shunga ishora qiladi.
 */
export async function ensureMainBranch(prisma: PrismaClient, log?: Log): Promise<string> {
  await prisma.branch.upsert({
    where: { id: MAIN_BRANCH_ID },
    update: {},
    create: { id: MAIN_BRANCH_ID, key: MAIN_BRANCH_KEY, name: MAIN_BRANCH_NAME, sortOrder: 0 },
  });
  log?.('✔ Asosiy filial');
  return MAIN_BRANCH_ID;
}

/**
 * Permission va tizim rollari. Mavjud rolning permissionlari Super Admin tomonidan
 * o‘zgartirilgan bo‘lishi mumkin, shuning uchun ular faqat rol yangi bo‘lganda yoki
 * `SEED_RESET_PERMISSIONS=true` bo‘lganda qayta yoziladi.
 */
export async function seedRolesAndPermissions(prisma: PrismaClient, log: Log): Promise<Map<RoleKey, string>> {
  for (const permission of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { module: permission.module, description: permission.description },
      create: { key: permission.key, module: permission.module, description: permission.description },
    });
  }

  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const permissionIdByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
  const resetPermissions = process.env.SEED_RESET_PERMISSIONS === 'true';
  const roleIdByKey = new Map<RoleKey, string>();

  for (const role of SYSTEM_ROLES) {
    const permissionIds = role.permissions.map((key) => {
      const id = permissionIdByKey.get(key);
      if (!id) throw new Error(`Permission topilmadi: ${key}`);
      return id;
    });

    const existing = await prisma.role.findUnique({ where: { key: role.key } });
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, isSystem: true },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
    });
    roleIdByKey.set(role.key, saved.id);

    if (!existing || resetPermissions) {
      await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: saved.id, permissionId })),
      });
    }
  }

  log(`✔ ${PERMISSION_DEFINITIONS.length} ta permission, ${SYSTEM_ROLES.length} ta rol`);
  return roleIdByKey;
}

/** Lead manbalari — reklama ROI hisobi ham shu ro‘yxatga tayanadi */
export async function seedLeadSources(prisma: PrismaClient, log: Log): Promise<Map<string, string>> {
  const sourceIdByKey = new Map<string, string>();
  for (const [index, source] of LEAD_SOURCES.entries()) {
    const saved = await prisma.source.upsert({
      where: { key: source.key },
      update: {},
      create: { key: source.key, name: source.name, sortOrder: index },
    });
    sourceIdByKey.set(source.key, saved.id);
  }
  log(`✔ ${LEAD_SOURCES.length} ta lead manbasi`);
  return sourceIdByKey;
}
