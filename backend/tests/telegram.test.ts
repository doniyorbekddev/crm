import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notificationDeliveryService } from '../src/services/notificationDelivery.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import * as telegram from '../src/services/telegram.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

/** vitest.config.ts da sozlangan sirli kalit */
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';

/** `/start <kod>` xabari — Telegram yuboradigan tuzilma */
function startUpdate(code: string, chatId = 555_111) {
  return { message: { chat: { id: chatId, first_name: 'Ota' }, text: `/start ${code}` } };
}

async function createStudentWithParent(name = 'Farzand') {
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id });
  const student = await prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId: course.id,
      groupId: group.id,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
  const parent = await prisma.parent.create({
    data: { firstName: 'Ota', lastName: 'Ona', phone: '+998901112233', students: { create: [{ studentId: student.id }] } },
  });
  return { student, parent, group };
}

describe.skipIf(!hasTestDatabase)('Telegram bog‘lanishi va yetkazish navbati', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('webhook imzosiz so‘rovni rad etadi', async () => {
    const link = await telegramLinkService.ensureLink({ userId: (await createUserWithToken(app, { role: 'ADMIN' })).user.id });

    const noHeader = await request(app).post('/api/telegram/webhook').send(startUpdate(link.linkCode));
    const wrongHeader = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'boshqa-sirli-kalit')
      .send(startUpdate(link.linkCode));

    expect(noHeader.status).toBe(401);
    expect(wrongHeader.status).toBe(401);
    // Imzo noto'g'ri bo'lsa bog'lanish o'zgarmaydi
    expect(await prisma.telegramLink.findFirst({ where: { linkCode: link.linkCode } })).toMatchObject({ chatId: null });
  });

  it('to‘g‘ri imzo bilan `/start <kod>` chatni bog‘laydi', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const link = await telegramLinkService.ensureLink({ userId: user.id });

    const response = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET)
      .send(startUpdate(link.linkCode));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ linked: true });
    const saved = await prisma.telegramLink.findUniqueOrThrow({ where: { linkCode: link.linkCode } });
    expect(saved).toMatchObject({ chatId: '555111', chatTitle: 'Ota', isActive: true });
    expect(saved.verifiedAt).not.toBeNull();
  });

  it('noma’lum kod bog‘lanish yaratmaydi', async () => {

    const response = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET)
      .send(startUpdate('aaaabbbbccccdddd'));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ linked: false });
    expect(await prisma.telegramLink.count()).toBe(0);
  });

  it('xodim o‘z havolasini oladi va uzadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const first = await request(app).get('/api/telegram/me').set(bearer(token));
    const second = await request(app).get('/api/telegram/me').set(bearer(token));
    const unlinked = await request(app).delete('/api/telegram/me').set(bearer(token));

    expect(first.status).toBe(200);
    expect(first.body.data.linkCode).toHaveLength(16);
    // Takroriy so'rov yangi kod yaratmaydi
    expect(second.body.data.linkCode).toBe(first.body.data.linkCode);
    expect(unlinked.status).toBe(200);
    expect(await prisma.telegramLink.count()).toBe(0);
  });

  it('darsga kelmaganda ota-onaga Telegram navbatiga xabar tushadi', async () => {
    const { student, parent, group } = await createStudentWithParent();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    // Ota-ona Telegramni ulagan
    const link = await telegramLinkService.ensureLink({ parentId: parent.id });
    await prisma.telegramLink.update({ where: { id: link.id }, data: { chatId: '777', verifiedAt: new Date() } });

    const marked = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-21', records: [{ studentId: student.id, status: 'ABSENT' }] });

    expect(marked.status).toBe(200);
    const deliveries = await prisma.notificationDelivery.findMany({ where: { telegramLinkId: link.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ status: 'PENDING', channel: 'TELEGRAM', title: 'Farzandingiz darsga kelmadi' });
    expect(deliveries[0]?.body).toContain('darsga kelmadi');
  });

  it('Telegramni ulamagan ota-onaga navbat yaratilmaydi', async () => {
    const { student, group } = await createStudentWithParent();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-21', records: [{ studentId: student.id, status: 'ABSENT' }] });

    expect(await prisma.notificationDelivery.count()).toBe(0);
  });

  it('navbat: muvaffaqiyatli yuborilgan xabar SENT bo‘ladi', async () => {
    const { parent } = await createStudentWithParent();
    const link = await telegramLinkService.ensureLink({ parentId: parent.id });
    await prisma.telegramLink.update({ where: { id: link.id }, data: { chatId: '777', verifiedAt: new Date() } });
    await prisma.notificationDelivery.create({
      data: { channel: 'TELEGRAM', telegramLinkId: link.id, title: 'Sinov', body: 'Xabar' },
    });
    vi.spyOn(telegram.telegramService, 'sendMessage').mockResolvedValue({ ok: true, retryable: false });

    const result = await notificationDeliveryService.processQueue();

    expect(result).toMatchObject({ sent: 1, failed: 0 });
    const row = await prisma.notificationDelivery.findFirstOrThrow();
    expect(row.status).toBe('SENT');
    expect(row.attempts).toBe(1);
    expect(row.sentAt).not.toBeNull();
  });

  it('navbat: vaqtinchalik xato — qayta urinish rejalashtiriladi, doimiy xato — FAILED', async () => {
    const { parent } = await createStudentWithParent();
    const link = await telegramLinkService.ensureLink({ parentId: parent.id });
    await prisma.telegramLink.update({ where: { id: link.id }, data: { chatId: '777', verifiedAt: new Date() } });
    const temporary = await prisma.notificationDelivery.create({
      data: { channel: 'TELEGRAM', telegramLinkId: link.id, title: 'Vaqtinchalik', body: 'Xabar' },
    });

    vi.spyOn(telegram.telegramService, 'sendMessage').mockResolvedValue({ ok: false, retryable: true, error: '429' });
    await notificationDeliveryService.processQueue();
    const afterRetryable = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: temporary.id } });

    vi.spyOn(telegram.telegramService, 'sendMessage').mockResolvedValue({ ok: false, retryable: false, error: 'chat not found' });
    // Qayta urinish vaqti kelgan deb hisoblaymiz
    await prisma.notificationDelivery.update({ where: { id: temporary.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const second = await notificationDeliveryService.processQueue();
    const afterPermanent = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: temporary.id } });

    expect(afterRetryable).toMatchObject({ status: 'PENDING', attempts: 1, lastError: '429' });
    expect(afterRetryable.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(second).toMatchObject({ failed: 1 });
    expect(afterPermanent).toMatchObject({ status: 'FAILED', attempts: 2, lastError: 'chat not found' });
  });

  it('bog‘lanish uzilgan bo‘lsa xabar SKIPPED bo‘ladi va qayta urinilmaydi', async () => {
    const { parent } = await createStudentWithParent();
    const link = await telegramLinkService.ensureLink({ parentId: parent.id });
    await prisma.telegramLink.update({ where: { id: link.id }, data: { chatId: '777', verifiedAt: new Date(), isActive: false } });
    await prisma.notificationDelivery.create({
      data: { channel: 'TELEGRAM', telegramLinkId: link.id, title: 'Sinov', body: 'Xabar' },
    });
    const sendSpy = vi.spyOn(telegram.telegramService, 'sendMessage');

    const result = await notificationDeliveryService.processQueue();

    expect(result).toMatchObject({ skipped: 1, sent: 0 });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(await prisma.notificationDelivery.findFirstOrThrow()).toMatchObject({ status: 'SKIPPED' });
  });

  it('bir xil hodisa ikki marta navbatga tushmaydi (dedupe)', async () => {
    const { student, group, parent } = await createStudentWithParent();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const link = await telegramLinkService.ensureLink({ parentId: parent.id });
    await prisma.telegramLink.update({ where: { id: link.id }, data: { chatId: '777', verifiedAt: new Date() } });

    const payload = { date: '2026-09-21', records: [{ studentId: student.id, status: 'ABSENT' }] };
    await request(app).post(`/api/groups/${group.id}/attendance`).set(bearer(token)).send(payload);
    await request(app).post(`/api/groups/${group.id}/attendance`).set(bearer(token)).send(payload);

    expect(await prisma.notificationDelivery.count({ where: { telegramLinkId: link.id } })).toBe(1);
  });
});
