import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { PERMISSION_DEFINITIONS, SYSTEM_ROLES } from '../src/config/permissions.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { createTestUser, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

async function roleWithPermissions(key: string) {
  return prisma.role.findUniqueOrThrow({
    where: { key },
    include: { permissions: { include: { permission: true } } },
  });
}

describe.skipIf(!hasTestDatabase)('Roles API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rollar ro‘yxatini Super Admin va Admin ko‘ra oladi, Sales Manager — yo‘q', async () => {
    const { token: superAdmin } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

    const response = await request(app).get('/api/roles').set(bearer(superAdmin));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(SYSTEM_ROLES.length);
    expect(response.body.data[0]).toMatchObject({ key: 'SUPER_ADMIN', isSystem: true, userCount: 1 });
    // Super Admin — o‘qituvchining shaxsiy "Mening daromadim" ruxsatidan tashqari hammasi
    expect(response.body.data[0].permissions).toHaveLength(PERMISSION_DEFINITIONS.length - 1);
    expect((await request(app).get('/api/roles').set(bearer(admin))).status).toBe(200);
    expect((await request(app).get('/api/roles').set(bearer(sales))).status).toBe(403);
  });

  it('permissionlar ro‘yxati faqat role.manage ruxsati bilan', async () => {
    const { token: superAdmin } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });

    const response = await request(app).get('/api/permissions').set(bearer(superAdmin));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(PERMISSION_DEFINITIONS.length);
    expect(response.body.data[0]).toMatchObject({ key: 'dashboard.view', module: 'dashboard' });
    expect((await request(app).get('/api/permissions').set(bearer(admin))).status).toBe(403);
  });

  it('rol ruxsatlari o‘zgarganda kesh darhol yangilanadi', async () => {
    const { token: superAdmin } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    expect((await request(app).get('/api/users').set(bearer(sales))).status).toBe(403);

    const salesRole = await roleWithPermissions('SALES_MANAGER');
    const keys = [...salesRole.permissions.map((item) => item.permission.key), 'user.view'];

    const update = await request(app)
      .put(`/api/roles/${salesRole.id}/permissions`)
      .set(bearer(superAdmin))
      .send({ permissionKeys: keys });

    expect(update.status).toBe(200);
    expect(update.body.data.permissions).toContain('user.view');
    expect((await request(app).get('/api/users').set(bearer(sales))).status).toBe(200);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'role.permissions_updated', entityId: salesRole.id } });
    expect(audit.metadata).toMatchObject({ added: ['user.view'], removed: [] });
  });

  it('Super Admin roli ruxsatlarini o‘zgartirib bo‘lmaydi, noma’lum permission uchun 422', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const superAdminRole = await roleWithPermissions('SUPER_ADMIN');
    const salesRole = await roleWithPermissions('SALES_MANAGER');

    const lockSuperAdmin = await request(app)
      .put(`/api/roles/${superAdminRole.id}/permissions`)
      .set(bearer(token))
      .send({ permissionKeys: [] });
    const unknown = await request(app)
      .put(`/api/roles/${salesRole.id}/permissions`)
      .set(bearer(token))
      .send({ permissionKeys: ['lead.view', 'mavjud.emas'] });

    expect(lockSuperAdmin.status).toBe(403);
    expect(unknown.status).toBe(422);
    expect(unknown.body.errors[0].field).toBe('permissionKeys');
  });

  it('yangi rol yaratiladi; band kalit, tizim roli va xodimi bor rolni o‘chirish taqiqlanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });

    const created = await request(app)
      .post('/api/roles')
      .set(bearer(token))
      .send({ key: 'senior_manager', name: 'Katta menejer', permissionKeys: ['lead.view', 'lead.create'] });
    const duplicate = await request(app)
      .post('/api/roles')
      .set(bearer(token))
      .send({ key: 'SENIOR_MANAGER', name: 'Boshqa nom' });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ key: 'SENIOR_MANAGER', isSystem: false, userCount: 0, permissions: ['lead.view', 'lead.create'] });
    expect(duplicate.status).toBe(409);

    const systemRole = await roleWithPermissions('SALES_MANAGER');
    expect((await request(app).delete(`/api/roles/${systemRole.id}`).set(bearer(token))).status).toBe(403);

    const member = await createTestUser({ role: 'SENIOR_MANAGER' });
    const roleId = created.body.data.id as string;
    expect((await request(app).delete(`/api/roles/${roleId}`).set(bearer(token))).status).toBe(409);

    await prisma.user.update({ where: { id: member.id }, data: { deletedAt: new Date() } });
    const removed = await request(app).delete(`/api/roles/${roleId}`).set(bearer(token));

    expect(removed.status).toBe(200);
    expect(await prisma.role.findUnique({ where: { id: roleId } })).toBeNull();
    const reassigned = await prisma.user.findUniqueOrThrow({ where: { id: member.id }, include: { role: true } });
    expect(reassigned.role.key).toBe('CALL_CENTER');
  });
});
