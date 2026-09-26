import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/database.js';
import { clickSignature } from '../src/services/payments/click.provider.js';
import { PAYME_TIMEOUT_MS } from '../src/services/payments/payme.provider.js';
import { onlinePaymentService } from '../src/services/payments/onlinePayment.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

/**
 * TZ 3.1 GAP-17 / §39: PaymentIntent → Provider → Webhook → Signature → Idempotency → Payment → Receipt.
 * Kalitlar faqat shu testda (sinov qiymatlari) — umumiy muhitda provayderlar o'chiq qoladi.
 */
const app = createApp();
const mutableEnv = env as { -readonly [K in keyof typeof env]: (typeof env)[K] };
const saved = { ...env };
const PAYME_KEY = 'test-payme-kassa-key';
const CLICK_SECRET = 'test-click-secret';

let phone = 0;
async function student(price = 1_000_000) {
  const course = await createCourse();
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: 'Onlayn',
      lastName: 'Provayder',
      phone: `+99885${String(1_000_000 + phone).slice(-7)}`,
      courseId: course.id,
      contractPrice: price,
      startDate: new Date('2026-03-01'),
      debt: { create: { totalAmount: price, remainingAmount: price } },
    },
  });
}

async function intent(provider: 'PAYME' | 'CLICK', amount = 250_000) {
  const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
  const row = await student();
  const created = await request(app).post('/api/payments/online/intents').set(bearer(token)).send({ provider, studentId: row.id, amount }).expect(201);
  return { intent: created.body.data as { id: string; checkoutUrl: string | null }, student: row, token };
}

// --- Payme ----------------------------------------------------------------
let rpcId = 0;
const payme = (method: string, params: object, key = PAYME_KEY) =>
  request(app)
    .post('/api/payments/webhook/payme')
    .set('Authorization', `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}`)
    .send({ method, params, id: (rpcId += 1) });

// --- Click ----------------------------------------------------------------
function clickForm(fields: Record<string, string>) {
  const params = {
    click_trans_id: '9001',
    service_id: '777',
    click_paydoc_id: '5551',
    amount: '250000',
    error: '0',
    error_note: 'Success',
    sign_time: '2026-09-27 10:00:00',
    ...fields,
  } as Record<string, string>;
  params.sign_string = clickSignature(params as never, CLICK_SECRET);
  return params;
}
const click = (form: Record<string, string>) => request(app).post('/api/payments/webhook/click').type('form').send(form);

describe.skipIf(!hasTestDatabase)('Click va Payme provayderlari (GAP-17)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    Object.assign(mutableEnv, {
      PAYME_MERCHANT_ID: 'test-merchant-id',
      PAYME_KEY,
      PAYME_MODE: 'test',
      CLICK_SERVICE_ID: '777',
      CLICK_MERCHANT_ID: '888',
      CLICK_SECRET_KEY: CLICK_SECRET,
      CLICK_MODE: 'test',
    });
  });
  afterEach(() => {
    Object.assign(mutableEnv, {
      PAYME_MERCHANT_ID: saved.PAYME_MERCHANT_ID,
      PAYME_KEY: saved.PAYME_KEY,
      PAYME_MODE: saved.PAYME_MODE,
      CLICK_SERVICE_ID: saved.CLICK_SERVICE_ID,
      CLICK_MERCHANT_ID: saved.CLICK_MERCHANT_ID,
      CLICK_SECRET_KEY: saved.CLICK_SECRET_KEY,
      CLICK_MODE: saved.CLICK_MODE,
      CLICK_MERCHANT_USER_ID: saved.CLICK_MERCHANT_USER_ID,
    });
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('provayderlar ro‘yxati sinov rejimini yashirmaydi; havola sinov kassasiga', async () => {
    const providers = onlinePaymentService.providers();
    expect(providers.find((item) => item.key === 'PAYME')).toMatchObject({ configured: true, mode: 'test' });
    expect(providers.find((item) => item.key === 'CLICK')).toMatchObject({ configured: true, mode: 'test' });
    const { intent: payIntent } = await intent('PAYME');
    expect(payIntent.checkoutUrl).toMatch(/^https:\/\/checkout\.test\.paycom\.uz\//);
    const decoded = Buffer.from(payIntent.checkoutUrl!.split('/').pop()!, 'base64').toString('utf8');
    expect(decoded).toContain(`m=test-merchant-id;ac.order_id=${payIntent.id};a=25000000;`);
    const { intent: clickIntent } = await intent('CLICK');
    expect(clickIntent.checkoutUrl).toContain('https://my.click.uz/services/pay?service_id=777&merchant_id=888&amount=250000.00');
  });

  describe('Payme', () => {
    it('§39: Check → Create → Perform: bitta kvitansiya, qarz kamayadi; takroriy Create/Perform — o‘sha natija', async () => {
      const { intent: order, student: row } = await intent('PAYME');
      const account = { order_id: order.id };
      const check = await payme('CheckPerformTransaction', { amount: 25_000_000, account }).expect(200);
      expect(check.body.result).toEqual({ allow: true });

      const time = Date.now();
      const created = await payme('CreateTransaction', { id: 'pm-tx-1', time, amount: 25_000_000, account }).expect(200);
      expect(created.body.result).toMatchObject({ state: 1 });
      const again = await payme('CreateTransaction', { id: 'pm-tx-1', time, amount: 25_000_000, account });
      expect(again.body.result).toEqual(created.body.result);

      const performed = await payme('PerformTransaction', { id: 'pm-tx-1' });
      expect(performed.body.result).toMatchObject({ state: 2, transaction: created.body.result.transaction });
      const performedAgain = await payme('PerformTransaction', { id: 'pm-tx-1' });
      expect(performedAgain.body.result).toEqual(performed.body.result);

      expect(await prisma.payment.count({ where: { studentId: row.id } })).toBe(1);
      const payment = await prisma.payment.findFirstOrThrow({ where: { studentId: row.id } });
      expect(payment).toMatchObject({ method: 'PAYME', idempotencyKey: 'PAYME-pm-tx-1' });
      expect((await prisma.debt.findUniqueOrThrow({ where: { studentId: row.id } })).remainingAmount.toNumber()).toBe(750_000);
      expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PAID', paymentId: payment.id });
      expect(await prisma.auditLog.count({ where: { action: 'payment.online_received' } })).toBe(1);

      const status = await payme('CheckTransaction', { id: 'pm-tx-1' });
      expect(status.body.result).toMatchObject({ state: 2, cancel_time: 0, reason: null });
      // To'langan buyurtmaga yangi tranzaksiya — rad
      const second = await payme('CreateTransaction', { id: 'pm-tx-2', time, amount: 25_000_000, account });
      expect(second.body.error.code).toBe(-31051);
    });

    it('xatolar: kalit noto‘g‘ri −32504, summa −31001, buyurtma −31050, tranzaksiya −31003, metod −32601, so‘rov −32600', async () => {
      const { intent: order } = await intent('PAYME');
      expect((await payme('CheckPerformTransaction', { amount: 25_000_000, account: { order_id: order.id } }, 'notogri')).body.error.code).toBe(-32504);
      expect((await payme('CheckPerformTransaction', { amount: 100, account: { order_id: order.id } })).body.error.code).toBe(-31001);
      const missing = await payme('CheckPerformTransaction', { amount: 25_000_000, account: { order_id: 'yoq' } });
      expect(missing.body.error).toMatchObject({ code: -31050, data: 'order_id' });
      expect(missing.body.error.message).toMatchObject({ uz: expect.any(String), ru: expect.any(String), en: expect.any(String) });
      expect((await payme('PerformTransaction', { id: 'yoq' })).body.error.code).toBe(-31003);
      expect((await payme('ChangeEverything', {})).body.error.code).toBe(-32601);
      const invalid = await request(app).post('/api/payments/webhook/payme').set('Authorization', `Basic ${Buffer.from(`Paycom:${PAYME_KEY}`).toString('base64')}`).send({ id: 1 });
      expect(invalid.status).toBe(200);
      expect(invalid.body.error.code).toBe(-32600);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('band buyurtma: faol tranzaksiya bor — ikkinchisi −31051; bekor (−1) qilingach yana to‘lanadi', async () => {
      const { intent: order } = await intent('PAYME');
      const account = { order_id: order.id };
      await payme('CreateTransaction', { id: 'pm-a', time: Date.now(), amount: 25_000_000, account });
      expect((await payme('CreateTransaction', { id: 'pm-b', time: Date.now(), amount: 25_000_000, account })).body.error.code).toBe(-31051);
      const cancelled = await payme('CancelTransaction', { id: 'pm-a', reason: 3 });
      expect(cancelled.body.result).toMatchObject({ state: -1 });
      expect((await payme('CheckTransaction', { id: 'pm-a' })).body.result).toMatchObject({ state: -1, reason: 3 });
      expect((await payme('PerformTransaction', { id: 'pm-a' })).body.error.code).toBe(-31008);
      expect((await payme('CreateTransaction', { id: 'pm-b', time: Date.now(), amount: 25_000_000, account })).body.result).toMatchObject({ state: 1 });
    });

    it('12 soatdan eski tranzaksiya: Perform −31008, sabab 4 bilan bekor', async () => {
      const { intent: order } = await intent('PAYME');
      await payme('CreateTransaction', { id: 'pm-old', time: Date.now() - PAYME_TIMEOUT_MS - 60_000, amount: 25_000_000, account: { order_id: order.id } });
      expect((await payme('PerformTransaction', { id: 'pm-old' })).body.error.code).toBe(-31008);
      expect((await payme('CheckTransaction', { id: 'pm-old' })).body.result).toMatchObject({ state: -1, reason: 4 });
      expect(await prisma.payment.count()).toBe(0);
    });

    it('bajarilgandan keyin Cancel — CRM’da qaytarish (−2), so‘rov REFUNDED, qarz tiklanadi; takror Cancel — o‘sha', async () => {
      const { intent: order, student: row } = await intent('PAYME');
      const account = { order_id: order.id };
      await payme('CreateTransaction', { id: 'pm-r', time: Date.now(), amount: 25_000_000, account });
      await payme('PerformTransaction', { id: 'pm-r' });
      const cancelled = await payme('CancelTransaction', { id: 'pm-r', reason: 5 });
      expect(cancelled.body.result).toMatchObject({ state: -2 });
      expect((await payme('CancelTransaction', { id: 'pm-r', reason: 5 })).body.result).toEqual(cancelled.body.result);
      expect(await prisma.paymentRefund.count()).toBe(1);
      expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'REFUNDED' });
      expect((await prisma.debt.findUniqueOrThrow({ where: { studentId: row.id } })).remainingAmount.toNumber()).toBe(1_000_000);
    });

    it('GetStatement: davrdagi tranzaksiyalar', async () => {
      const { intent: order } = await intent('PAYME');
      const time = Date.now();
      await payme('CreateTransaction', { id: 'pm-s', time, amount: 25_000_000, account: { order_id: order.id } });
      const statement = await payme('GetStatement', { from: time - 1000, to: time + 1000 });
      expect(statement.body.result.transactions).toEqual([expect.objectContaining({ id: 'pm-s', time, amount: 25_000_000, account: { order_id: order.id }, state: 1 })]);
    });

    it('parallel Perform — bitta kvitansiya', async () => {
      const { intent: order } = await intent('PAYME');
      await payme('CreateTransaction', { id: 'pm-p', time: Date.now(), amount: 25_000_000, account: { order_id: order.id } });
      const results = await Promise.all([payme('PerformTransaction', { id: 'pm-p' }), payme('PerformTransaction', { id: 'pm-p' }), payme('PerformTransaction', { id: 'pm-p' })]);
      expect(results.every((response) => response.body.result?.state === 2)).toBe(true);
      expect(await prisma.payment.count()).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'payment.online_received' } })).toBe(1);
    });
  });

  describe('Click', () => {
    it('§39: Prepare → Complete: bitta kvitansiya; takroriy Complete −4, yangi to‘lov yo‘q', async () => {
      const { intent: order, student: row } = await intent('CLICK');
      const prepared = await click(clickForm({ merchant_trans_id: order.id, action: '0' })).expect(200);
      expect(prepared.body).toMatchObject({ error: 0, click_trans_id: 9001, merchant_trans_id: order.id, merchant_prepare_id: expect.any(Number) });
      const prepareId = String(prepared.body.merchant_prepare_id);
      // Takroriy Prepare — o'sha raqam
      expect((await click(clickForm({ merchant_trans_id: order.id, action: '0' }))).body.merchant_prepare_id).toBe(prepared.body.merchant_prepare_id);

      const completed = await click(clickForm({ merchant_trans_id: order.id, action: '1', merchant_prepare_id: prepareId }));
      expect(completed.body).toMatchObject({ error: 0, merchant_confirm_id: prepared.body.merchant_prepare_id });
      const duplicate = await click(clickForm({ merchant_trans_id: order.id, action: '1', merchant_prepare_id: prepareId }));
      expect(duplicate.body.error).toBe(-4);

      expect(await prisma.payment.count({ where: { studentId: row.id } })).toBe(1);
      expect(await prisma.payment.findFirstOrThrow({ where: { studentId: row.id } })).toMatchObject({ method: 'CLICK', idempotencyKey: 'CLICK-9001' });
      expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PAID' });
    });

    it('xatolar: imzo −1, summa −2, amal −3, buyurtma −5, tranzaksiya −6, so‘rov −8; hech narsa yozilmaydi', async () => {
      const { intent: order } = await intent('CLICK');
      const bad = { ...clickForm({ merchant_trans_id: order.id, action: '0' }), sign_string: 'a'.repeat(32) };
      expect((await click(bad)).body.error).toBe(-1);
      expect((await click(clickForm({ merchant_trans_id: order.id, action: '0', amount: '1000' }))).body.error).toBe(-2);
      expect((await click(clickForm({ merchant_trans_id: order.id, action: '7' }))).body.error).toBe(-3);
      expect((await click(clickForm({ merchant_trans_id: 'yoq', action: '0' }))).body.error).toBe(-5);
      expect((await click(clickForm({ merchant_trans_id: order.id, action: '1', merchant_prepare_id: '999999' }))).body.error).toBe(-6);
      expect((await click({ action: '0' })).body.error).toBe(-8);
      expect(await prisma.paymentProviderTransaction.count()).toBe(0);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('Complete error<0 — bekor (−9), kvitansiya yo‘q, buyurtma yana to‘lanadi', async () => {
      const { intent: order } = await intent('CLICK');
      const prepared = await click(clickForm({ merchant_trans_id: order.id, action: '0' }));
      const cancelled = await click(clickForm({ merchant_trans_id: order.id, action: '1', merchant_prepare_id: String(prepared.body.merchant_prepare_id), error: '-5017' }));
      expect(cancelled.body.error).toBe(-9);
      expect(await prisma.payment.count()).toBe(0);
      const retry = await click(clickForm({ click_trans_id: '9002', merchant_trans_id: order.id, action: '0' }));
      expect(retry.body.error).toBe(0);
    });

    it('qaytarish: Merchant API sozlanmagan — rad (soxta “qaytarildi” yo‘q); sozlangan — reversal va CRM qaytarish', async () => {
      const { intent: order, student: row } = await intent('CLICK');
      const { token } = await createUserWithToken(app, { role: 'OWNER' });
      const prepared = await click(clickForm({ merchant_trans_id: order.id, action: '0' }));
      await click(clickForm({ merchant_trans_id: order.id, action: '1', merchant_prepare_id: String(prepared.body.merchant_prepare_id) }));

      const refused = await request(app).post(`/api/payments/online/intents/${order.id}/refund`).set(bearer(token));
      expect(refused.status).toBe(422);
      expect(await prisma.paymentRefund.count()).toBe(0);

      mutableEnv.CLICK_MERCHANT_USER_ID = '12345';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error_code: 0, error_note: 'Success', payment_id: 5551 }), { status: 200 }));
      const refunded = await request(app).post(`/api/payments/online/intents/${order.id}/refund`).set(bearer(token)).expect(200);
      expect(refunded.body.data.status).toBe('REFUNDED');
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toBe('https://api.click.uz/v2/merchant/payment/reversal/777/5551');
      expect((init as RequestInit).method).toBe('DELETE');
      expect(String(((init as RequestInit).headers as Record<string, string>).Auth)).toMatch(/^12345:[0-9a-f]{40}:\d+$/);
      expect(await prisma.paymentRefund.count()).toBe(1);
      expect((await prisma.debt.findUniqueOrThrow({ where: { studentId: row.id } })).remainingAmount.toNumber()).toBe(1_000_000);
    });
  });

  it('bot “To‘lash”: sinov kassasi havolasi (sinov belgisi bilan); qayta bosilsa o‘sha so‘rov', async () => {
    resetRateLimits();
    const row = await student();
    const link = await telegramLinkService.ensureLink({ studentId: row.id });
    const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'test-telegram-webhook-secret').send(body);
    const shown: Array<{ text: string; keyboard: InlineKeyboard | undefined }> = [];
    vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
      shown.push({ text, keyboard });
      return { ok: true, retryable: false };
    });
    vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
      shown.push({ text, keyboard });
      return { ok: true, retryable: false };
    });
    vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
    await post({ message: { message_id: 1, chat: { id: 84_001 }, from: { id: 84_001 }, text: `/start ${link.linkCode}` } });
    const press = () => post({ callback_query: { id: 'cb', data: 'st_paynow', from: { id: 84_001 }, message: { message_id: 1, chat: { id: 84_001 } } } });

    await press().expect(200);
    const buttons = (shown.at(-1)!.keyboard ?? []).flat().filter((button) => button.url);
    expect(buttons.map((button) => button.text)).toEqual(['💳 Click orqali to‘lash (sinov)', '💳 Payme orqali to‘lash (sinov)']);
    expect(buttons[1]!.url).toMatch(/^https:\/\/checkout\.test\.paycom\.uz\//);
    expect(shown.at(-1)!.text).toContain('Sinov rejimi');
    await press().expect(200);
    expect(await prisma.paymentIntent.count({ where: { studentId: row.id } })).toBe(2);
  });

  it('kalitlar olib tashlansa — ikkala yo‘l yopiq (503), havola yo‘q', async () => {
    const { intent: order } = await intent('PAYME');
    Object.assign(mutableEnv, { PAYME_KEY: undefined, CLICK_SECRET_KEY: undefined });
    expect((await payme('CheckPerformTransaction', { amount: 25_000_000, account: { order_id: order.id } })).status).toBe(503);
    expect((await click(clickForm({ merchant_trans_id: order.id, action: '0' }))).status).toBe(503);
    expect((await onlinePaymentService.getById(order.id)).checkoutUrl).toBeNull();
  });
});
