import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();

/** Poyga tasodifiy — har ssenariy bir necha marta takrorlanadi, shunda "omad bilan o'tdi" ehtimoli kamayadi */
const ROUNDS = 4;
const CONTRACT = 3_000_000;
/** Chegirma berish endpointi muvaffaqiyatda qaytaradigan kod */
const GRANTED = 200;

let phone = 0;
async function createStudent(courseId: string, price = CONTRACT) {
  phone += 1;
  const student = await prisma.student.create({
    data: {
      firstName: 'Madina',
      lastName: `Poyga${phone}`,
      phone: `+99890${String(6_000_000 + phone)}`,
      courseId,
      contractPrice: price,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: price, remainingAmount: price } },
    },
  });
  return prisma.student.update({ where: { id: student.id }, data: { referralCode: `R${String(student.number).padStart(5, '0')}` } });
}

async function createRule(key: string, value = 10) {
  return prisma.discountRule.create({ data: { key, name: `Qoida ${key}`, type: key === 'referral' ? 'REFERRAL' : 'CUSTOM', valueType: 'PERCENT', value, stackable: true } });
}

/** Qarz invarianti: qarz qatori to'lovlar tarixi va shartnoma narxi bilan mos */
async function expectDebtConsistent(studentId: string) {
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { contractPrice: true, debt: true } });
  const payments = await prisma.payment.aggregate({ where: { studentId, deletedAt: null }, _sum: { amount: true } });
  const refunds = await prisma.paymentRefund.aggregate({ where: { payment: { studentId, deletedAt: null } }, _sum: { amount: true } });
  const paid = (payments._sum.amount?.toNumber() ?? 0) - (refunds._sum.amount?.toNumber() ?? 0);
  const total = student.contractPrice.toNumber();
  expect(student.debt).not.toBeNull();
  expect({
    total: student.debt!.totalAmount.toNumber(),
    paid: student.debt!.paidAmount.toNumber(),
    remaining: student.debt!.remainingAmount.toNumber(),
  }).toEqual({ total, paid, remaining: Math.max(total - paid, 0) });
  expect(student.debt!.status).toBe(paid <= 0 ? 'UNPAID' : paid >= total ? 'PAID' : 'PARTIAL');
}

describe.skipIf(!hasTestDatabase)('Pul amallarining parallelligi (integratsion)', () => {
  let token: string;
  let courseId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' }));
    courseId = (await createCourse()).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const pay = async (studentId: string, amount: number) => {
    const response = await request(app).post('/api/payments').set(bearer(token)).send({ studentId, amount, method: 'CASH', confirmDuplicate: true });
    expect(response.status).toBe(201);
    return response.body.data.id as string;
  };
  const refund = (paymentId: string, amount: number) =>
    request(app).post(`/api/payments/${paymentId}/refunds`).set(bearer(token)).send({ amount, method: 'CASH', reason: 'O‘quvchi ketdi' });
  const voidPayment = (paymentId: string) => request(app).delete(`/api/payments/${paymentId}`).set(bearer(token)).send({ reason: 'Xato kiritilgan to‘lov' });
  const grant = (studentId: string, body: Record<string, unknown>) => request(app).post(`/api/discounts/students/${studentId}`).set(bearer(token)).send(body);

  it('parallel qaytarishlar birgalikda to‘lov summasidan oshmaydi', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const student = await createStudent(courseId);
      const paymentId = await pay(student.id, 1_000_000);

      // Har biri alohida "yetarli" (600 000 ≤ 1 000 000), lekin ikkitasi birga 1 200 000 — faqat bittasi o'tishi kerak
      const responses = await Promise.all(Array.from({ length: 5 }, () => refund(paymentId, 600_000)));
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status !== 200).every((status) => status === 409 || status === 422)).toBe(true);

      const refunded = await prisma.paymentRefund.aggregate({ where: { paymentId }, _sum: { amount: true }, _count: true });
      expect(refunded._count).toBe(1);
      expect(refunded._sum.amount?.toNumber()).toBe(600_000);
      // Daftarda ham bitta qaytarish yozuvi
      expect(await prisma.transaction.count({ where: { type: 'REFUND', entityType: 'paymentRefund' } })).toBe(round + 1);
      await expectDebtConsistent(student.id);
    }
  });

  it('to‘liq summani parallel qaytarish: aynan bitta muvaffaqiyat', async () => {
    const student = await createStudent(courseId);
    const paymentId = await pay(student.id, 800_000);

    const responses = await Promise.all(Array.from({ length: 4 }, () => refund(paymentId, 800_000)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    const refunded = await prisma.paymentRefund.aggregate({ where: { paymentId }, _sum: { amount: true } });
    expect(refunded._sum.amount?.toNumber()).toBe(800_000);
    await expectDebtConsistent(student.id);
    expect((await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } })).paidAmount.toNumber()).toBe(0);
  });

  it('bekor qilish va qaytarish bir vaqtda: ikkalasi birga o‘tmaydi', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const student = await createStudent(courseId);
      const paymentId = await pay(student.id, 500_000);

      const [voided, refunded] = await Promise.all([voidPayment(paymentId), refund(paymentId, 200_000)]);
      expect([voided.status, refunded.status].filter((status) => status === 200)).toHaveLength(1);

      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { deletedAt: true, _count: { select: { refunds: true } } } });
      // Yo bekor qilingan (qaytarishsiz), yo qaytarilgan (bekor qilinmagan) — aralash holat yo'q
      expect(payment.deletedAt !== null && payment._count.refunds > 0).toBe(false);
      expect(payment.deletedAt !== null || payment._count.refunds === 1).toBe(true);
      await expectDebtConsistent(student.id);
    }
  });

  it('ikki marta parallel bekor qilish: bitta muvaffaqiyat, daftar bir marta qaytariladi', async () => {
    const student = await createStudent(courseId);
    const paymentId = await pay(student.id, 500_000);

    const responses = await Promise.all([voidPayment(paymentId), voidPayment(paymentId), voidPayment(paymentId)]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { action: 'payment.deleted', entityId: paymentId } })).toBe(1);
    await expectDebtConsistent(student.id);
  });

  it('chegirma va to‘lov bir vaqtda: qarz ikkalasini ham hisobga oladi', async () => {
    await createRule('family', 10);
    for (let round = 0; round < ROUNDS; round += 1) {
      const student = await createStudent(courseId);

      const [paid, discounted] = await Promise.all([
        request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 500_000, method: 'CASH' }),
        grant(student.id, { ruleKey: 'family' }),
      ]);
      expect(paid.status).toBe(201);
      expect(discounted.status).toBe(GRANTED);

      const fresh = await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { contractPrice: true } });
      expect(fresh.contractPrice.toNumber()).toBe(CONTRACT * 0.9);
      // Avval: chegirma tranzaksiyadan oldin o'qilgan `paid = 0` ni yozib, to'lovni "yo'qotishi" mumkin edi
      await expectDebtConsistent(student.id);
      expect((await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } })).paidAmount.toNumber()).toBe(500_000);
    }
  });

  it('bir xil chegirma parallel ikki marta berilmaydi', async () => {
    await createRule('family', 10);
    const student = await createStudent(courseId);

    const responses = await Promise.all([grant(student.id, { ruleKey: 'family' }), grant(student.id, { ruleKey: 'family' }), grant(student.id, { ruleKey: 'family' })]);
    expect(responses.filter((response) => response.status === GRANTED)).toHaveLength(1);
    expect(responses.filter((response) => response.status !== GRANTED).every((response) => response.status === 409)).toBe(true);

    expect(await prisma.studentDiscount.count({ where: { studentId: student.id, revokedAt: null } })).toBe(1);
    const fresh = await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { contractPrice: true, discountTotal: true } });
    expect(fresh.contractPrice.toNumber()).toBe(CONTRACT * 0.9);
    expect(fresh.discountTotal.toNumber()).toBe(CONTRACT * 0.1);
    await expectDebtConsistent(student.id);
  });

  it('chegirmani parallel ikki marta bekor qilish narxni ikki marta oshirmaydi', async () => {
    await createRule('family', 10);
    const student = await createStudent(courseId);
    expect((await grant(student.id, { ruleKey: 'family' })).status).toBe(GRANTED);
    const discount = await prisma.studentDiscount.findFirstOrThrow({ where: { studentId: student.id } });

    const revoke = () => request(app).post(`/api/discounts/${discount.id}/revoke`).set(bearer(token)).send({ reason: 'Xato berilgan chegirma' });
    const responses = await Promise.all([revoke(), revoke(), revoke()]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(2);

    const fresh = await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { contractPrice: true, discountTotal: true } });
    expect(fresh.contractPrice.toNumber()).toBe(CONTRACT);
    expect(fresh.discountTotal.toNumber()).toBe(0);
    await expectDebtConsistent(student.id);
  });

  it('promo kod limiti parallel so‘rovlarda oshmaydi', async () => {
    const rule = await prisma.discountRule.create({ data: { key: 'promo', name: 'Promo', type: 'PROMO_CODE', valueType: 'PERCENT', value: 10, stackable: true } });
    const promo = await prisma.promoCode.create({ data: { code: 'KUZ2026', ruleId: rule.id, usageLimit: 1 } });
    const students = [await createStudent(courseId), await createStudent(courseId), await createStudent(courseId)];

    const responses = await Promise.all(students.map((student) => grant(student.id, { promoCode: 'KUZ2026' })));
    expect(responses.filter((response) => response.status === GRANTED)).toHaveLength(1);
    expect(responses.filter((response) => response.status !== GRANTED).every((response) => response.status === 422)).toBe(true);

    expect((await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usedCount).toBe(1);
    expect(await prisma.studentDiscount.count({ where: { promoCodeId: promo.id } })).toBe(1);
    for (const student of students) await expectDebtConsistent(student.id);
  });

  it('taklif bonusi parallel bosilganda bir marta beriladi', async () => {
    await createRule('referral', 5);
    const referrer = await createStudent(courseId);
    const referred = await createStudent(courseId);
    const referral = await prisma.referral.create({ data: { referrerStudentId: referrer.id, referredStudentId: referred.id, status: 'CONVERTED' } });

    const reward = () => request(app).post(`/api/referrals/${referral.id}/reward`).set(bearer(token)).send({});
    const responses = await Promise.all([reward(), reward(), reward()]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(2);

    expect(await prisma.studentDiscount.count({ where: { studentId: referrer.id, revokedAt: null } })).toBe(1);
    const fresh = await prisma.student.findUniqueOrThrow({ where: { id: referrer.id }, select: { contractPrice: true } });
    expect(fresh.contractPrice.toNumber()).toBe(CONTRACT * 0.95);
    expect((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).bonusAmount.toNumber()).toBe(CONTRACT * 0.05);
    await expectDebtConsistent(referrer.id);
  });

  it('shartnoma narxini tahrirlash va to‘lov bir vaqtda: qarz mos qoladi', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const student = await createStudent(courseId);
      const body = {
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        courseId,
        contractPrice: 2_500_000,
        startDate: '2026-09-01',
      };

      const [paid, edited] = await Promise.all([
        request(app).post('/api/payments').set(bearer(token)).send({ studentId: student.id, amount: 400_000, method: 'CASH' }),
        request(app).put(`/api/students/${student.id}`).set(bearer(token)).send(body),
      ]);
      expect(paid.status).toBe(201);
      expect(edited.status).toBe(200);

      await expectDebtConsistent(student.id);
      const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
      expect({ total: debt.totalAmount.toNumber(), paid: debt.paidAmount.toNumber(), remaining: debt.remainingAmount.toNumber() }).toEqual({
        total: 2_500_000,
        paid: 400_000,
        remaining: 2_100_000,
      });
    }
  });
});
