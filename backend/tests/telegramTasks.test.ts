import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notificationDeliveryService } from '../src/services/notificationDelivery.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

/** CRM 4.0 · 2-faza: vazifalar botda — xabar ostidagi tugmalar, ro'yxat, "Bajarildi", "Ertaga", doira */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';

interface Sent {
  text: string;
  keyboard: InlineKeyboard | undefined;
}

function captureBot() {
  const shown: Sent[] = [];
  const push = (text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
  };
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
    push(text, keyboard);
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    push(text, keyboard);
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
function message(text: string, chatId: number) {
  return post({ message: { message_id: 10, chat: { id: chatId, first_name: 'Xodim' }, from: { id: chatId }, text } });
}
function press(data: string, chatId: number) {
  return post({ callback_query: { id: 'cb', data, from: { id: chatId }, message: { message_id: 10, chat: { id: chatId } } } });
}

async function linkedStaff(role: string, chatId: number) {
  const { user, token } = await createUserWithToken(app, { role });
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(`/start ${link.linkCode}`, chatId);
  return { user, token };
}

describe.skipIf(!hasTestDatabase)('Telegram — vazifalar', () => {
  const TEACHER_CHAT = 2_001;
  const OTHER_CHAT = 2_002;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('vazifa berilganda xabar tugmalar bilan keladi; "Bajarildi" bosilsa vazifa yopiladi va rahbar xabar oladi', async () => {
    const bot = captureBot();
    const { user: teacher } = await linkedStaff('TEACHER', TEACHER_CHAT);
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });

    const created = await request(app).post('/api/tasks').set(bearer(admin)).send({ title: 'Ota-onaga <qo‘ng‘iroq>', assigneeId: teacher.id, priority: 'URGENT' });
    const id = created.body.data.id as string;

    // Navbatdagi yozuvda tugmalar saqlangan
    const delivery = await prisma.notificationDelivery.findFirstOrThrow({ where: { title: 'Sizga vazifa berildi' }, select: { buttons: true } });
    expect(delivery.buttons).toEqual([
      { text: '✅ Bajarildi', data: `tk_dn:${id}` },
      { text: '📋 Ochish', data: `tk_op:${id}` },
    ]);
    // Yuborilganda ikkala tugma bitta qatorda
    await notificationDeliveryService.processQueue(new Date());
    expect(bot.last().text).toContain('Sizga vazifa berildi');
    expect(bot.last().keyboard).toEqual([
      [
        { text: '✅ Bajarildi', data: `tk_dn:${id}` },
        { text: '📋 Ochish', data: `tk_op:${id}` },
      ],
    ]);

    await press(`tk_op:${id}`, TEACHER_CHAT);
    // Sarlavhadagi maxsus belgilar HTML sifatida talqin qilinmaydi
    expect(bot.last().text).toContain('Ota-onaga &lt;qo‘ng‘iroq&gt;');
    // Ijrochi yopa oladi, lekin muddatni sura olmaydi (tahrirlash huquqi yo'q)
    expect(bot.lastData()).toContain(`tk_dn:${id}`);
    expect(bot.lastData()).not.toContain(`tk_tm:${id}`);

    await press(`tk_dn:${id}`, TEACHER_CHAT);
    expect(bot.last().text).toContain('Bajarildi deb belgilandi');
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).status).toBe('DONE');
    expect(await prisma.notification.count({ where: { userId: adminUser.id, title: 'Vazifa bajarildi' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'task.status_changed', entityId: id, userId: teacher.id } })).toBe(1);

    // Ikkinchi marta bosish — xato emas, qayta yozilmaydi
    await press(`tk_dn:${id}`, TEACHER_CHAT);
    expect(bot.last().text).toContain('allaqachon yopilgan');
    expect(await prisma.auditLog.count({ where: { action: 'task.status_changed', entityId: id } })).toBe(1);
  });

  it('begona xodim tugma ma’lumotini qo‘lda yuborsa ham vazifani ko‘rmaydi va yopa olmaydi', async () => {
    const bot = captureBot();
    const { user: teacher } = await linkedStaff('TEACHER', TEACHER_CHAT);
    await linkedStaff('TEACHER', OTHER_CHAT);
    const task = await prisma.task.create({ data: { title: 'Maxfiy ish', assigneeId: teacher.id } });

    for (const data of [`tk_op:${task.id}`, `tk_dn:${task.id}`, `tk_tm:${task.id}`]) {
      await press(data, OTHER_CHAT);
      expect(bot.last().text, data).toContain('Vazifa topilmadi');
      expect(bot.last().text).not.toContain('Maxfiy ish');
    }
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('OPEN');
  });

  it('menyuda "Vazifalarim": ro‘yxat sahifalanadi; muallif muddatni ertaga sura oladi', async () => {
    const bot = captureBot();
    const { user: admin } = await linkedStaff('ADMIN', TEACHER_CHAT);
    await message('/menu', TEACHER_CHAT);
    expect(bot.lastData()).toContain('tk_ls');

    await press('tk_ls', TEACHER_CHAT);
    expect(bot.last().text).toContain('Ochiq vazifa yo‘q');

    await prisma.task.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({ title: `Ish ${index + 1}`, assigneeId: admin.id, createdById: admin.id, dueAt: new Date(Date.now() - (10 - index) * 3_600_000) })),
    });
    await prisma.task.create({ data: { title: 'Yopilgan', assigneeId: admin.id, status: 'DONE' } });

    await press('tk_ls', TEACHER_CHAT);
    expect(bot.last().text).toContain('8 ta ochiq');
    expect(bot.last().text).toContain('Ish 1');
    expect(bot.last().text).not.toContain('Ish 7');
    expect(bot.last().text).not.toContain('Yopilgan');
    expect(bot.lastData()).toContain('tk_ls:2');
    await press('tk_ls:2', TEACHER_CHAT);
    expect(bot.last().text).toContain('Ish 7');
    expect(bot.lastData()).toContain('tk_ls:1');

    const first = await prisma.task.findFirstOrThrow({ where: { title: 'Ish 1' } });
    await press(`tk_op:${first.id}`, TEACHER_CHAT);
    expect(bot.last().text).toContain('Muddati o‘tgan');
    expect(bot.lastData()).toEqual(expect.arrayContaining([`tk_dn:${first.id}`, `tk_tm:${first.id}`]));

    await press(`tk_tm:${first.id}`, TEACHER_CHAT);
    expect(bot.last().text).toContain('24 soatga surildi');
    const moved = await prisma.task.findUniqueOrThrow({ where: { id: first.id } });
    // Muddati o'tgan edi — hozirdan 24 soat
    expect(Math.abs(moved.dueAt!.getTime() - (Date.now() + 24 * 3_600_000))).toBeLessThan(60_000);
  });

  it('o‘quvchi (kabinet) chatida vazifa tugmalari ishlamaydi', async () => {
    const bot = captureBot();
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const task = await prisma.task.create({ data: { title: 'Xodim ishi', assigneeId: teacher.id } });
    const course = await createCourse();
    const student = await prisma.student.create({ data: { firstName: 'Ali', lastName: 'Test', phone: '+998901112233', courseId: course.id, contractPrice: 1_000_000, startDate: new Date() } });
    const link = await telegramLinkService.ensureLink({ studentId: student.id });
    await message(`/start ${link.linkCode}`, OTHER_CHAT);

    await press(`tk_dn:${task.id}`, OTHER_CHAT);
    expect(bot.last().text).not.toContain('Xodim ishi');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('OPEN');
    await message('/menu', OTHER_CHAT);
    expect(bot.lastData()).not.toContain('tk_ls');
  });
});
