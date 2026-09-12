import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginAs } from './helpers/auth.js';
import { DEFAULT_PASSWORD, createTestUser, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

async function roleIdOf(key: string): Promise<string> {
  return (await prisma.role.findUniqueOrThrow({ where: { key } })).id;
}

describe.skipIf(!hasTestDatabase)('Users API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Ruxsatlar', () => {
    it('tokensiz 401, user.view ruxsati yo‘q rolga 403 qaytaradi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

      expect((await request(app).get('/api/users')).status).toBe(401);
      expect((await request(app).get('/api/users').set(bearer(token))).status).toBe(403);
    });

    it('Admin ro‘yxatni ko‘ra oladi, lekin xodim qo‘sha olmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });

      const list = await request(app).get('/api/users').set(bearer(token));
      const create = await request(app)
        .post('/api/users')
        .set(bearer(token))
        .send({ firstName: 'Ali', lastName: 'Valiyev', email: 'ali@test.uz', roleId: await roleIdOf('SALES_MANAGER'), password: 'Kuchli123' });

      expect(list.status).toBe(200);
      expect(create.status).toBe(403);
    });
  });

  describe('GET /api/users', () => {
    it('qidiruv, holat filtri, pagination va holatlar bo‘yicha sonlarni qaytaradi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'boss@test.uz' });
      await createTestUser({ email: 'ali@test.uz', firstName: 'Ali', lastName: 'Valiyev' });
      await createTestUser({ email: 'vali@test.uz', firstName: 'Vali', lastName: 'Aliyev', status: 'PENDING' });
      await createTestUser({ email: 'sardor@test.uz', firstName: 'Sardor', lastName: 'Karimov', status: 'BLOCKED' });

      const search = await request(app).get('/api/users').query({ search: 'ali' }).set(bearer(token));
      const fullName = await request(app).get('/api/users').query({ search: 'sardor karimov' }).set(bearer(token));
      const pending = await request(app).get('/api/users').query({ status: 'PENDING' }).set(bearer(token));
      const paged = await request(app).get('/api/users').query({ page: 2, limit: 2 }).set(bearer(token));
      const summary = await request(app).get('/api/users/summary').set(bearer(token));

      const emails = (response: request.Response) => (response.body.data as Array<{ email: string }>).map((user) => user.email).sort();
      expect(emails(search)).toEqual(['ali@test.uz', 'vali@test.uz']);
      expect(emails(fullName)).toEqual(['sardor@test.uz']);
      expect(emails(pending)).toEqual(['vali@test.uz']);
      expect(paged.body.data).toHaveLength(2);
      expect(paged.body.meta).toEqual({ page: 2, limit: 2, total: 4, totalPages: 2 });
      expect(summary.body.data).toEqual({ ALL: 4, ACTIVE: 2, PENDING: 1, BLOCKED: 1 });
    });

    it('noto‘g‘ri query parametrlari uchun 422 qaytaradi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });

      const response = await request(app).get('/api/users').query({ limit: 500, status: 'NOMA_LUM' }).set(bearer(token));

      expect(response.status).toBe(422);
    });
  });

  describe('POST /api/users', () => {
    it('faol xodim yaratadi va u darhol tizimga kira oladi', async () => {
      const { token, user: admin } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });

      const response = await request(app)
        .post('/api/users')
        .set(bearer(token))
        .send({
          firstName: 'Gulnora',
          lastName: 'Saidova',
          email: 'Gulnora@Test.uz',
          phone: '+998 91 234 56 78',
          roleId: await roleIdOf('ACCOUNTANT'),
          password: 'Buxgalter123',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        email: 'gulnora@test.uz',
        phone: '+998912345678',
        status: 'ACTIVE',
        role: { key: 'ACCOUNTANT' },
      });
      expect(response.body.data).not.toHaveProperty('passwordHash');
      await expect(loginAs(app, 'gulnora@test.uz', 'Buxgalter123')).resolves.toEqual(expect.any(String));
      expect(await prisma.auditLog.count({ where: { action: 'user.created', userId: admin.id } })).toBe(1);
    });

    it('band email uchun 409, noma’lum rol va zaif parol uchun 422 qaytaradi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
      await createTestUser({ email: 'band@test.uz' });
      const roleId = await roleIdOf('SALES_MANAGER');
      const base = { firstName: 'Ali', lastName: 'Valiyev', password: 'Kuchli123' };

      const duplicate = await request(app).post('/api/users').set(bearer(token)).send({ ...base, email: 'band@test.uz', roleId });
      const unknownRole = await request(app).post('/api/users').set(bearer(token)).send({ ...base, email: 'yangi@test.uz', roleId: 'mavjud-emas' });
      const weakPassword = await request(app)
        .post('/api/users')
        .set(bearer(token))
        .send({ ...base, email: 'yangi2@test.uz', roleId, password: 'zaif' });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.errors).toEqual([{ field: 'email', message: 'Bu email band' }]);
      expect(unknownRole.status).toBe(422);
      expect(unknownRole.body.errors).toEqual([{ field: 'roleId', message: 'Rol topilmadi' }]);
      expect(weakPassword.status).toBe(422);
    });
  });

  describe('Tasdiqlash va bloklash', () => {
    it('PENDING xodimni tanlangan rol bilan tasdiqlaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
      const pending = await createTestUser({ email: 'yangi@test.uz', status: 'PENDING', role: 'CALL_CENTER' });

      const response = await request(app)
        .patch(`/api/users/${pending.id}/status`)
        .set(bearer(token))
        .send({ status: 'ACTIVE', roleId: await roleIdOf('ACCOUNTANT') });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ status: 'ACTIVE', role: { key: 'ACCOUNTANT' } });
      await expect(loginAs(app, 'yangi@test.uz')).resolves.toEqual(expect.any(String));
      expect(await prisma.auditLog.count({ where: { action: 'user.approved', entityId: pending.id } })).toBe(1);
    });

    it('bloklangan xodimning tokeni va sessiyalari darhol ishlamay qoladi, blokdan chiqarilgach kira oladi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
      const { user: target, token: targetToken } = await createUserWithToken(app, { email: 'xodim@test.uz' });

      const block = await request(app).patch(`/api/users/${target.id}/status`).set(bearer(token)).send({ status: 'BLOCKED' });

      expect(block.status).toBe(200);
      expect((await request(app).get('/api/auth/me').set(bearer(targetToken))).status).toBe(401);
      expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
      expect((await request(app).post('/api/auth/login').send({ email: 'xodim@test.uz', password: DEFAULT_PASSWORD })).status).toBe(403);

      const unblock = await request(app).patch(`/api/users/${target.id}/status`).set(bearer(token)).send({ status: 'ACTIVE' });
      expect(unblock.status).toBe(200);
      await expect(loginAs(app, 'xodim@test.uz')).resolves.toEqual(expect.any(String));
    });

    it('o‘z hisobini bloklash, o‘chirish va o‘z rolini o‘zgartirish taqiqlanadi', async () => {
      const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'boss@test.uz' });

      const block = await request(app).patch(`/api/users/${user.id}/status`).set(bearer(token)).send({ status: 'BLOCKED' });
      const remove = await request(app).delete(`/api/users/${user.id}`).set(bearer(token));
      const demote = await request(app)
        .put(`/api/users/${user.id}`)
        .set(bearer(token))
        .send({ firstName: 'Boss', lastName: 'Admin', email: 'boss@test.uz', roleId: await roleIdOf('ADMIN') });
      const rename = await request(app)
        .put(`/api/users/${user.id}`)
        .set(bearer(token))
        .send({ firstName: 'Yangi', lastName: 'Ism', email: 'boss@test.uz', roleId: await roleIdOf('SUPER_ADMIN') });

      expect(block.status).toBe(403);
      expect(remove.status).toBe(403);
      expect(demote.status).toBe(403);
      expect(rename.status).toBe(200);
      expect(rename.body.data).toMatchObject({ firstName: 'Yangi', role: { key: 'SUPER_ADMIN' } });
    });
  });

  describe('Parolni tiklash va o‘chirish', () => {
    it('admin parolni tiklaydi — eski parol ishlamaydi va sessiyalar yopiladi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
      const { user: target } = await createUserWithToken(app, { email: 'xodim@test.uz' });

      const response = await request(app)
        .patch(`/api/users/${target.id}/password`)
        .set(bearer(token))
        .send({ password: 'YangiParol456' });

      expect(response.status).toBe(200);
      expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
      expect((await request(app).post('/api/auth/login').send({ email: 'xodim@test.uz', password: DEFAULT_PASSWORD })).status).toBe(401);
      await expect(loginAs(app, 'xodim@test.uz', 'YangiParol456')).resolves.toEqual(expect.any(String));
    });

    it('o‘chirilgan xodim ro‘yxatda ko‘rinmaydi, kira olmaydi va uning emaili bo‘shaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
      const target = await createTestUser({ email: 'ketgan@test.uz' });

      const remove = await request(app).delete(`/api/users/${target.id}`).set(bearer(token));
      const list = await request(app).get('/api/users').set(bearer(token));
      const login = await request(app).post('/api/auth/login').send({ email: 'ketgan@test.uz', password: DEFAULT_PASSWORD });
      const recreate = await request(app)
        .post('/api/users')
        .set(bearer(token))
        .send({ firstName: 'Yangi', lastName: 'Xodim', email: 'ketgan@test.uz', roleId: await roleIdOf('CALL_CENTER'), password: 'Kuchli123' });

      expect(remove.status).toBe(200);
      expect((list.body.data as Array<{ id: string }>).some((user) => user.id === target.id)).toBe(false);
      expect(login.status).toBe(401);
      expect(recreate.status).toBe(201);
      const deleted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(deleted.deletedAt).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { action: 'user.deleted', entityId: target.id } })).toBe(1);
    });
  });

  describe('Super Admin himoyasi', () => {
    it('user.manage ruxsatli oddiy rol Super Admin rolini bera olmaydi va Super Admin’ni boshqara olmaydi', async () => {
      const permissions = await prisma.permission.findMany({ where: { key: { in: ['user.view', 'user.manage'] } } });
      await prisma.role.create({
        data: {
          key: 'HR_MANAGER',
          name: 'HR menejer',
          permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
        },
      });
      const { token } = await createUserWithToken(app, { role: 'HR_MANAGER' });
      const superAdmin = await createTestUser({ role: 'SUPER_ADMIN' });
      const base = { firstName: 'Ali', lastName: 'Valiyev', password: 'Kuchli123' };

      const assignSuperAdmin = await request(app)
        .post('/api/users')
        .set(bearer(token))
        .send({ ...base, email: 'yangi@test.uz', roleId: await roleIdOf('SUPER_ADMIN') });
      const blockSuperAdmin = await request(app).patch(`/api/users/${superAdmin.id}/status`).set(bearer(token)).send({ status: 'BLOCKED' });
      const createRegular = await request(app)
        .post('/api/users')
        .set(bearer(token))
        .send({ ...base, email: 'oddiy@test.uz', roleId: await roleIdOf('SALES_MANAGER') });

      expect(assignSuperAdmin.status).toBe(403);
      expect(blockSuperAdmin.status).toBe(403);
      expect(createRegular.status).toBe(201);
    });
  });
});
