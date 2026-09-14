import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { DUPLICATE_PAYMENT_WINDOW_MINUTES } from '../src/services/payment.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();
const KEY = 'form-open-0123456789abcdef';

async function setup(contract = 3_000_000) {
  const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' });
  const course = await createCourse();
  const student = await prisma.student.create({
    data: {
      firstName: 'Madina',
      lastName: 'Yusupova',
      phone: '+998907771122',
      courseId: course.id,
      contractPrice: contract,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: contract, remainingAmount: contract } },
    },
  });
  return { token, student };
}

function pay(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/payments').set(bearer(token)).send({ method: 'CASH', ...body });
}

async function paidAmount(studentId: string): Promise<number> {
  return (await prisma.debt.findUniqueOrThrow({ where: { studentId } })).paidAmount.toNumber();
}

describe.skipIf(!hasTestDatabase)('Takroriy to‘lovdan himoya (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bir xil so‘rov kaliti bilan qayta yuborilgan to‘lov yangisini yaratmaydi', async () => {
    const { token, student } = await setup();
    const first = await pay(token, { studentId: student.id, amount: 500_000, idempotencyKey: KEY });
    expect(first.status).toBe(201);

    const replay = await pay(token, { studentId: student.id, amount: 500_000, idempotencyKey: KEY });
    expect(replay.status).toBe(200);
    expect(replay.body.message).toBe('Bu to‘lov allaqachon qabul qilingan');
    expect(replay.body.data.id).toBe(first.body.data.id);

    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.transaction.count({ where: { entityType: 'payment' } })).toBe(1);
    expect(await paidAmount(student.id)).toBe(500_000);

    // Kalit boshqa summa bilan ishlatilsa — xato, jimgina eski to'lov qaytarilmaydi
    const misuse = await pay(token, { studentId: student.id, amount: 700_000, idempotencyKey: KEY });
    expect(misuse.status).toBe(409);
    expect(await prisma.payment.count()).toBe(1);

    expect((await pay(token, { studentId: student.id, amount: 500_000, idempotencyKey: 'bad key!' })).status).toBe(422);
  });

  it('yaqinda xuddi shu summa qabul qilingan bo‘lsa tasdiq so‘raladi, tasdiqdan keyin saqlanadi va auditga belgi tushadi', async () => {
    const { token, student } = await setup();
    const first = await pay(token, { studentId: student.id, amount: 500_000 });
    expect(first.status).toBe(201);
    const receipt = first.body.data.code as string;

    const warned = await pay(token, { studentId: student.id, amount: 500_000, method: 'CARD' });
    expect(warned.status).toBe(409);
    expect(warned.body.message).toBe(`Bu o‘quvchidan xuddi shu summa hozirgina qabul qilingan (${receipt})`);
    expect(warned.body.errors).toEqual([{ field: 'duplicatePayment', message: receipt }]);
    expect(await prisma.payment.count()).toBe(1);

    const confirmed = await pay(token, { studentId: student.id, amount: 500_000, confirmDuplicate: true });
    expect(confirmed.status).toBe(201);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.created', entityId: confirmed.body.data.id } });
    expect(audit.metadata).toMatchObject({ duplicateOf: receipt });
    expect(await paidAmount(student.id)).toBe(1_000_000);

    // Boshqa summa — ogohlantirishsiz
    expect((await pay(token, { studentId: student.id, amount: 300_000 })).status).toBe(201);
  });

  it('boshqa to‘lov kuni bilan kiritilgan teng summa (o‘tgan oylar qismlari) takror hisoblanmaydi', async () => {
    const { token, student } = await setup();
    expect((await pay(token, { studentId: student.id, amount: 500_000, paidAt: '2026-07-05T07:00:00.000Z' })).status).toBe(201);
    expect((await pay(token, { studentId: student.id, amount: 500_000, paidAt: '2026-08-05T07:00:00.000Z' })).status).toBe(201);
    // Xuddi shu kun (Toshkent vaqti bo'yicha) — ogohlantirish
    const sameDay = await pay(token, { studentId: student.id, amount: 500_000, paidAt: '2026-08-05T15:00:00.000Z' });
    expect(sameDay.status).toBe(409);
    expect(await paidAmount(student.id)).toBe(1_000_000);
  });

  it('bekor qilingan va vaqt oynasidan eski to‘lov takror hisoblanmaydi', async () => {
    const { token, student } = await setup();
    const cancelled = await pay(token, { studentId: student.id, amount: 400_000 });
    await prisma.payment.update({ where: { id: cancelled.body.data.id }, data: { deletedAt: new Date() } });
    expect((await pay(token, { studentId: student.id, amount: 400_000 })).status).toBe(201);

    await prisma.payment.updateMany({
      data: { createdAt: new Date(Date.now() - (DUPLICATE_PAYMENT_WINDOW_MINUTES + 1) * 60_000) },
    });
    expect((await pay(token, { studentId: student.id, amount: 400_000 })).status).toBe(201);
  });

  it('bir vaqtda kelgan so‘rovlar: bittasi o‘tadi, qarzdan oshib ketmaydi', async () => {
    const { token, student } = await setup(3_000_000);

    const sameBody = await Promise.all([
      pay(token, { studentId: student.id, amount: 600_000 }),
      pay(token, { studentId: student.id, amount: 600_000 }),
    ]);
    expect(sameBody.map((response) => response.status).sort()).toEqual([201, 409]);

    const sameKey = await Promise.all([
      pay(token, { studentId: student.id, amount: 700_000, idempotencyKey: `${KEY}-parallel` }),
      pay(token, { studentId: student.id, amount: 700_000, idempotencyKey: `${KEY}-parallel` }),
    ]);
    expect(sameKey.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(await prisma.payment.count()).toBe(2);

    // Qolgan qarz 1 700 000: ikkita 1 000 000 lik parallel to'lovdan faqat bittasi sig'adi
    const overpay = await Promise.all([
      pay(token, { studentId: student.id, amount: 1_000_000, confirmDuplicate: true }),
      pay(token, { studentId: student.id, amount: 1_000_000, confirmDuplicate: true }),
    ]);
    expect(overpay.map((response) => response.status).sort()).toEqual([201, 422]);
    expect(await paidAmount(student.id)).toBe(2_300_000);
  });
});
