import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY } from '../src/config/notificationTypes.js';
import { prisma } from '../src/config/database.js';
import { NotificationType } from '../src/generated/prisma/enums.js';
import { notificationService } from '../src/services/notification.service.js';
import { permissionService } from '../src/services/permission.service.js';
import { notifyStudentAudience } from '../src/services/studentNotify.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/** TZ 3.1 GAP-13 — Telegram sozlamalari: toifalar (davomat, to'lov, vazifa, imtihon, yutuq, marketing, tizim) */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
let phone = 0;

function captureBot() {
  const shown: Array<{ text: string; keyboard: InlineKeyboard | undefined }> = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  const buttons = () => (shown.at(-1)!.keyboard ?? []).flat();
  return { last: () => shown.at(-1)!, data: () => buttons().map((button) => button.data), button: (data: string) => buttons().find((button) => button.data === data)?.text };
}

const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (chat: number, text: string) => post({ message: { message_id: 10, chat: { id: chat, first_name: 'S' }, from: { id: chat }, text } });
const press = (chat: number, data: string) => post({ callback_query: { id: 'cb', data, from: { id: chat }, message: { message_id: 10, chat: { id: chat } } } });

async function student(withAccount: boolean) {
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id });
  phone += 1;
  const row = await prisma.student.create({
    data: { firstName: 'Sozlama', lastName: 'Test', phone: `+99887${String(3_000_000 + phone).slice(-7)}`, courseId: course.id, groupId: group.id, contractPrice: 1_000_000, startDate: new Date('2026-06-01') },
  });
  if (!withAccount) return { student: row, token: null, userId: null };
  const { user, token } = await createUserWithToken(app, { role: 'STUDENT' });
  await prisma.student.update({ where: { id: row.id }, data: { userId: user.id } });
  return { student: row, token, userId: user.id };
}

async function linkFamily(target: { studentId?: string; parentId?: string }, chat: number) {
  const link = await telegramLinkService.ensureLink(target);
  await message(chat, `/start ${link.linkCode}`);
}

const familyEvent = (studentId: string, type: NotificationType, key: string) =>
  prisma.$transaction((tx) =>
    notifyStudentAudience(tx, { studentId, audience: 'STUDENT', type, title: 'Sinov', message: 'Matn', entityType: 'test', entityId: key, dedupeKey: `settings-test:${key}` }),
  );

const deliveries = (studentId: string) => prisma.notificationDelivery.count({ where: { telegramLink: { studentId } } });

describe('bildirishnoma toifalari', () => {
  it('har tur aynan bitta toifada, 7 toifa hammasi ishlatilgan', () => {
    for (const type of Object.values(NotificationType)) expect(NOTIFICATION_CATEGORIES).toContain(NOTIFICATION_CATEGORY[type]);
    expect(new Set(Object.values(NOTIFICATION_CATEGORY))).toEqual(new Set(NOTIFICATION_CATEGORIES));
  });
});

describe.skipIf(!hasTestDatabase)('Telegram: sozlamalar toifalari (GAP-13)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    permissionService.invalidate();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('kabinetli o‘quvchi: toifani o‘chiradi — shu toifa Telegramga kelmaydi, ilova ichida keladi; boshqa toifa keladi', async () => {
    const { student: row, userId } = await student(true);
    await linkFamily({ studentId: row.id }, 81_001);
    const bot = captureBot();

    await message(81_001, '/sozlamalar').expect(200);
    expect(bot.data()).toEqual(expect.arrayContaining(['ws_sc:ATTENDANCE', 'ws_sc:PAYMENT', 'ws_sc:HOMEWORK', 'ws_sc:EXAM', 'ws_sc:ACHIEVEMENT', 'ws_sc:SYSTEM']));
    expect(bot.data()).not.toContain('ws_sc:MARKETING');
    expect(bot.button('ws_sc:HOMEWORK')).toContain('✅');

    await press(81_001, 'ws_sc:HOMEWORK').expect(200);
    expect(bot.last().text).toContain('Vazifa: o‘chirildi');
    expect(bot.button('ws_sc:HOMEWORK')).toContain('⬜️');
    const stored = await prisma.notificationSetting.findMany({ where: { userId: userId! } });
    expect(stored.map((setting) => `${setting.type}:${setting.telegram}:${setting.inApp}`).sort()).toEqual([
      'HOMEWORK_CREATED:false:true',
      'HOMEWORK_DEADLINE:false:true',
      'HOMEWORK_GRADED:false:true',
      'HOMEWORK_RETURNED:false:true',
    ]);

    await familyEvent(row.id, 'HOMEWORK_CREATED', 'hw1');
    expect(await deliveries(row.id)).toBe(0);
    expect(await prisma.notification.count({ where: { userId: userId!, type: 'HOMEWORK_CREATED' } })).toBe(1);
    await familyEvent(row.id, 'EXAM_RESULT', 'ex1');
    expect(await deliveries(row.id)).toBe(1);

    // Qayta bosish — yoqiladi
    await press(81_001, 'ws_sc:HOMEWORK').expect(200);
    expect(bot.last().text).toContain('Vazifa: yoqildi');
    await familyEvent(row.id, 'HOMEWORK_CREATED', 'hw2');
    expect(await deliveries(row.id)).toBe(2);
  });

  it('web va bot — bitta sozlama: kabinetda o‘chirilgan tur botda ◐, botdagi o‘zgarish API’da ko‘rinadi', async () => {
    const { student: row, token } = await student(true);
    await linkFamily({ studentId: row.id }, 81_002);
    await request(app).put('/api/notifications/settings').set(bearer(token!)).send({ items: [{ type: 'EXAM_RESULT', inApp: true, telegram: false }] }).expect(200);
    const bot = captureBot();
    await press(81_002, 'ws_set').expect(200);
    expect(bot.button('ws_sc:EXAM')).toContain('◐');
    // Qisman → bosilsa hammasi yoqiladi
    await press(81_002, 'ws_sc:EXAM').expect(200);
    const settings = (await request(app).get('/api/notifications/settings').set(bearer(token!)).expect(200)).body.data as Array<{ type: string; telegram: boolean }>;
    expect(settings.filter((item) => ['EXAM_RESULT', 'EXAM_SCHEDULED', 'LOW_SCORE'].includes(item.type)).every((item) => item.telegram)).toBe(true);
  });

  it('kabinetli ota-ona: davomat toifasi o‘chsa, “darsga kelmadi” Telegramga kelmaydi', async () => {
    const { student: row } = await student(false);
    const { user } = await createUserWithToken(app, { role: 'PARENT' });
    const parent = await prisma.parent.create({ data: { firstName: 'Ona', lastName: 'Test', phone: '+998901112233', userId: user.id } });
    await prisma.studentParent.create({ data: { studentId: row.id, parentId: parent.id } });
    await linkFamily({ parentId: parent.id }, 81_003);
    const bot = captureBot();
    await press(81_003, 'ws_set').expect(200);
    await press(81_003, 'ws_sc:ATTENDANCE').expect(200);
    const queued = await prisma.$transaction((tx) => notificationService.notifyExternalInTransaction(tx, { type: 'CHILD_ABSENT', title: 'Kelmadi', message: 'x', parentId: parent.id, dedupeKey: 'absence-test' }));
    expect(queued).toBe(0);
    // Tizim turi o'chirilmaydi
    const system = await prisma.$transaction((tx) => notificationService.notifyExternalInTransaction(tx, { type: 'SYSTEM', title: 'Tizim', message: 'x', parentId: parent.id, dedupeKey: 'system-test' }));
    expect(system).toBe(1);
    expect(bot.last().text).toContain('Davomat: o‘chirildi');
  });

  it('kabinetsiz o‘quvchi: toifa tugmasi yo‘q, izoh bor; soxta callback hech narsa yozmaydi, xabar keladi', async () => {
    const { student: row } = await student(false);
    await linkFamily({ studentId: row.id }, 81_004);
    const bot = captureBot();
    await press(81_004, 'ws_set').expect(200);
    expect(bot.data().some((data) => data?.startsWith('ws_sc'))).toBe(false);
    expect(bot.last().text).toContain('kabinet hisobi bilan ishlaydi');
    expect(bot.data()).toContain('ws_mute');
    await press(81_004, 'ws_sc:HOMEWORK').expect(200);
    expect(await prisma.notificationSetting.count()).toBe(0);
    await familyEvent(row.id, 'HOMEWORK_CREATED', 'hw3');
    expect(await deliveries(row.id)).toBe(1);
  });

  it('xodim: faqat ruxsatidagi toifa va turlar; toifa bosilsa — o‘sha turlar (faqat Telegram); soxta toifa/tur — o‘zgarishsiz', async () => {
    const { user } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    await message(81_005, `/start ${link.linkCode}`);
    const bot = captureBot();

    await press(81_005, 'ws_set').expect(200);
    expect(bot.data()).toEqual(expect.arrayContaining(['ws_sc:MARKETING', 'ws_st:NEW_LEAD', 'ws_st:TRIAL_LESSON_REMINDER']));
    expect(bot.data()).not.toContain('ws_sc:ATTENDANCE');
    expect(bot.data()).not.toContain('ws_st:EXPENSE_APPROVAL');

    await press(81_005, 'ws_sc:MARKETING').expect(200);
    const rows = await prisma.notificationSetting.findMany({ where: { userId: user.id } });
    expect(rows.map((row) => row.type).sort()).toEqual(['FOLLOW_UP_OVERDUE', 'FOLLOW_UP_REMINDER', 'LEAD_ASSIGNED', 'NEW_LEAD', 'NEW_STUDENT', 'TRIAL_LESSON_REMINDER']);
    expect(rows.every((row) => !row.telegram && row.inApp)).toBe(true);
    expect(bot.button('ws_st:NEW_LEAD')).toContain('⬜️');

    for (const data of ['ws_sc:ATTENDANCE', 'ws_sc:NOMALUM', 'ws_st:EXPENSE_APPROVAL', 'ws_st:SYSTEM']) await press(81_005, data).expect(200);
    expect(await prisma.notificationSetting.count({ where: { userId: user.id } })).toBe(6);
  });
});
