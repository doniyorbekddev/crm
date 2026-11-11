import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { generateMonthSnapshots } from '../src/services/monthSnapshot.service.js';
import { periodKeyOf } from '../src/utils/billingLedger.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/**
 * Oylik moliyaviy davrlar va tarixiy qarzdorlik (spetsifikatsiya §10, 12 holat). Sanalar bugungi o'quv markaz oyiga
 * nisbatan: P — o'tgan oy ("oktyabr"), C — joriy oy ("noyabr"), N — keyingi oy.
 */

const app = createApp();

const shift = (offset: number) => {
  const { year, month } = currentBusinessMonth(new Date());
  const index = year * 12 + (month - 1) + offset;
  return periodKeyOf(Math.floor(index / 12), (index % 12) + 1);
};
const P = shift(-1);
const C = shift(0);
const N = shift(1);

async function setup() {
  const { token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@billing.uz' });
  const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@billing.uz' });
  const course = await prisma.course.create({ data: { name: 'Frontend', durationMonths: 3, price: 1_800_000, finalPrice: 1_800_000 } });
  return { owner, accountant, course };
}

let phone = 0;
async function enroll(token: string, courseId: string, firstName: string, contractPrice = 1_800_000) {
  phone += 1;
  const response = await request(app)
    .post('/api/students')
    .set(bearer(token))
    .send({ firstName, lastName: 'Test', phone: `+99890${String(1_000_000 + phone).slice(-7)}`, courseId, contractPrice, startDate: `${P}-01` });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

const pay = (token: string, studentId: string, amount: number, allocations?: Array<{ period: string; amount: number }>) =>
  request(app)
    .post('/api/payments')
    .set(bearer(token))
    .send({ studentId, amount, method: 'CASH', ...(allocations ? { allocations } : {}) });

const monthly = (token: string, period: string, query: Record<string, string> = {}) =>
  request(app).get('/api/debts/monthly').query({ period, ...query }).set(bearer(token));
const outstanding = (token: string, query: Record<string, string> = {}) => request(app).get('/api/debts/outstanding').query(query).set(bearer(token));
const history = (token: string, studentId: string) => request(app).get(`/api/students/${studentId}/billing-history`).set(bearer(token));
const report = (token: string, from: string, to: string) => request(app).get('/api/finance/billing-report').query({ from, to }).set(bearer(token));

const monthOf = (body: { months: Array<{ period: string }> }, period: string) => body.months.find((item) => item.period === period) as Record<string, unknown>;
const rowOf = (body: { items: Array<{ student: { id: string } }> }, studentId: string) => body.items.find((item) => item.student.id === studentId);

describe.skipIf(!hasTestDatabase)('Oylik moliyaviy davrlar va tarixiy qarzdorlik', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1–7, 12: o‘tgan oy qarzi yangi oyda ko‘rinadi, shu oy uchun to‘lov uni yopadi, joriy oy o‘zgarmaydi, tushum to‘lov oyida, tarix o‘zgarmaydi', async () => {
    const { owner, accountant, course } = await setup();
    const aziz = await enroll(owner, course.id, 'Aziz');

    // 1. O'tgan oyda 600 000 majburiyat bor (har oy alohida)
    const before = (await history(accountant, aziz)).body.data;
    expect(before.months.map((item: { period: string; charge: number }) => [item.period, item.charge])).toEqual([
      [P, 600_000],
      [C, 600_000],
      [N, 600_000],
    ]);

    // 2–3. Yangi oyda o'tgan oy qarzi saqlangan va qarzdorlar ro'yxatida ko'rinadi
    const previous = await monthly(accountant, P);
    expect(previous.status).toBe(200);
    expect(rowOf(previous.body.data, aziz)).toMatchObject({ charge: 600_000, paid: 0, remaining: 600_000, status: 'UNPAID', due: true, remainingAtPeriodEnd: 600_000 });
    expect(previous.body.data.summary).toMatchObject({ period: P, periodEnded: true, debtors: 1, remaining: 600_000 });
    const all = (await outstanding(accountant)).body.data;
    expect(all.items[0]).toMatchObject({ debt: 1_200_000, months: [{ period: P, remaining: 600_000 }, { period: C, remaining: 600_000 }], oldestDueDate: `${P}-01`, upcoming: 600_000 });
    // Umumiy hisobot: qaysi oy uchun qancha qarz (oy summasi to'liq — kunma-kun emas), jami = oylar yig'indisi
    expect(all.summary.byMonth).toEqual([
      { period: P, students: 1, debt: 600_000 },
      { period: C, students: 1, debt: 600_000 },
    ]);
    expect(all.summary.debt).toBe(1_200_000);
    // Oy tugagandan keyin olingan snapshot — oy oxiridagi holat
    const [year, month] = P.split('-').map(Number) as [number, number];
    await generateMonthSnapshots(year, month);

    // 4. Joriy oyda o'tgan oy qarzi uchun to'lov (to'lov sanasi — bugun)
    const paid = await pay(accountant, aziz, 600_000, [{ period: P, amount: 600_000 }]);
    expect(paid.status).toBe(201);
    expect(paid.body.data.payment ?? paid.body.data).toMatchObject({ allocations: [{ period: P, amount: 600_000 }], unallocatedAmount: 0 });

    // 5. O'tgan oy yopildi; oy oxiridagi holat (tarix) o'zgarmadi
    expect(rowOf((await monthly(accountant, P, { status: 'ALL' })).body.data, aziz)).toMatchObject({
      paid: 600_000,
      remaining: 0,
      status: 'PAID',
      remainingAtPeriodEnd: 600_000,
      paidAfterPeriod: 600_000,
    });
    expect((await monthly(accountant, P)).body.data.items).toHaveLength(0);

    // O'tgan oy oxiridagi holat: to'lovdan keyin ham o'sha kuni qarzdor bo'lib ko'rinadi; bugun — faqat joriy oy
    const lastMonthEnd = (await outstanding(accountant, { period: P })).body.data;
    expect(lastMonthEnd.summary).toMatchObject({ historical: true, students: 1, debt: 600_000 });
    expect(lastMonthEnd.items[0]).toMatchObject({ months: [{ period: P, remaining: 600_000 }] });
    expect(lastMonthEnd.summary.asOfDate.slice(0, 7)).toBe(P);
    const now = (await outstanding(accountant)).body.data;
    expect(now.summary).toMatchObject({ historical: false, debt: 600_000 });
    expect(now.items[0].months).toEqual([expect.objectContaining({ period: C, remaining: 600_000 })]);
    expect(now.summary.byMonth).toEqual([{ period: C, students: 1, debt: 600_000 }]);

    // 6. Joriy oy majburiyati o'zgarmadi
    expect(rowOf((await monthly(accountant, C)).body.data, aziz)).toMatchObject({ charge: 600_000, paid: 0, remaining: 600_000 });

    // Muddati hali kelmagan oy "qarzdorlar"da emas — "kutilmoqda"da; bosh panel qarzi — faqat muddati kelganlar
    const upcomingMonth = await monthly(accountant, N);
    expect(upcomingMonth.body.data.items).toHaveLength(0);
    expect(upcomingMonth.body.data.summary).toMatchObject({ debtors: 0, upcoming: 1, dueRemaining: 0, remaining: 600_000 });
    expect(rowOf((await monthly(accountant, N, { status: 'UPCOMING' })).body.data, aziz)).toMatchObject({ remaining: 600_000, due: false });
    const dashboard = await request(app).get('/api/dashboard/summary').set(bearer(owner));
    expect(dashboard.body.data.debts).toMatchObject({ totalRemaining: 1_200_000, debtors: 1, dueTotal: 600_000, dueDebtors: 1 });

    // 7. Tushum joriy oy kassasida, o'tgan oyga orqaga yozilmaydi; 12. o'tgan oy oxiridagi qarz o'zgarmaydi
    const monthlyReport = (await report(owner, P, C)).body.data;
    expect(monthOf(monthlyReport, P)).toMatchObject({ accrued: 600_000, collectedForPeriod: 600_000, remainingNow: 0, cashIn: 0, debtAtPeriodEnd: 600_000 });
    expect(monthOf(monthlyReport, C)).toMatchObject({
      accrued: 600_000,
      collectedForPeriod: 0,
      cashIn: 600_000,
      cashFor: { earlier: 600_000, same: 0, later: 0, unallocated: 0 },
      debtAtPeriodEnd: 600_000,
    });
    const snapshot = await prisma.studentMonthSnapshot.findFirstOrThrow({ where: { studentId: aziz, year, month } });
    expect(snapshot.debtAmount.toNumber()).toBe(1_800_000);

    // Tarix: qaysi to'lov qaysi oyni qachon yopgani
    const after = (await history(accountant, aziz)).body.data;
    expect(after.months[0]).toMatchObject({ period: P, status: 'PAID', closedAt: expect.any(String), payments: [{ amount: 600_000, explicit: true }] });
    expect(after).toMatchObject({ debt: 600_000, upcoming: 600_000 });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.created' } });
    expect(audit.metadata).toMatchObject({ allocations: [{ period: P, amount: 600_000 }], allocationMode: 'manual' });
  });

  it('8–9: qisman to‘lov qoldiq qoldiradi; avtomatik — eng eski oydan; bir to‘lov bir nechta oyga; noto‘g‘ri taqsimot rad etiladi', async () => {
    const { accountant, course, owner } = await setup();
    const partial = await enroll(owner, course.id, 'Qisman');
    const split = await enroll(owner, course.id, 'Bolish');

    // 8. 600 000 qarzga 300 000 → 300 000 qoldiq (avtomatik — eng eski oy)
    const auto = await pay(accountant, partial, 300_000);
    expect(auto.status).toBe(201);
    expect(rowOf((await monthly(accountant, P)).body.data, partial)).toMatchObject({ paid: 300_000, remaining: 300_000, status: 'PARTIAL' });

    // Noto'g'ri taqsimot: yig'indi teng emas, oy sig'imidan ko'p, jadvalda yo'q oy
    const wrongSum = await pay(accountant, split, 900_000, [{ period: P, amount: 600_000 }]);
    expect(wrongSum.status).toBe(422);
    expect(wrongSum.body.errors[0].field).toBe('allocations');
    expect((await pay(accountant, split, 700_000, [{ period: P, amount: 700_000 }])).status).toBe(422);
    expect((await pay(accountant, split, 600_000, [{ period: shift(5), amount: 600_000 }])).status).toBe(422);
    expect(await prisma.payment.count({ where: { studentId: split } })).toBe(0);

    // 9. Bitta to'lov bir nechta oyga: o'tgan oyga 300 000, joriy oyga 600 000
    const multi = await pay(accountant, split, 900_000, [
      { period: P, amount: 300_000 },
      { period: C, amount: 600_000 },
    ]);
    expect(multi.status).toBe(201);
    const months = (await history(accountant, split)).body.data.months;
    expect(months.map((item: { period: string; paid: number; remaining: number }) => [item.period, item.paid, item.remaining])).toEqual([
      [P, 300_000, 300_000],
      [C, 600_000, 0],
      [N, 0, 600_000],
    ]);
    const allocated = await prisma.paymentAllocation.aggregate({ where: { paymentId: multi.body.data.id }, _sum: { amount: true } });
    expect(allocated._sum.amount?.toNumber()).toBe(900_000);
  });

  it('10: qaytarish shu to‘lovning eng kech oyini ochadi; taqsimotni tuzatish va bekor qilingan to‘lov', async () => {
    const { accountant, course, owner } = await setup();
    const student = await enroll(owner, course.id, 'Qaytarish');
    const payment = await pay(accountant, student, 900_000, [
      { period: P, amount: 600_000 },
      { period: C, amount: 300_000 },
    ]);
    const paymentId = payment.body.data.id as string;

    const refund = await request(app).post(`/api/payments/${paymentId}/refunds`).set(bearer(owner)).send({ amount: 200_000, method: 'CASH', reason: 'Ortiqcha to‘langan' });
    expect(refund.status).toBe(200);
    let months = (await history(accountant, student)).body.data.months;
    expect(months.slice(0, 2).map((item: { paid: number }) => item.paid)).toEqual([600_000, 100_000]);
    expect(refund.body.data).toMatchObject({ allocations: [{ period: P, amount: 600_000 }, { period: C, amount: 100_000 }], refundedAmount: 200_000 });

    // Qaytarilgan to'lov taqsimotini o'zgartirib bo'lmaydi
    expect((await request(app).put(`/api/payments/${paymentId}/allocations`).set(bearer(accountant)).send({ allocations: [{ period: C, amount: 900_000 }], reason: 'Xato oy' })).status).toBe(409);

    // Tuzatish: noto'g'ri oy tanlangan to'lov boshqa oyga o'tkaziladi (eski qator o'chirilmaydi)
    const second = await pay(accountant, student, 500_000, [{ period: C, amount: 500_000 }]);
    const secondId = second.body.data.id as string;
    expect(
      (await request(app).put(`/api/payments/${secondId}/allocations`).set(bearer(accountant)).send({ allocations: [{ period: N, amount: 500_000 }], reason: 'x' })).status,
    ).toBe(422);
    const moved = await request(app)
      .put(`/api/payments/${secondId}/allocations`)
      .set(bearer(accountant))
      .send({ allocations: [{ period: N, amount: 500_000 }], reason: 'Operator oyni adashtirgan' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.allocations).toEqual([{ period: N, amount: 500_000 }]);
    expect(await prisma.paymentAllocation.count({ where: { paymentId: secondId, voidedAt: { not: null } } })).toBe(1);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.reallocated' } })).metadata).toMatchObject({
      before: [{ period: C, amount: 500_000 }],
      after: [{ period: N, amount: 500_000 }],
      reason: 'Operator oyni adashtirgan',
    });
    months = (await history(accountant, student)).body.data.months;
    expect(months.map((item: { paid: number }) => item.paid)).toEqual([600_000, 100_000, 500_000]);

    // Bekor qilingan to'lov taqsimoti hisobga olinmaydi
    expect((await request(app).delete(`/api/payments/${secondId}`).set(bearer(owner)).send({ reason: 'Xato kiritilgan' })).status).toBe(200);
    months = (await history(accountant, student)).body.data.months;
    expect(months.map((item: { paid: number }) => item.paid)).toEqual([600_000, 100_000, 0]);
    expect(await prisma.paymentAllocation.count({ where: { paymentId: secondId } })).toBe(2);
  });

  it('oy majburiyatini bekor qilish: faqat ruxsat va sabab bilan, kelgusi to‘lanmagan oylar, shartnoma kamayadi, qayta tuzishda saqlanadi', async () => {
    const { accountant, course, owner } = await setup();
    const student = await enroll(owner, course.id, 'Ketgan');
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@billing.uz' });
    const cancel = (token: string, months: string[], reason = 'O‘quvchi o‘qishni tark etdi') =>
      request(app).post(`/api/students/${student}/payment-schedule/cancel`).set(bearer(token)).send({ months, reason });

    expect((await cancel(admin, [N])).status).toBe(403);
    expect((await cancel(accountant, [N])).status).toBe(403);
    expect((await cancel(owner, [N], 'x')).status).toBe(422);
    expect((await cancel(owner, [P])).status).toBe(422);
    await pay(accountant, student, 600_000, [{ period: C, amount: 600_000 }]);
    expect((await cancel(owner, [C])).status).toBe(422);

    const done = await cancel(owner, [N]);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ contractTotal: 1_200_000, scheduledTotal: 1_200_000, mismatch: false });
    expect(done.body.data.months.find((item: { key: string }) => item.key === N)).toMatchObject({ amount: 0, cancelledAmount: 600_000, status: 'CANCELLED' });
    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student } });
    expect([debt.totalAmount.toNumber(), debt.paidAmount.toNumber(), debt.remainingAmount.toNumber()]).toEqual([1_200_000, 600_000, 600_000]);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: student } })).contractPrice.toNumber()).toBe(1_200_000);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment_schedule.cancelled' } })).metadata).toMatchObject({ amount: 600_000, contractBefore: 1_800_000, contractAfter: 1_200_000 });
    expect((await monthly(accountant, N, { status: 'CANCELLED' })).body.data.items).toHaveLength(1);

    // Qayta tuzish bekor qilingan qismni o'chirmaydi; biriktirilgan oy summasidan kam bo'lib qolsa — rad
    const regenerated = await request(app).post(`/api/students/${student}/payment-schedule/generate`).set(bearer(accountant)).send({ count: 2, firstDueDate: `${P}-01` });
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.data.installments.filter((item: { status: string }) => item.status === 'CANCELLED')).toHaveLength(1);
    const tooSmall = await request(app)
      .put(`/api/students/${student}/payment-schedule`)
      .set(bearer(accountant))
      .send({ installments: [{ dueDate: `${P}-01`, amount: 1_000_000 }, { dueDate: `${C}-01`, amount: 200_000 }] });
    expect(tooSmall.status).toBe(422);
    expect(tooSmall.body.errors[0].message).toContain('to‘lov biriktirilgan');
  });

  it('11: filial doirasi va ruxsatlar', async () => {
    const { accountant, course, owner } = await setup();
    const main = await enroll(owner, course.id, 'Asosiy');
    const foreign = await enroll(owner, course.id, 'Begona');
    const other = await prisma.branch.create({ data: { key: 'SERGELI', name: 'Sergeli', sortOrder: 5 } });
    await prisma.student.update({ where: { id: foreign }, data: { branchId: other.id } });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@billing.uz' });
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@billing.uz' });

    const scoped = (await monthly(admin, P)).body.data;
    expect(scoped.items.map((item: { student: { id: string } }) => item.student.id)).toEqual([main]);
    expect(scoped.summary.students).toBe(1);
    expect((await outstanding(admin)).body.data.summary.students).toBe(1);
    expect((await monthly(owner, P)).body.data.summary.students).toBe(2);
    expect((await history(admin, foreign)).status).toBe(403);

    expect((await monthly(teacher, P)).status).toBe(403);
    expect((await outstanding(teacher)).status).toBe(403);
    expect((await report(teacher, P, C)).status).toBe(403);
    const payment = await pay(accountant, main, 600_000);
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@billing.uz' });
    expect(
      (await request(app).put(`/api/payments/${payment.body.data.id}/allocations`).set(bearer(sales)).send({ allocations: [{ period: C, amount: 600_000 }], reason: 'Boshqa oy' })).status,
    ).toBe(403);
    expect((await monthly(accountant, '2026-13')).status).toBe(422);
  });

  it('eski (biriktirilmagan) to‘lovlar avvalgidek muddat tartibida taqsimlanadi', async () => {
    const { accountant, course, owner } = await setup();
    const legacy = await enroll(owner, course.id, 'Eski');
    const created = await pay(accountant, legacy, 900_000);
    // Deploydan oldingi to'lovni taqlid qilish: biriktirish qatori yo'q
    await prisma.paymentAllocation.deleteMany({ where: { paymentId: created.body.data.id } });

    const schedule = (await request(app).get(`/api/students/${legacy}/payment-schedule`).set(bearer(accountant))).body.data;
    expect(schedule.installments.map((item: { paid: number }) => item.paid)).toEqual([600_000, 300_000, 0]);
    const legacyHistory = (await history(accountant, legacy)).body.data;
    expect(legacyHistory.months[0].payments).toEqual([expect.objectContaining({ amount: 600_000, explicit: false })]);
    expect((await outstanding(accountant)).body.data.items[0]).toMatchObject({ debt: 300_000 });

    // Yangi to'lov eski pul egallamagan oyga tushadi
    const next = await pay(accountant, legacy, 300_000);
    expect(next.body.data.allocations).toEqual([{ period: C, amount: 300_000 }]);
    expect((await outstanding(accountant)).body.data.items).toHaveLength(0);
  });
});
