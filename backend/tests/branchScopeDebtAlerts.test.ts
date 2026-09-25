import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { MAIN_BRANCH_ID } from '../src/config/branch.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

/**
 * PHASE 14 — scope auditi (TZ 3.0 §57 "Ownership"): qarzdorlik va ogohlantirishlar filial doirasida.
 * Oldin filialga biriktirilgan admin boshqa filial qarzdorlari va o'quvchi ogohlantirishlarini ko'rardi.
 */
const app = createApp();

async function studentIn(branchId: string, courseId: string, name: string, remaining: number) {
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Filial',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      branchId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-03-01'),
      debt: { create: { totalAmount: 1_000_000, paidAmount: 1_000_000 - remaining, remainingAmount: remaining } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Filial doirasi: qarzdorlik va ogohlantirishlar (PHASE 14)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('filial admini faqat o‘z filiali qarzdorlarini va yig‘indisini ko‘radi; owner — hammasini', async () => {
    const other = await prisma.branch.create({ data: { key: 'SERGELI', name: 'Sergeli', sortOrder: 5 } });
    const course = await createCourse();
    await studentIn(MAIN_BRANCH_ID, course.id, 'Asosiy', 300_000);
    await studentIn(other.id, course.id, 'Sergeli', 500_000);
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });

    const list = await request(app).get('/api/debts').set(bearer(admin));
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: { firstName: string }) => row.firstName)).toEqual(['Asosiy']);
    const summary = await request(app).get('/api/debts/summary').set(bearer(admin));
    expect(summary.body.data).toMatchObject({ students: 1, totalRemaining: 300_000 });

    const all = await request(app).get('/api/debts/summary').set(bearer(owner));
    expect(all.body.data).toMatchObject({ students: 2, totalRemaining: 800_000 });
  });

  it('o‘quvchiga oid ogohlantirish — faqat o‘z filiali; umumiy (filialsiz) — hammaga', async () => {
    const other = await prisma.branch.create({ data: { key: 'YUNUSOBOD', name: 'Yunusobod', sortOrder: 6 } });
    await prisma.alert.createMany({
      data: [
        { type: 'ACADEMIC_RISK', title: 'Asosiy filial o‘quvchisi', message: 'x', branchId: MAIN_BRANCH_ID },
        { type: 'ACADEMIC_RISK', title: 'Yunusobod o‘quvchisi', message: 'y', branchId: other.id },
        { type: 'HIGH_DEBT', title: 'Markaz bo‘yicha qarz', message: 'z' },
      ],
    });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });

    const seen = await request(app).get('/api/alerts').query({ status: 'all' }).set(bearer(admin));
    expect(seen.body.data.map((row: { title: string }) => row.title).sort()).toEqual(['Asosiy filial o‘quvchisi', 'Markaz bo‘yicha qarz']);
    expect((await request(app).get('/api/alerts/summary').set(bearer(admin))).body.data.open).toBe(2);
    expect((await request(app).get('/api/alerts/summary').set(bearer(owner))).body.data.open).toBe(3);

    const foreign = await prisma.alert.findFirstOrThrow({ where: { branchId: other.id } });
    expect((await request(app).post(`/api/alerts/${foreign.id}/read`).set(bearer(admin))).status).toBe(404);
    await request(app).post('/api/alerts/read-all').set(bearer(admin));
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: foreign.id } })).readAt).toBeNull();
  });
});
