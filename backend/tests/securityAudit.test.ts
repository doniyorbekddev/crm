import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

/** Faqat berilgan ruxsatlarga ega maxsus rol (masalan, maoshni ko‘rmaydigan metodist) */
async function createRole(key: string, permissionKeys: string[]) {
  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  return prisma.role.create({
    data: { key, name: key, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
}

describe.skipIf(!hasTestDatabase)('Xavfsizlik auditi (PHASE 15)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('teacher.view bor, salary.view yo‘q xodimga maosh ma’lumoti qaytarilmaydi', async () => {
    await createRole('METHODIST', [PERMISSIONS.TEACHER_VIEW]);
    const { token: methodistToken } = await createUserWithToken(app, { role: 'METHODIST' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const profile = await prisma.teacherProfile.create({ data: { userId: teacher.id } });
    await prisma.teacherSalaryRule.create({
      data: { teacherProfileId: profile.id, type: 'FIXED', baseSalary: 7_000_000, effectiveFrom: new Date('2026-01-01') },
    });

    const list = await request(app).get('/api/teachers').set(bearer(methodistToken));
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ salaryRule: null, salaryVisible: false });
    expect(JSON.stringify(list.body)).not.toContain('7000000');

    const detail = await request(app).get(`/api/teachers/${profile.id}`).set(bearer(methodistToken));
    expect(detail.body.data).toMatchObject({ salaryRules: [], salaryPeriods: [], salaryTotals: null, salaryVisible: false });

    expect((await request(app).get(`/api/teachers/${profile.id}/salary-rules`).set(bearer(methodistToken))).status).toBe(403);

    // Ruxsati bor xodim to'liq ko'radi
    const adminList = await request(app).get('/api/teachers').set(bearer(adminToken));
    expect(adminList.body.data[0]).toMatchObject({ salaryVisible: true, salaryRule: { baseSalary: 7_000_000 } });
  });

  it('xarajat va uy vazifasiga mijoz fayl yo‘lini yoza olmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const category = await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara' } });

    const response = await request(app)
      .post('/api/expenses')
      .set(bearer(token))
      .send({ categoryId: category.id, amount: 100_000, method: 'CASH', attachmentPath: '../../etc/passwd' });
    expect(response.status).toBe(201);
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(expense.attachmentPath).toBeNull();
  });

  it('bildirishnomani boshqa foydalanuvchi o‘qiy yoki o‘chira olmaydi', async () => {
    const { user: owner } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: attackerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const notification = await prisma.notification.create({
      data: { userId: owner.id, type: 'SYSTEM', title: 'Maxfiy', message: 'Faqat egasi uchun' },
    });

    const read = await request(app).patch(`/api/notifications/${notification.id}/read`).set(bearer(attackerToken));
    const removed = await request(app).delete(`/api/notifications/${notification.id}`).set(bearer(attackerToken));
    expect([403, 404]).toContain(read.status);
    expect([403, 404]).toContain(removed.status);

    const stillThere = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(stillThere.readAt).toBeNull();
  });
});
