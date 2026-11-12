import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { migrateToMonthlyFee } from '../src/services/monthlyFeeMigration.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { businessDateString } from '../src/utils/dates.js';
import { addMonthsClamped } from '../src/utils/paymentSchedule.js';

const app = createApp();
import { createCourse } from './helpers/fixtures.js';

/** Eski model: shartnomaga oylik 600 000 yozilgan, jadval esa uni 12 oyga bo'lgan (50 000), to'lov oylarga yoyilgan */
async function legacyStudent() {
  const course = await createCourse('Frontend');
  const student = await prisma.student.create({
    data: {
      firstName: 'Muhammadiy',
      lastName: 'Zokirov',
      phone: '+998901110007',
      courseId: course.id,
      contractPrice: 600_000,
      startDate: new Date('2026-09-05'),
      debt: { create: { totalAmount: 600_000, paidAmount: 600_000, remainingAmount: 0, status: 'PAID' } },
    },
  });
  const dues = ['2026-09-05', '2026-10-05', '2026-11-05', '2026-12-05'];
  await prisma.paymentInstallment.createMany({
    data: dues.map((dueDate, index) => ({ studentId: student.id, sequence: index + 1, dueDate: new Date(`${dueDate}T00:00:00Z`), amount: 50_000 })),
  });
  const payment = await prisma.payment.create({
    data: { studentId: student.id, courseId: course.id, amount: 600_000, method: 'CASH', paidAt: new Date('2026-10-06T07:00:00Z') },
  });
  await prisma.paymentAllocation.createMany({
    data: dues.map((dueDate) => ({
      paymentId: payment.id,
      studentId: student.id,
      periodYear: Number(dueDate.slice(0, 4)),
      periodMonth: Number(dueDate.slice(5, 7)),
      amount: 50_000,
      effectiveAt: payment.paidAt,
    })),
  });
  return { student, payment };
}

describe.skipIf(!hasTestDatabase)('Oylik to‘lov modeliga o‘tkazish (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reja hech narsa yozmaydi; --apply oylarni to‘liq oylikka o‘tkazadi, to‘lovni eng eski oyga biriktiradi, auditga yozadi; takror — o‘zgarishsiz', async () => {
    const { student, payment } = await legacyStudent();

    const dry = await migrateToMonthlyFee({ apply: false, actorId: null });
    expect(dry).toHaveLength(1);
    expect(dry[0]).toMatchObject({ changed: true, monthly: 600_000, paid: 600_000 });
    expect(dry[0]!.plan).toMatchObject({ totalBefore: 200_000, totalAfter: 1_800_000, unallocated: 0 });
    expect(await prisma.paymentInstallment.count({ where: { studentId: student.id, amount: 50_000 } })).toBe(4);
    expect(await prisma.auditLog.count({ where: { action: 'billing.monthly_fee_migrated' } })).toBe(0);

    const applied = await migrateToMonthlyFee({ apply: true, actorId: null, now: new Date('2026-11-12T08:00:00Z') });
    expect(applied[0]!.changed).toBe(true);

    const installments = await prisma.paymentInstallment.findMany({ where: { studentId: student.id }, orderBy: { dueDate: 'asc' } });
    expect(installments.map((row) => [row.dueDate.toISOString().slice(0, 7), row.amount.toNumber(), row.cancelledAt !== null])).toEqual([
      ['2026-09', 50_000, true],
      ['2026-10', 600_000, false],
      ['2026-11', 600_000, false],
      ['2026-12', 600_000, false],
    ]);
    expect(installments[0]!.cancelReason).toContain('oktyabrdan');

    // Eski yoyilgan taqsimot o'chirilmaydi — bekor belgilanadi; yangisi: 600 000 → oktyabr
    expect(await prisma.paymentAllocation.count({ where: { paymentId: payment.id, voidedAt: { not: null } } })).toBe(4);
    const live = await prisma.paymentAllocation.findMany({ where: { paymentId: payment.id, voidedAt: null } });
    expect(live.map((row) => [row.periodYear, row.periodMonth, row.amount.toNumber(), row.effectiveAt.toISOString()])).toEqual([
      [2026, 10, 600_000, payment.paidAt.toISOString()],
    ]);

    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect([debt.totalAmount.toNumber(), debt.paidAmount.toNumber(), debt.remainingAmount.toNumber(), debt.status]).toEqual([1_800_000, 600_000, 1_200_000, 'PARTIAL']);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).contractPrice.toNumber()).toBe(600_000);
    expect(await prisma.payment.count({ where: { studentId: student.id } })).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'billing.monthly_fee_migrated', entityId: student.id } });
    expect(audit.metadata).toMatchObject({ monthly: 600_000, totalBefore: 200_000, totalAfter: 1_800_000, cancelledMonths: ['2026-09'], repriced: 3, allocationsVoided: 4, allocationsCreated: 1 });

    const again = await migrateToMonthlyFee({ apply: true, actorId: null });
    expect(again[0]!.changed).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'billing.monthly_fee_migrated' } })).toBe(1);
    expect(await prisma.paymentAllocation.count({ where: { paymentId: payment.id, voidedAt: null } })).toBe(1);
  });

  it('muzlatilganda bugundan keyingi to‘lanmagan oylar yozilmaydi; faollashganda bugundan keyingilari tiklanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@freeze.uz' });
    const course = await createCourse('Frontend');
    // O'tgan oyning 1-sanasidan, 6 oy × 500 000
    const current = businessDateString(new Date()).slice(0, 7);
    const previous = addMonthsClamped(`${current}-01`, -1).slice(0, 7);
    const created = await request(app)
      .post('/api/students')
      .set(bearer(token))
      .send({ firstName: 'Muzlat', lastName: 'Test', phone: '+998901119999', courseId: course.id, contractPrice: 500_000, startDate: `${previous}-01` });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data.debt.total).toBe(3_000_000);

    const frozen = await request(app).patch(`/api/students/${id}/status`).set(bearer(token)).send({ status: 'FROZEN', reason: 'Ta’tilga ketdi' });
    expect(frozen.status).toBe(200);
    // O'tgan oy va (1-sanasi o'tgan bo'lsa) joriy oy qarz bo'lib qoladi; bugundan keyingilari yozilmaydi
    const dueToday = businessDateString(new Date()) === `${current}-01`;
    expect(frozen.body.data.debt.total).toBe(dueToday ? 500_000 : 1_000_000);
    const cancelled = await prisma.paymentInstallment.findMany({ where: { studentId: id, cancelledAt: { not: null } } });
    expect(cancelled).toHaveLength(dueToday ? 5 : 4);
    expect(cancelled.every((row) => row.cancelReason === 'Muzlatilgan — to‘lov yozilmaydi')).toBe(true);

    const active = await request(app).patch(`/api/students/${id}/status`).set(bearer(token)).send({ status: 'ACTIVE' });
    expect(active.status).toBe(200);
    expect(active.body.data.debt.total).toBe(3_000_000);
    expect(await prisma.paymentInstallment.count({ where: { studentId: id, cancelledAt: { not: null } } })).toBe(0);
  });
});
