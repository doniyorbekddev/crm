import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { alertService } from '../src/services/alert.service.js';
import { addDays, businessDateString } from '../src/utils/dates.js';
import { addMonthsClamped } from '../src/utils/paymentSchedule.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

/** O‘quv markaz kuni bo‘yicha bugundan siljish */
const day = (offset: number) => businessDateString(addDays(new Date(), offset));

async function createRole(key: string, permissionKeys: string[]) {
  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  return prisma.role.create({
    data: { key, name: key, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
}

const STUDENT = { firstName: 'Aziza', lastName: 'Karimova', phone: '+998901234567', startDate: '2026-01-31' };

async function setup() {
  const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' });
  const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' });
  const course = await createCourse('Frontend');
  const created = await request(app)
    .post('/api/students')
    .set(bearer(owner))
    .send({ ...STUDENT, courseId: course.id, contractPrice: 6_000_000 });
  expect(created.status).toBe(201);
  return { owner, accountant, course, studentId: created.body.data.id as string };
}

const getSchedule = (token: string, studentId: string) => request(app).get(`/api/students/${studentId}/payment-schedule`).set(bearer(token));
const replaceSchedule = (token: string, studentId: string, installments: Array<Record<string, unknown>>) =>
  request(app).put(`/api/students/${studentId}/payment-schedule`).set(bearer(token)).send({ installments });
const pay = (token: string, studentId: string, amount: number) =>
  request(app).post('/api/payments').set(bearer(token)).send({ studentId, amount, method: 'CASH' });

describe.skipIf(!hasTestDatabase)('To‘lov jadvali (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('yangi o‘quvchi va leaddan aylantirilgan o‘quvchiga kurs davomiyligi bo‘yicha oylik jadval tuziladi', async () => {
    const { owner, accountant, course, studentId } = await setup();
    const response = await getSchedule(accountant, studentId);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ contractTotal: 6_000_000, scheduledTotal: 6_000_000, mismatch: false, paid: 0 });
    expect(response.body.data.installments.map((item: { amount: number }) => item.amount)).toEqual(Array(6).fill(1_000_000));
    expect(response.body.data.installments.map((item: { dueDate: string }) => item.dueDate)).toEqual(
      [0, 1, 2, 3, 4, 5].map((index) => addMonthsClamped(STUDENT.startDate, index)),
    );

    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, courseId: course.id, phone: '+998935550011' });
    const converted = await request(app)
      .post(`/api/leads/${lead.id}/convert`)
      .set(bearer(owner))
      .send({ contractPrice: 3_000_000, startDate: '2026-09-01' });
    expect(converted.status).toBe(201);
    const convertedSchedule = await getSchedule(accountant, converted.body.data.id);
    expect(convertedSchedule.body.data.installments).toHaveLength(6);
    expect(convertedSchedule.body.data.installments[0]).toMatchObject({ dueDate: '2026-09-01', amount: 500_000, status: expect.any(String) });
  });

  it('to‘lovlar muddat tartibida taqsimlanadi; qarzdorlar ro‘yxati, xulosa va alert muddati o‘tganlarni ko‘rsatadi', async () => {
    const { accountant, course, studentId } = await setup();
    const saved = await replaceSchedule(accountant, studentId, [
      { dueDate: day(-40), amount: 1_000_000 },
      { dueDate: day(-10), amount: 1_000_000 },
      { dueDate: day(0), amount: 1_000_000 },
      { dueDate: day(5), amount: 1_000_000 },
      { dueDate: day(30), amount: 2_000_000 },
    ]);
    expect(saved.status).toBe(200);
    expect((await pay(accountant, studentId, 1_500_000)).status).toBe(201);

    const schedule = (await getSchedule(accountant, studentId)).body.data;
    expect(schedule.installments.map((item: { status: string }) => item.status)).toEqual(['PAID', 'OVERDUE', 'DUE_TODAY', 'UPCOMING', 'UPCOMING']);
    expect(schedule.installments[1]).toMatchObject({ paid: 500_000, remaining: 500_000, overdueDays: 10 });
    expect(schedule).toMatchObject({ overdueAmount: 500_000, overdueDays: 10, nextDue: { dueDate: day(0), amount: 1_000_000 } });

    // Jadvali yo'q o'quvchi — ro'yxatda bor, muddat filtrlarida yo'q
    await prisma.student.create({
      data: {
        firstName: 'Jadvalsiz',
        lastName: 'O‘quvchi',
        phone: '+998907770000',
        courseId: course.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-09-01'),
        debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
      },
    });

    const debts = (query: Record<string, string>) => request(app).get('/api/debts').query(query).set(bearer(accountant));
    const overdue = await debts({ due: 'overdue' });
    expect(overdue.body.meta.total).toBe(1);
    expect(overdue.body.data[0]).toMatchObject({ studentId, schedule: { overdueAmount: 500_000, overdueDays: 10, nextDueDate: day(0) } });
    expect((await debts({ due: 'upcoming' })).body.meta.total).toBe(1);
    const all = await debts({});
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data.find((item: { studentId: string }) => item.studentId !== studentId).schedule).toBeNull();

    const summary = await request(app).get('/api/debts/summary').set(bearer(accountant));
    expect(summary.body.data.overdue).toEqual({ students: 1, amount: 500_000 });
    expect(summary.body.data.upcoming).toEqual({ students: 1, amount: 2_000_000 });

    await alertService.evaluate(new Date());
    const alert = await prisma.alert.findFirstOrThrow({ where: { type: 'PAYMENT_OVERDUE', resolvedAt: null } });
    expect(alert.severity).toBe('WARNING');
    expect(alert.title).toBe('Muddati o‘tgan to‘lovlar: 1 ta o‘quvchi');

    // Kechikkan qism to'langach — ro'yxatdan chiqadi, alert yopiladi
    expect((await pay(accountant, studentId, 500_000)).status).toBe(201);
    expect((await debts({ due: 'overdue' })).body.meta.total).toBe(0);
    await alertService.evaluate(new Date());
    expect(await prisma.alert.count({ where: { type: 'PAYMENT_OVERDUE', resolvedAt: null } })).toBe(0);
  });

  it('qayta tuzish, qo‘lda tahrirlash validatsiyasi, shartnoma o‘zgarsa nomuvofiqlik va audit', async () => {
    const { owner, accountant, course, studentId } = await setup();

    const generated = await request(app)
      .post(`/api/students/${studentId}/payment-schedule/generate`)
      .set(bearer(accountant))
      .send({ count: 3, firstDueDate: '2026-10-31' });
    expect(generated.status).toBe(200);
    expect(generated.body.data.installments.map((item: { amount: number; dueDate: string }) => [item.dueDate, item.amount])).toEqual([
      ['2026-10-31', 2_000_000],
      ['2026-11-30', 2_000_000],
      ['2026-12-31', 2_000_000],
    ]);
    const generatedAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment_schedule.generated', entityId: studentId } });
    expect(generatedAudit.metadata).toMatchObject({ count: 3, replaced: 6 });

    const wrongSum = await replaceSchedule(accountant, studentId, [{ dueDate: '2026-10-01', amount: 1_000_000 }]);
    expect(wrongSum.status).toBe(422);
    expect(wrongSum.body.errors[0].field).toBe('installments');
    const unordered = await replaceSchedule(accountant, studentId, [
      { dueDate: '2026-11-01', amount: 3_000_000 },
      { dueDate: '2026-10-01', amount: 3_000_000 },
    ]);
    expect(unordered.status).toBe(422);
    expect((await replaceSchedule(accountant, studentId, [{ dueDate: '2026-02-30', amount: 6_000_000 }])).status).toBe(422);
    expect((await getSchedule(accountant, studentId)).body.data.installments).toHaveLength(3);

    const manual = await replaceSchedule(accountant, studentId, [
      { dueDate: '2026-10-01', amount: 3_000_000, note: 'Birinchi yarmi' },
      { dueDate: '2026-11-01', amount: 3_000_000 },
    ]);
    expect(manual.status).toBe(200);
    expect(manual.body.data.installments[0]).toMatchObject({ sequence: 1, note: 'Birinchi yarmi' });
    expect(await prisma.auditLog.count({ where: { action: 'payment_schedule.updated', entityId: studentId } })).toBe(1);

    const priceChanged = await request(app)
      .put(`/api/students/${studentId}`)
      .set(bearer(owner))
      .send({ ...STUDENT, courseId: course.id, contractPrice: 7_000_000 });
    expect(priceChanged.status).toBe(200);
    expect((await getSchedule(accountant, studentId)).body.data).toMatchObject({ mismatch: true, contractTotal: 7_000_000, scheduledTotal: 6_000_000 });
  });

  it('ruxsatlar: ko‘rish qarzdorlik/to‘lov ruxsati bilan, tuzish faqat to‘lov qabul qiluvchiga', async () => {
    const { studentId } = await setup();
    await createRole('DEBT_READER', [PERMISSIONS.DEBT_VIEW]);
    await createRole('NOTHING', []);
    const { token: reader } = await createUserWithToken(app, { role: 'DEBT_READER', email: 'reader@test.uz' });
    const { token: nobody } = await createUserWithToken(app, { role: 'NOTHING', email: 'nobody@test.uz' });

    expect((await getSchedule(reader, studentId)).status).toBe(200);
    expect((await getSchedule(nobody, studentId)).status).toBe(403);
    expect(
      (await request(app).post(`/api/students/${studentId}/payment-schedule/generate`).set(bearer(reader)).send({ count: 2, firstDueDate: '2026-10-01' })).status,
    ).toBe(403);
    expect((await replaceSchedule(reader, studentId, [{ dueDate: '2026-10-01', amount: 6_000_000 }])).status).toBe(403);
    expect((await getSchedule(reader, 'clnotexisting0000000000000')).status).toBe(404);
  });
});
