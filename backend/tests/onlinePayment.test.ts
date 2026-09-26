import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();
const SECRET = 'test-payment-sandbox-secret';

function sign(body: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  return { raw, signature: createHmac('sha256', SECRET).update(raw).digest('hex') };
}

/** Provayder yuboradigan webhook — xom tana va imzo bilan */
async function sendWebhook(body: unknown, options: { signature?: string } = {}) {
  const { raw, signature } = sign(body);
  return request(app)
    .post('/api/payments/webhook/sandbox')
    .set('Content-Type', 'application/json')
    .set('X-Signature', options.signature ?? signature)
    .send(raw);
}

async function createStudent(courseId: string, price = 1_000_000) {
  return prisma.student.create({
    data: {
      firstName: 'Onlayn',
      lastName: 'To‘lovchi',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      contractPrice: price,
      startDate: new Date('2026-03-01'),
      debt: { create: { totalAmount: price, remainingAmount: price } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Onlayn to‘lov: webhook oqimi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('imzosiz yoki noto‘g‘ri imzoli so‘rov rad etiladi va to‘lov yaratilmaydi', async () => {
    const course = await createCourse('Frontend');
    const student = await createStudent(course.id);

    const noSignature = await request(app)
      .post('/api/payments/webhook/sandbox')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ transactionId: 'tx-1', amount: 100_000, status: 'paid', studentId: student.id }));
    expect(noSignature.status).toBe(401);

    const wrongSignature = await sendWebhook(
      { transactionId: 'tx-2', amount: 100_000, status: 'paid', studentId: student.id },
      { signature: 'a'.repeat(64) },
    );
    expect(wrongSignature.status).toBe(401);

    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentIntent.count()).toBe(0);
  });

  it('to‘g‘ri imzo bilan kvitansiya yaratiladi va qarz kamayadi', async () => {
    const course = await createCourse('Backend');
    const student = await createStudent(course.id, 1_000_000);

    const response = await sendWebhook({ transactionId: 'tx-100', amount: 400_000, status: 'paid', studentId: student.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });

    const payment = await prisma.payment.findFirstOrThrow({ where: { studentId: student.id } });
    expect(payment.amount.toNumber()).toBe(400_000);
    // Onlayn to'lovni xodim qabul qilmaydi
    expect(payment.accountantId).toBeNull();
    expect(payment.idempotencyKey).toBe('SANDBOX-tx-100');

    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt.paidAmount.toNumber()).toBe(400_000);
    expect(debt.remainingAmount.toNumber()).toBe(600_000);

    const intent = await prisma.paymentIntent.findFirstOrThrow({});
    expect(intent.status).toBe('PAID');
    expect(intent.paymentId).toBe(payment.id);
    expect(intent.paidAt).not.toBeNull();

    // Daftarda aynan bitta kirim
    expect(await prisma.transaction.count({ where: { type: 'INCOME' } })).toBe(1);
  });

  it('takroriy webhook ikkinchi kvitansiya yaratmaydi', async () => {
    const course = await createCourse('Dizayn');
    const student = await createStudent(course.id);
    const body = { transactionId: 'tx-200', amount: 250_000, status: 'paid', studentId: student.id };

    const first = await sendWebhook(body);
    const second = await sendWebhook(body);
    const third = await sendWebhook(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.transaction.count({ where: { type: 'INCOME' } })).toBe(1);
    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt.paidAmount.toNumber()).toBe(250_000);
  });

  it('bekor qilingan to‘lovda kvitansiya yaratilmaydi', async () => {
    const course = await createCourse('Matematika');
    const student = await createStudent(course.id);

    const response = await sendWebhook({
      transactionId: 'tx-300',
      amount: 150_000,
      status: 'cancelled',
      studentId: student.id,
      reason: 'Mijoz bekor qildi',
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(false);
    expect(await prisma.payment.count()).toBe(0);
    const intent = await prisma.paymentIntent.findFirstOrThrow({});
    expect(intent.status).toBe('CANCELLED');
    expect(intent.failureText).toBe('Mijoz bekor qildi');
  });

  it('so‘rovdagidan boshqa summa kelsa to‘lov yozilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Fizika');
    const student = await createStudent(course.id);

    const intent = await request(app)
      .post('/api/payments/online/intents')
      .set(bearer(token))
      .send({ provider: 'SANDBOX', studentId: student.id, amount: 300_000 });
    expect(intent.status).toBe(201);

    const response = await sendWebhook({
      transactionId: 'tx-400',
      amount: 50_000,
      status: 'paid',
      intentId: intent.body.data.id,
    });

    expect(response.status).toBe(422);
    expect(await prisma.payment.count()).toBe(0);
    const stored = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.body.data.id } });
    expect(stored.status).toBe('FAILED');
    expect(stored.failureText).toContain('mos kelmadi');
  });

  it('CRM ichida yaratilgan so‘rov webhook bilan yopiladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Kimyo');
    const student = await createStudent(course.id);

    const created = await request(app)
      .post('/api/payments/online/intents')
      .set(bearer(token))
      .send({ provider: 'SANDBOX', studentId: student.id, amount: 200_000 });

    const response = await sendWebhook({
      transactionId: 'click-xyz',
      amount: 200_000,
      status: 'paid',
      intentId: created.body.data.id,
    });

    expect(response.status).toBe(200);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(intent.status).toBe('PAID');
    // Provayder raqami yozib olinadi
    expect(intent.externalId).toBe('click-xyz');

    const list = await request(app).get('/api/payments/online/intents').set(bearer(token));
    expect(list.body.data[0]).toMatchObject({ status: 'PAID', provider: 'SANDBOX', amount: 200_000 });
  });

  it('sozlanmagan provayder yo‘li yopiq', async () => {
    const response = await request(app)
      .post('/api/payments/webhook/click')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ transactionId: 'x', amount: 1000, status: 'paid' }));

    // TZ 3.1 GAP-17: CLICK endi ro'yxatda, lekin kalitlarsiz — yo'l yopiq (503), hech narsa yozilmaydi
    expect(response.status).toBe(503);
    expect(await prisma.paymentIntent.count()).toBe(0);
    expect(await prisma.paymentProviderTransaction.count()).toBe(0);

    // Ro'yxatda yo'q provayder — topilmadi
    const unknown = await request(app).post('/api/payments/webhook/nomalum').set('Content-Type', 'application/json').send('{}');
    expect(unknown.status).toBe(404);
  });

  it('audit S8: bir xil webhook parallel kelsa — 500 yo‘q, kvitansiya bitta', async () => {
    const course = await createCourse('Parallel');
    const student = await createStudent(course.id);
    const body = { transactionId: 'tx-par', amount: 100_000, status: 'paid', studentId: student.id };
    const responses = await Promise.all([sendWebhook(body), sendWebhook(body), sendWebhook(body), sendWebhook(body)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(await prisma.payment.count({ where: { studentId: student.id } })).toBe(1);

    // Poyga aniq takrorlanadi: "bormi?" tekshiruvi o'tib ketdi (boshqa so'rov hali yozmagan edi), yaratishda P2002
    const lookup = vi.spyOn(prisma.paymentIntent, 'findUnique').mockResolvedValueOnce(null);
    const raced = await sendWebhook(body);
    lookup.mockRestore();
    expect(raced.status).toBe(200);
    expect(await prisma.payment.count({ where: { studentId: student.id } })).toBe(1);
    expect(await prisma.paymentIntent.count()).toBe(1);
  });

  it('onlayn to‘lov auditga tushadi', async () => {
    const course = await createCourse('Ingliz tili');
    const student = await createStudent(course.id);
    await sendWebhook({ transactionId: 'tx-500', amount: 120_000, status: 'paid', studentId: student.id });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.online_received' } });
    expect(log.metadata).toMatchObject({ provider: 'SANDBOX', externalId: 'tx-500', amount: 120_000 });
    // Xodim emas — tizim yozuvi
    expect(log.userId).toBeNull();
  });
});
