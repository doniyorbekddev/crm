import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { findSubject } from '../src/services/staffAttendance/planning.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();
const roleIdOf = async (key: string) => (await prisma.role.findUniqueOrThrow({ where: { key } })).id;

describe.skipIf(!hasTestDatabase)('TEACHER roli — o‘qituvchi profili avtomatik (xodim davomati QR uchun)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('STUDENT sifatida yaratilib, roli TEACHER ga o‘zgartirilgan foydalanuvchi davomat subyekti bo‘ladi; ikkinchi marta profil ochilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const created = await request(app)
      .post('/api/users')
      .set(bearer(token))
      .send({ firstName: 'Elbek', lastName: 'Akbarov', email: 'elbek@test.uz', roleId: await roleIdOf('STUDENT'), password: 'Kuchli123' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(await prisma.teacherProfile.count({ where: { userId: id } })).toBe(0);
    expect(await findSubject(id)).toBeNull();

    const teacherRole = await roleIdOf('TEACHER');
    const changed = await request(app)
      .put(`/api/users/${id}`)
      .set(bearer(token))
      .send({ firstName: 'Elbek', lastName: 'Akbarov', email: 'elbek@test.uz', roleId: teacherRole });
    expect(changed.status).toBe(200);

    const profile = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile).toMatchObject({ employmentStatus: 'ACTIVE', isActive: true });
    expect(await findSubject(id)).toMatchObject({ id });
    expect(await prisma.employmentHistory.count({ where: { userId: id, type: 'HIRED' } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'teacher.profile_created', entityId: profile.id } });
    expect(audit.metadata).toMatchObject({ teacher: 'Elbek Akbarov', automatic: true, reason: 'user.role_changed' });

    // Ism o'zgarishi — rol o'zgarmadi, yangi profil yoki yozuv yo'q
    await request(app).put(`/api/users/${id}`).set(bearer(token)).send({ firstName: 'Elbek', lastName: 'Akbarov', email: 'elbek2@test.uz', roleId: teacherRole }).expect(200);
    expect(await prisma.teacherProfile.count({ where: { userId: id } })).toBe(1);
    expect(await prisma.employmentHistory.count({ where: { userId: id } })).toBe(1);
  });

  it('TEACHER rolida yaratilganda ham, holat oynasida rol berilganda ham profil ochiladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const direct = await request(app)
      .post('/api/users')
      .set(bearer(token))
      .send({ firstName: 'Ustoz', lastName: 'Bir', email: 'ustoz1@test.uz', roleId: await roleIdOf('TEACHER'), password: 'Kuchli123' });
    expect(direct.status).toBe(201);
    expect(await findSubject(direct.body.data.id)).not.toBeNull();

    const other = await request(app)
      .post('/api/users')
      .set(bearer(token))
      .send({ firstName: 'Ustoz', lastName: 'Ikki', email: 'ustoz2@test.uz', roleId: await roleIdOf('SALES_MANAGER'), password: 'Kuchli123' });
    const id = other.body.data.id as string;
    await request(app).patch(`/api/users/${id}/status`).set(bearer(token)).send({ status: 'BLOCKED' }).expect(200);
    await request(app).patch(`/api/users/${id}/status`).set(bearer(token)).send({ status: 'ACTIVE', roleId: await roleIdOf('TEACHER') }).expect(200);
    expect(await prisma.teacherProfile.count({ where: { userId: id } })).toBe(1);
    expect(await findSubject(id)).not.toBeNull();
  });
});
