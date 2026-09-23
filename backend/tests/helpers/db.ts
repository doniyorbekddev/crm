import { prisma } from '../../src/config/database.js';
import { MAIN_BRANCH_ID, MAIN_BRANCH_KEY, MAIN_BRANCH_NAME } from '../../src/config/branch.js';
import { PERMISSION_DEFINITIONS, SYSTEM_ROLES } from '../../src/config/permissions.js';
import type { UserStatus } from '../../src/generated/prisma/client.js';
import { hashPassword } from '../../src/utils/password.js';

export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);
export const DEFAULT_PASSWORD = 'Password123';

function assertTestDatabase(): void {
  if (
    process.env.NODE_ENV !== 'test' ||
    !hasTestDatabase ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error('Test bazasi sozlanmagan — ma’lumotlarni tozalash to‘xtatildi');
  }
}

/** Test bazasidagi barcha jadvallarni tozalaydi (migratsiyalar jadvalidan tashqari). */
export async function resetDatabase(): Promise<void> {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((table) => `"public"."${table.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  // `branchId` ustunlarining DEFAULT qiymati 'branch_main' ga ishora qiladi —
  // tozalashdan keyin ham shu yozuv bo'lishi shart, aks holda har qanday INSERT FK xatosi beradi.
  await prisma.branch.create({
    data: { id: MAIN_BRANCH_ID, key: MAIN_BRANCH_KEY, name: MAIN_BRANCH_NAME, sortOrder: 0 },
  });
}

export async function seedRolesAndPermissions(): Promise<void> {
  await prisma.permission.createMany({
    data: PERMISSION_DEFINITIONS.map((permission) => ({
      key: permission.key,
      module: permission.module,
      description: permission.description,
    })),
  });
  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const permissionIdByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  for (const role of SYSTEM_ROLES) {
    const permissionIds = role.permissions.flatMap((key) => {
      const id = permissionIdByKey.get(key);
      return id ? [id] : [];
    });
    await prisma.role.create({
      data: {
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
  }
}

export interface TestUserOptions {
  email?: string;
  password?: string;
  status?: UserStatus;
  /** Rol kaliti (tizim roli yoki testda yaratilgan maxsus rol) */
  role?: string;
  firstName?: string;
  lastName?: string;
  /** Xodim qaysi filialda ishlaydi (standart — "Asosiy filial") */
  branchId?: string;
}

let userCounter = 0;

export async function createTestUser(options: TestUserOptions = {}) {
  userCounter += 1;
  const role = await prisma.role.findUniqueOrThrow({ where: { key: options.role ?? 'SALES_MANAGER' } });
  return prisma.user.create({
    data: {
      email: options.email ?? `user${userCounter}@test.uz`,
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? 'Foydalanuvchi',
      passwordHash: await hashPassword(options.password ?? DEFAULT_PASSWORD),
      status: options.status ?? 'ACTIVE',
      roleId: role.id,
      ...(options.branchId ? { branchId: options.branchId } : {}),
    },
  });
}
