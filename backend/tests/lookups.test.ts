import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { createTestUser, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

const app = createApp();

async function createRole(key: string, permissionKeys: string[]) {
  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  return prisma.role.create({
    data: { key, name: key, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
}

describe.skipIf(!hasTestDatabase)('Forma ma’lumotnomalari /lookups (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('faqat faol manba, kurs, xodim, guruh va kassalarni qaytaradi', async () => {
    await createRole('LEAD_ONLY', [PERMISSIONS.LEAD_VIEW]);
    await createRole('MARKER', [PERMISSIONS.ATTENDANCE_MARK]);
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'root@test.uz' });
    const leadUser = await createTestUser({ role: 'LEAD_ONLY', email: 'lead@test.uz' });
    const pendingLeadUser = await createTestUser({ role: 'LEAD_ONLY', email: 'pending@test.uz', status: 'PENDING' });
    const marker = await createTestUser({ role: 'MARKER', email: 'marker@test.uz' });

    await createSource('Instagram');
    const oldSource = await createSource('Gazeta');
    await prisma.source.update({ where: { id: oldSource.id }, data: { isActive: false } });
    const course = await createCourse('Frontend');
    const archived = await createCourse('Eski kurs');
    await prisma.course.update({ where: { id: archived.id }, data: { status: 'ARCHIVED' } });

    const activeGroup = await createGroup({ courseId: course.id, name: 'FE-01', capacity: 2 });
    const finished = await createGroup({ courseId: course.id, name: 'FE-00' });
    await prisma.group.update({ where: { id: finished.id }, data: { status: 'COMPLETED' } });
    await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901112233', courseId: course.id, groupId: activeGroup.id, contractPrice: 1_000_000, startDate: new Date('2026-09-01') },
    });

    await prisma.financialAccount.create({ data: { key: 'MAIN_CASH', name: 'Asosiy kassa', type: 'CASH', balance: 250_000, sortOrder: 1 } });
    await prisma.financialAccount.create({ data: { key: 'OLD_BANK', name: 'Yopilgan hisob', type: 'BANK', isActive: false } });

    const get = async (path: string) => {
      const response = await request(app).get(`/api/lookups/${path}`).set(bearer(token));
      expect(response.status).toBe(200);
      return response.body.data;
    };

    const leadForm = await get('lead-form');
    expect(leadForm.sources.map((source: { name: string }) => source.name)).toEqual(['Instagram']);
    expect(leadForm.courses.map((item: { name: string }) => item.name)).toEqual(['Frontend']);
    const managerIds = leadForm.managers.map((manager: { id: string }) => manager.id);
    expect(managerIds).toContain(leadUser.id);
    expect(managerIds).not.toContain(pendingLeadUser.id);
    expect(managerIds).not.toContain(marker.id);
    expect(leadForm.managers.find((manager: { id: string }) => manager.id === leadUser.id)).toMatchObject({ roleName: 'LEAD_ONLY' });

    const groupForm = await get('group-form');
    const teacherIds = groupForm.teachers.map((teacher: { id: string }) => teacher.id);
    expect(teacherIds).toContain(marker.id);
    expect(teacherIds).not.toContain(leadUser.id);

    const studentForm = await get('student-form');
    expect(studentForm.courses).toEqual([{ id: course.id, name: 'Frontend', finalPrice: 1_000_000 }]);
    expect(studentForm.groups).toEqual([
      { id: activeGroup.id, name: 'FE-01', courseId: course.id, capacity: 2, studentCount: 1, freeSeats: 1 },
    ]);

    // To'lov filtrlari tarixiy yozuvlar uchun — yopilgan kurs va guruh ham kerak
    const paymentForm = await get('payment-form');
    expect(paymentForm.courses).toHaveLength(2);
    expect(paymentForm.groups.map((group: { name: string }) => group.name)).toEqual(['FE-00', 'FE-01']);

    const salaryForm = await get('salary-form');
    expect(salaryForm.accounts).toEqual([
      expect.objectContaining({ key: 'MAIN_CASH', name: 'Asosiy kassa', type: 'CASH', balance: 250_000 }),
    ]);
  });

  it('ruxsatsiz xodim ma’lumotnomalarni ololmaydi', async () => {
    await createRole('NOTHING', []);
    const { token } = await createUserWithToken(app, { role: 'NOTHING', email: 'nobody@test.uz' });
    for (const path of ['lead-form', 'group-form', 'student-form', 'payment-form', 'salary-form']) {
      expect((await request(app).get(`/api/lookups/${path}`).set(bearer(token))).status).toBe(403);
    }
    expect((await request(app).get('/api/lookups/lead-form')).status).toBe(401);
  });
});
