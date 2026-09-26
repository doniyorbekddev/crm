import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { BROADCASTS_PER_HOUR } from '../src/services/broadcast.service.js';
import { notificationDeliveryService } from '../src/services/notificationDelivery.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard, TelegramMedia } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { isSafeButtonUrl } from '../src/validators/broadcast.validator.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/** TZ 3.1 GAP-15 / §38 — Broadcast 2.0: tugma (URL), web media, oldindan ko'rish, tasdiq, navbat, statistika */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
let chat = 9_000;

async function audience(count: number) {
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, name: 'Media guruh' });
  const students = [];
  for (let index = 0; index < count; index += 1) {
    const student = await prisma.student.create({
      data: { firstName: `S${index}`, lastName: 'B', phone: `+99891${String(5_000_000 + index).slice(-7)}`, courseId: course.id, groupId: group.id, contractPrice: 1, startDate: new Date('2026-06-01') },
    });
    await prisma.telegramLink.create({ data: { studentId: student.id, linkCode: `b2-${index}-${Date.now()}`, chatId: String((chat += 1)), verifiedAt: new Date() } });
    students.push(student);
  }
  return { group, students };
}

function mockTelegram() {
  const calls: Array<{ chatId: string; text: string | undefined; keyboard: InlineKeyboard | undefined; media: TelegramMedia | null }> = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (chatId: string, text: string, keyboard?: InlineKeyboard) => {
    calls.push({ chatId, text, keyboard, media: null });
    return { ok: true, retryable: false, messageId: calls.length };
  });
  vi.spyOn(telegram.telegramService, 'sendMedia').mockImplementation(async (chatId: string, media: TelegramMedia, caption?: string, keyboard?: InlineKeyboard) => {
    calls.push({ chatId, text: caption, keyboard, media });
    return { ok: true, retryable: false, ...('buffer' in media ? { fileId: 'TG_FILE_ID_1' } : {}) };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockResolvedValue({ ok: true, retryable: false });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  return calls;
}

const upload = (token: string, body: Buffer, name = 'afisha.png') =>
  request(app).post('/api/telegram/broadcasts/media').set(bearer(token)).set('Content-Type', 'application/octet-stream').set('X-File-Name', name).send(body);

describe('tugma havolasi xavfsizligi', () => {
  it('faqat https va to‘g‘ri host', () => {
    expect(isSafeButtonUrl('https://example.uz/kurs?id=1')).toBe(true);
    for (const bad of ['http://example.uz', 'javascript:alert(1)', 'https://localhost', 'tg://resolve?domain=x', 'https://user:pass@example.uz', 'example.uz', 'ftp://example.uz']) {
      expect(isSafeButtonUrl(bad), bad).toBe(false);
    }
  });
});

describe.skipIf(!hasTestDatabase)('Broadcast 2.0 (GAP-15)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('§38: auditoriya → rasm + tugma → oldindan ko‘rish → tasdiq → navbat → yuborish → statistika', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const { group } = await audience(3);
    const calls = mockTelegram();

    const media = await upload(token, PNG).expect(201);
    expect(media.body.data).toMatchObject({ kind: 'photo', fileName: 'afisha.png' });
    const body = {
      audience: 'GROUP',
      targetId: group.id,
      message: 'Ochiq dars <shanba> kuni',
      buttons: [{ text: 'Ro‘yxatdan o‘tish', url: 'https://example.uz/ochiq-dars' }],
      mediaToken: media.body.data.token,
    };
    // Oldindan ko'rish — hech narsa yozilmaydi
    const preview = await request(app).post('/api/telegram/broadcasts/preview').set(bearer(token)).send(body).expect(200);
    expect(preview.body.data).toMatchObject({ recipients: 3, label: 'Guruh: Media guruh' });
    expect(await prisma.telegramBroadcast.count()).toBe(0);

    const sent = await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send(body).expect(200);
    const id = sent.body.data.id as string;
    expect(sent.body.data).toMatchObject({ recipients: 3, pending: 3, sent: 0, mediaKind: 'photo', buttons: body.buttons });
    const deliveries = await prisma.notificationDelivery.findMany({ where: { broadcastId: id } });
    expect(deliveries.every((row) => row.mediaKind === 'photo' && row.mediaFileId === null)).toBe(true);
    expect(deliveries[0]!.buttons).toEqual(body.buttons);

    const result = await notificationDeliveryService.processQueue(new Date());
    expect(result).toMatchObject({ sent: 3, failed: 0 });
    // Birinchisi — fayl yuklanadi, keyingilari — olingan file_id bilan (qayta yuklanmaydi)
    expect(calls).toHaveLength(3);
    expect('buffer' in calls[0]!.media!).toBe(true);
    expect(calls.slice(1).every((call) => call.media && 'fileId' in call.media && call.media.fileId === 'TG_FILE_ID_1')).toBe(true);
    expect(calls.every((call) => call.keyboard?.[0]?.[0]?.url === 'https://example.uz/ochiq-dars')).toBe(true);
    expect(calls[0]!.text).toContain('Ochiq dars &lt;shanba&gt; kuni');
    expect((await prisma.telegramBroadcast.findUniqueOrThrow({ where: { id } })).mediaFileId).toBe('TG_FILE_ID_1');

    const stats = (await request(app).get(`/api/telegram/broadcasts/${id}`).set(bearer(token)).expect(200)).body.data;
    expect(stats).toMatchObject({ recipients: 3, sent: 3, delivered: 3, failed: 0, skipped: 0, pending: 0 });
  });

  it('statistika: yetmadi (bloklagan) va o‘tkazib yuborildi (bog‘lanish uzilgan) alohida', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const { group, students } = await audience(3);
    mockTelegram();
    const sent = await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'GROUP', targetId: group.id, message: 'Salom hammaga' }).expect(200);
    await prisma.telegramLink.updateMany({ where: { studentId: students[0]!.id }, data: { isActive: false } });
    const blockedChat = (await prisma.telegramLink.findFirstOrThrow({ where: { studentId: students[1]!.id } })).chatId;
    vi.mocked(telegram.telegramService.sendMessage).mockImplementation(async (chatId: string) =>
      chatId === blockedChat ? { ok: false, retryable: false, error: 'Forbidden: bot was blocked by the user' } : { ok: true, retryable: false },
    );
    await notificationDeliveryService.processQueue(new Date());
    const stats = (await request(app).get(`/api/telegram/broadcasts/${sent.body.data.id}`).set(bearer(token)).expect(200)).body.data;
    expect(stats).toMatchObject({ recipients: 3, sent: 1, delivered: 1, failed: 2, skipped: 1, pending: 0 });
  });

  it('retry_after: 429 — urinish sanalmaydi, qolganlar ham kutadi, keyin yuboriladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const { group } = await audience(3);
    mockTelegram();
    vi.mocked(telegram.telegramService.sendMessage).mockResolvedValueOnce({ ok: false, retryable: true, error: 'Too Many Requests: retry after 30', retryAfter: 30 });
    const sent = await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'GROUP', targetId: group.id, message: 'Navbat sinovi' }).expect(200);

    const started = Date.now();
    expect(await notificationDeliveryService.processQueue(new Date())).toMatchObject({ sent: 0, failed: 0 });
    const rows = await prisma.notificationDelivery.findMany({ where: { broadcastId: sent.body.data.id } });
    expect(rows.every((row) => row.status === 'PENDING' && row.attempts === 0)).toBe(true);
    expect(rows.every((row) => row.nextAttemptAt.getTime() >= started + 29_000)).toBe(true);

    expect(await notificationDeliveryService.processQueue(new Date(Date.now() + 31_000))).toMatchObject({ sent: 3 });
  });

  it('katta auditoriya: bitta chaqiruvda bir nechta partiya (25 dan ko‘p)', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const { group } = await audience(60);
    const calls = mockTelegram();
    await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'GROUP', targetId: group.id, message: 'Katta auditoriya' }).expect(200);
    expect(await notificationDeliveryService.processQueue(new Date())).toMatchObject({ sent: 60 });
    expect(new Set(calls.map((call) => call.chatId)).size).toBe(60);
  }, 30_000);

  it('validatsiya: http/javascript havola, 4 ta tugma, noma’lum maydon, rasm bo‘lmagan fayl — 422; boshqa xodim tokeni — 403', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: other } = await createUserWithToken(app, { role: 'ADMIN' });
    const { group } = await audience(1);
    const base = { audience: 'GROUP', targetId: group.id, message: 'Salom hammaga' };
    const send = (body: object, as = token) => request(app).post('/api/telegram/broadcasts').set(bearer(as)).send({ ...base, ...body });

    for (const url of ['http://example.uz', 'javascript:alert(1)']) expect((await send({ buttons: [{ text: 'X', url }] })).status).toBe(422);
    const four = Array.from({ length: 4 }, (_, index) => ({ text: `T${index}`, url: 'https://example.uz' }));
    expect((await send({ buttons: four })).status).toBe(422);
    expect((await send({ extra: 1 })).status).toBe(422);
    expect((await upload(token, Buffer.from('oddiy matn fayli'), 'x.txt')).status).toBe(422);
    expect((await send({ mediaToken: 'aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccc' })).status).toBe(422);

    const media = await upload(token, PNG).expect(201);
    expect((await send({ mediaToken: media.body.data.token }, other)).status).toBe(403);
    expect(await prisma.telegramBroadcast.count()).toBe(0);
  });

  it('ruxsat va limit: broadcast.send yo‘q — 403 (media ham); soatiga limit — 429', async () => {
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await upload(teacher, PNG)).status).toBe(403);
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const { group } = await audience(1);
    for (let index = 0; index < BROADCASTS_PER_HOUR; index += 1) {
      await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'GROUP', targetId: group.id, message: `Xabar ${index}` }).expect(200);
    }
    expect((await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'GROUP', targetId: group.id, message: 'Ortiqcha' })).status).toBe(429);
  });

  it('filial: boshqa filial admini tarix va statistikani ko‘rmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { group } = await audience(1);
    const sent = await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'GROUP', targetId: group.id, message: 'Asosiy filial' }).expect(200);
    const branch = await prisma.branch.create({ data: { key: 'YUNUSOBOD', name: 'Yunusobod' } });
    const { token: otherAdmin } = await createUserWithToken(app, { role: 'ADMIN', branchId: branch.id });
    expect((await request(app).get('/api/telegram/broadcasts').set(bearer(otherAdmin)).expect(200)).body.data).toEqual([]);
    expect((await request(app).get(`/api/telegram/broadcasts/${sent.body.data.id}`).set(bearer(otherAdmin))).status).toBe(404);
  });

  it('bot: “🔗 Tugma qo‘shish” — noto‘g‘ri havola rad, to‘g‘risi oldindan ko‘rishda va navbatda', async () => {
    const { user } = await createUserWithToken(app, { role: 'OWNER' });
    const { group } = await audience(2);
    const calls = mockTelegram();
    const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
    const id = 9_999;
    const message = (text: string) => post({ message: { message_id: 10, chat: { id }, from: { id }, text } });
    const press = (data: string) => post({ callback_query: { id: 'cb', data, from: { id }, message: { message_id: 10, chat: { id } } } });
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    await message(`/start ${link.linkCode}`);

    await press(`bc_aud:GROUP:${group.id}`);
    await press('bc_par:no');
    await message('Imtihon jadvali e’lon qilindi');
    expect(calls.at(-1)!.keyboard!.flat().map((button) => button.data)).toContain('bc_btn');
    await press('bc_btn');
    await message('Jadval | http://example.uz');
    expect(calls.at(-1)!.text).toContain('https://');
    await message('Jadval | https://example.uz/jadval');
    expect(calls.at(-1)!.text).toContain('[🔗 Jadval] → https://example.uz/jadval');
    await press('bc_send');
    const broadcast = await prisma.telegramBroadcast.findFirstOrThrow();
    expect(broadcast.buttons).toEqual([{ text: 'Jadval', url: 'https://example.uz/jadval' }]);
    expect((await prisma.notificationDelivery.findMany({ where: { broadcastId: broadcast.id } })).every((row) => Array.isArray(row.buttons))).toBe(true);
  });
});
