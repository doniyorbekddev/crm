import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notificationDeliveryService } from '../src/services/notificationDelivery.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { telegramSessionService } from '../src/telegram/session.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const ADMIN_CHAT = 3_001;

interface Sent {
  chatId: string;
  text: string;
  keyboard: InlineKeyboard | undefined;
}

function captureBot() {
  const shown: Sent[] = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (chatId: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ chatId, text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (chatId: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ chatId, text, keyboard });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  return {
    shown,
    last: () => shown.at(-1)!,
    lastData: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data),
  };
}

function post(body: object) {
  return request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
}
function message(text: string, chatId = ADMIN_CHAT) {
  return post({ message: { message_id: 10, chat: { id: chatId, first_name: 'Admin' }, from: { id: chatId }, text } });
}
function press(data: string, chatId = ADMIN_CHAT) {
  return post({ callback_query: { id: 'cb', data, from: { id: chatId }, message: { message_id: 10, chat: { id: chatId } } } });
}

/** Ikki guruh: A da 2 o'quvchi (biri ota-onali), B da 1 o'quvchi; hammasi Telegram ulagan */
async function fixtures() {
  const course = await createCourse();
  const groupA = await createGroup({ courseId: course.id, name: 'A guruh' });
  const groupB = await createGroup({ courseId: course.id, name: 'B guruh' });
  const student = async (groupId: string, name: string, phone: string) =>
    prisma.student.create({ data: { firstName: name, lastName: 'T', phone, courseId: course.id, groupId, contractPrice: 1, startDate: new Date('2026-06-01') } });
  const a1 = await student(groupA.id, 'Ali', '+998900000001');
  const a2 = await student(groupA.id, 'Vali', '+998900000002');
  const b1 = await student(groupB.id, 'Hasan', '+998900000003');
  const parent = await prisma.parent.create({ data: { firstName: 'Ota', lastName: 'Ona', phone: '+998900000004', students: { create: [{ studentId: a1.id }] } } });
  let chat = 500;
  const link = (owner: { studentId?: string; parentId?: string; userId?: string }, code: string) =>
    prisma.telegramLink.create({ data: { ...owner, linkCode: code, chatId: String((chat += 1)), verifiedAt: new Date() } });
  await link({ studentId: a1.id }, 'c-a1');
  await link({ studentId: a2.id }, 'c-a2');
  await link({ studentId: b1.id }, 'c-b1');
  await link({ parentId: parent.id }, 'c-p1');
  // Ulamagan o'quvchi — hisobga kirmaydi
  await student(groupB.id, 'Ulanmagan', '+998900000005');
  return { course, groupA, groupB, a1, a2, b1, parent };
}

describe.skipIf(!hasTestDatabase)('Ommaviy xabar (broadcast)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('API: oldindan ko‘rish auditoriyani to‘g‘ri sanaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { groupA, course } = await fixtures();

    const students = await request(app).post('/api/telegram/broadcasts/preview').set(bearer(token)).send({ audience: 'STUDENTS', message: 'Salom' });
    expect(students.status).toBe(200);
    expect(students.body.data.recipients).toBe(3);

    const parents = await request(app).post('/api/telegram/broadcasts/preview').set(bearer(token)).send({ audience: 'PARENTS', message: 'Salom' });
    expect(parents.body.data.recipients).toBe(1);

    const group = await request(app).post('/api/telegram/broadcasts/preview').set(bearer(token)).send({ audience: 'GROUP', targetId: groupA.id, message: 'Salom' });
    expect(group.body.data).toMatchObject({ recipients: 2, label: 'Guruh: A guruh' });

    const groupWithParents = await request(app)
      .post('/api/telegram/broadcasts/preview')
      .set(bearer(token))
      .send({ audience: 'GROUP', targetId: groupA.id, includeParents: true, message: 'Salom' });
    expect(groupWithParents.body.data.recipients).toBe(3);

    const courseAll = await request(app).post('/api/telegram/broadcasts/preview').set(bearer(token)).send({ audience: 'COURSE', targetId: course.id, message: 'Salom' });
    expect(courseAll.body.data.recipients).toBe(3);

    // Guruh tanlanmasa — validatsiya xatosi
    const missing = await request(app).post('/api/telegram/broadcasts/preview').set(bearer(token)).send({ audience: 'GROUP', message: 'Salom' });
    expect(missing.status).toBe(422);
  });

  it('API: yuborish navbatga tushadi, statistika navbatdan hisoblanadi, audit yoziladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    await fixtures();
    vi.spyOn(telegram.telegramService, 'sendMessage').mockResolvedValue({ ok: true, retryable: false });

    const sent = await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'STUDENTS', message: 'Ertaga <dars> yo‘q' });
    expect(sent.status).toBe(200);
    expect(sent.body.data).toMatchObject({ recipients: 3, sent: 0, pending: 3 });

    const deliveries = await prisma.notificationDelivery.findMany({ where: { broadcastId: sent.body.data.id } });
    expect(deliveries).toHaveLength(3);
    // HTML rejimi — foydalanuvchi yozgan `<` xabarni buzmasin
    expect(deliveries[0]!.body).toBe('Ertaga &lt;dars&gt; yo‘q');

    await notificationDeliveryService.processQueue();
    const list = await request(app).get('/api/telegram/broadcasts').set(bearer(token));
    expect(list.body.data[0]).toMatchObject({ recipients: 3, sent: 3, pending: 0, failed: 0 });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'broadcast.sent' } });
    expect(audit?.metadata).toMatchObject({ audience: 'STUDENTS', recipients: 3 });
  });

  it('ruxsatsiz xodim yubora olmaydi; bo‘sh auditoriya rad etiladi', async () => {
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin-bc@local.uz' });

    const denied = await request(app).post('/api/telegram/broadcasts').set(bearer(teacher)).send({ audience: 'STUDENTS', message: 'Salom' });
    expect(denied.status).toBe(403);

    // Hech kim Telegram ulamagan — yuborishga hojat yo'q
    const empty = await request(app).post('/api/telegram/broadcasts').set(bearer(admin)).send({ audience: 'STUDENTS', message: 'Salom' });
    expect(empty.status).toBe(422);
    expect(await prisma.telegramBroadcast.count()).toBe(0);
  });

  it('bot oqimi: auditoriya → matn → oldindan ko‘rish → yuborish', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const { groupA } = await fixtures();
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    await message(`/start ${link.linkCode}`);
    const bot = captureBot();

    await message('/start').expect(200);
    expect(bot.lastData()).toContain('bc_start');

    await message('/xabar').expect(200);
    expect(bot.last().text).toContain('Kimga yuboramiz');

    await press('bc_grp').expect(200);
    expect(bot.lastData()).toContain(`bc_aud:GROUP:${groupA.id}`);

    await press(`bc_aud:GROUP:${groupA.id}`).expect(200);
    expect(bot.last().text).toContain('Ota-onalarga ham');
    await press('bc_par:yes').expect(200);
    expect(bot.last().text).toContain('matnini yozing');

    await message('Ertaga dars soat 10:00 da').expect(200);
    expect(bot.last().text).toContain('Oldindan ko‘rish');
    expect(bot.last().text).toContain('<b>3</b> ta chat');
    expect(bot.lastData()).toContain('bc_send');
    // Hali yuborilmagan
    expect(await prisma.telegramBroadcast.count()).toBe(0);

    await press('bc_send').expect(200);
    expect(bot.last().text).toContain('navbatga qo‘yildi');
    const broadcast = await prisma.telegramBroadcast.findFirstOrThrow();
    expect(broadcast).toMatchObject({ audience: 'GROUP', targetId: groupA.id, recipients: 3, createdById: user.id });
    expect(await prisma.notificationDelivery.count({ where: { broadcastId: broadcast.id } })).toBe(3);
    expect(await telegramSessionService.get(String(ADMIN_CHAT))).toBeNull();

    await press('bc_list').expect(200);
    expect(bot.last().text).toContain('A guruh');
    // TZ 3.1 GAP-15: statistika qatori — mo'ljal (targeted) aniq son bilan
    expect(bot.last().text).toContain('🎯 3 mo‘ljal');
  });

  it('bot oqimi: bekor qilinsa hech nima yuborilmaydi; ruxsatsiz xodimga tugma yo‘q', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    await fixtures();
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    await message(`/start ${link.linkCode}`);
    const bot = captureBot();

    await press('bc_aud:STUDENTS').expect(200);
    await message('Sinov xabari').expect(200);
    expect(bot.lastData()).toContain('bc_send');
    await press('menu').expect(200);

    expect(await telegramSessionService.get(String(ADMIN_CHAT))).toBeNull();
    expect(await prisma.telegramBroadcast.count()).toBe(0);

    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'ustoz-bc@local.uz' });
    const teacherLink = await telegramLinkService.ensureLink({ userId: teacher.id });
    await message(`/start ${teacherLink.linkCode}`, 3_002);
    await message('/start', 3_002).expect(200);
    expect(bot.lastData()).not.toContain('bc_start');
    await message('/xabar', 3_002).expect(200);
    expect(bot.last().text).not.toContain('Kimga yuboramiz');
  });
});
