import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MAIN_BRANCH_ID } from '../src/config/branch.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function createSecondBranch() {
  return prisma.branch.create({
    data: { key: 'CHILONZOR', name: 'Chilonzor filiali', sortOrder: 1 },
  });
}

describe.skipIf(!hasTestDatabase)('Filiallar (branch) — izolyatsiya va boshqaruv', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('asosiy filial doimo mavjud va mavjud yozuvlar unga biriktiriladi', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const main = await prisma.branch.findUnique({ where: { id: MAIN_BRANCH_ID } });

    expect(main?.key).toBe('MAIN');
    // branchId ustunining DEFAULT qiymati — yangi xodim ham asosiy filialga tushadi
    expect(user.branchId).toBe(MAIN_BRANCH_ID);
  });

  it('filial qo‘shish faqat branch.manage bilan (Owner), Admin qo‘sha olmaydi', async () => {
    const { token: ownerToken } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const payload = { key: 'YUNUSOBOD', name: 'Yunusobod filiali' };

    const byAdmin = await request(app).post('/api/branches').set(bearer(adminToken)).send(payload);
    const byOwner = await request(app).post('/api/branches').set(bearer(ownerToken)).send(payload);

    expect(byAdmin.status).toBe(403);
    expect(byOwner.status).toBe(201);
    expect(byOwner.body.data).toMatchObject({ key: 'YUNUSOBOD', name: 'Yunusobod filiali', isMain: false });
  });

  it('takrorlanadigan kalit va noto‘g‘ri format rad etiladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    await request(app).post('/api/branches').set(bearer(token)).send({ key: 'SERGELI', name: 'Sergeli' });

    const duplicate = await request(app).post('/api/branches').set(bearer(token)).send({ key: 'SERGELI', name: 'Boshqa' });
    const badKey = await request(app).post('/api/branches').set(bearer(token)).send({ key: 'sergeli-2', name: 'Sergeli 2' });

    expect(duplicate.status).toBe(409);
    expect(badKey.status).toBe(422);
  });

  it('asosiy filialni o‘chirib bo‘lmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });

    const response = await request(app).put(`/api/branches/${MAIN_BRANCH_ID}`).set(bearer(token)).send({ isActive: false });

    expect(response.status).toBe(422);
    expect(await prisma.branch.findUnique({ where: { id: MAIN_BRANCH_ID } })).toMatchObject({ isActive: true });
  });

  it('Owner barcha filiallarni ko‘radi, filialga bog‘langan xodim faqat o‘zinikini', async () => {
    const second = await createSecondBranch();
    const { token: ownerToken } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN', branchId: second.id });

    const ownerList = await request(app).get('/api/branches').set(bearer(ownerToken));
    const adminList = await request(app).get('/api/branches').set(bearer(adminToken));

    expect(ownerList.body.data).toHaveLength(2);
    expect(adminList.body.data).toHaveLength(1);
    expect(adminList.body.data[0].id).toBe(second.id);
  });

  it('boshqa filial o‘quvchilari, leadlari va guruhlari ko‘rinmaydi', async () => {
    const second = await createSecondBranch();
    const course = await createCourse();
    const mainGroup = await createGroup({ courseId: course.id, name: 'Asosiy guruh' });
    const otherGroup = await prisma.group.create({
      data: {
        name: 'Chilonzor guruhi',
        courseId: course.id,
        capacity: 12,
        scheduleDays: ['MONDAY'],
        startTime: '10:00',
        endTime: '12:00',
        startDate: new Date('2026-09-01'),
        status: 'ACTIVE',
        branchId: second.id,
      },
    });
    await prisma.student.create({
      data: {
        firstName: 'Chilonzor',
        lastName: 'O‘quvchi',
        phone: '+998901112233',
        courseId: course.id,
        groupId: otherGroup.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-09-01'),
        branchId: second.id,
        debt: { create: { totalAmount: 1_000_000, paidAmount: 0, remainingAmount: 1_000_000, status: 'UNPAID' } },
      },
    });
    await prisma.student.create({
      data: {
        firstName: 'Asosiy',
        lastName: 'O‘quvchi',
        phone: '+998901112244',
        courseId: course.id,
        groupId: mainGroup.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-09-01'),
        debt: { create: { totalAmount: 1_000_000, paidAmount: 0, remainingAmount: 1_000_000, status: 'UNPAID' } },
      },
    });

    const { token: mainAdmin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });

    const mainStudents = await request(app).get('/api/students').set(bearer(mainAdmin));
    const mainGroups = await request(app).get('/api/groups').set(bearer(mainAdmin));
    const ownerStudents = await request(app).get('/api/students').set(bearer(owner));

    expect(mainStudents.body.data).toHaveLength(1);
    expect(mainStudents.body.data[0].firstName).toBe('Asosiy');
    expect(mainGroups.body.data.map((group: { name: string }) => group.name)).toEqual(['Asosiy guruh']);
    // branch.view_all ruxsati bor rahbar ikkala filialni ham ko'radi
    expect(ownerStudents.body.data).toHaveLength(2);
  });

  it('yangi yozuvlar xodimning filialiga biriktiriladi', async () => {
    const second = await createSecondBranch();
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN', branchId: second.id });

    const created = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send({
        firstName: 'Yangi',
        lastName: 'O‘quvchi',
        phone: '+998905556677',
        courseId: course.id,
        startDate: '2026-09-15',
      });

    expect(created.status).toBe(201);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(student.branchId).toBe(second.id);
  });
});
