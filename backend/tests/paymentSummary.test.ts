import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
let counter = 0;

describe.skipIf(!hasTestDatabase)('To‘lov xulosasi (integratsion)', () => {
  let admin: string;
  let frontend: { id: string; groupId: string };
  let english: { id: string; groupId: string };

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: admin } = await createUserWithToken(app, { role: 'SUPER_ADMIN', email: 'summary@test.uz' }));
    const fe = await createCourse('Frontend');
    const en = await createCourse('Ingliz tili');
    frontend = { id: fe.id, groupId: (await createGroup({ courseId: fe.id })).id };
    english = { id: en.id, groupId: (await createGroup({ courseId: en.id })).id };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function student(course: { id: string; groupId: string }, contract: number | null, status: 'ACTIVE' | 'DROPPED' = 'ACTIVE') {
    counter += 1;
    return prisma.student.create({
      data: {
        firstName: `Xulosa${counter}`,
        lastName: 'Test',
        phone: `+99895${String(1_000_000 + counter)}`,
        courseId: course.id,
        groupId: course.groupId,
        status,
        contractPrice: contract ?? 0,
        startDate: new Date('2026-01-10'),
        ...(contract === null ? {} : { debt: { create: { totalAmount: contract, remainingAmount: contract } } }),
      },
    });
  }
  const pay = (studentId: string, amount: number) =>
    request(app).post('/api/payments').set(bearer(admin)).send({ studentId, amount, method: 'CASH' }).expect(201);
  const summary = async (scope?: string) =>
    (await request(app).get('/api/payment-summary').query(scope ? { scope } : {}).set(bearer(admin)).expect(200)).body.data;

  it('jami va yo‘nalishlar: yig‘ilishi kerak, yig‘ilgan, qolgan, muddati o‘tgan, qarzdorlar, shu oy tushgani, foiz', async () => {
    const a = await student(frontend, 6_000_000);
    const b = await student(frontend, 6_000_000);
    const c = await student(english, 2_000_000);
    await student(english, null); // shartnomasiz — summaga kirmaydi
    await pay(a.id, 6_000_000);
    await pay(b.id, 1_500_000);
    await pay(c.id, 500_000);
    // Jadval: c ning 1 000 000 lik birinchi qismi muddati o'tgan, 500 000 to'langan → 500 000 muddati o'tgan
    await prisma.paymentInstallment.createMany({
      data: [
        { studentId: c.id, sequence: 1, dueDate: new Date('2026-02-01'), amount: 1_000_000 },
        { studentId: c.id, sequence: 2, dueDate: new Date('2030-03-01'), amount: 1_000_000 },
      ],
    });

    const data = await summary();
    expect(data.totals).toMatchObject({
      students: 4,
      activeStudents: 4,
      withoutContract: 1,
      expected: 14_000_000,
      collected: 8_000_000,
      remaining: 6_000_000,
      overdue: 500_000,
      debtors: 2,
      monthCollected: 8_000_000,
      collectedPercent: 57.1,
    });
    const byName = Object.fromEntries(data.courses.map((row: { courseName: string }) => [row.courseName, row]));
    expect(byName.Frontend).toMatchObject({ students: 2, expected: 12_000_000, collected: 7_500_000, remaining: 4_500_000, debtors: 1, collectedPercent: 62.5 });
    expect(byName['Ingliz tili']).toMatchObject({ students: 2, withoutContract: 1, expected: 2_000_000, collected: 500_000, remaining: 1_500_000, overdue: 500_000, collectedPercent: 25 });
    // Eng katta shartnoma summasi birinchi
    expect(data.courses[0].courseName).toBe('Frontend');
  });

  it('holat filtri: ketganlar alohida; eksport — Excel; ruxsatsiz — 403', async () => {
    await student(frontend, 1_000_000);
    await student(frontend, 3_000_000, 'DROPPED');
    expect((await summary('STUDYING')).totals).toMatchObject({ students: 1, expected: 1_000_000 });
    expect((await summary('DROPPED')).totals).toMatchObject({ students: 1, expected: 3_000_000, remaining: 3_000_000 });
    expect((await summary()).totals.students).toBe(2);

    const file = await request(app).get('/api/payment-summary/export').query({ format: 'xlsx' }).set(bearer(admin));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('spreadsheetml');
    const csv = await request(app).get('/api/payment-summary/export').query({ format: 'csv' }).set(bearer(admin));
    expect(csv.text).toContain('Yig‘ilishi kerak');

    const { token } = await createUserWithToken(app, { role: 'TEACHER', email: 'summary-t@test.uz' });
    expect((await request(app).get('/api/payment-summary').set(bearer(token))).status).toBe(403);
  });
});
