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
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

/**
 * PHASE 11 — Telegram 2.0 (TZ 3.0 §43–44): onlayn imtihon botda (web bilan bitta servis),
 * qo'ng'iroq va follow-up yozish, broadcast media, sozlamalar (ovozsiz rejim, tur bo'yicha),
 * qidiruv, o'qituvchi KPI, hisobotlar, marketing, topshiriqni botdan tekshirish va vazifaga fayl.
 */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
let phone = 0;

interface Sent {
  text: string;
  keyboard: InlineKeyboard | undefined;
}

function captureBot() {
  const shown: Sent[] = [];
  const media: Array<{ chatId: string; media: telegram.TelegramMedia; caption?: string }> = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  vi.spyOn(telegram.telegramService, 'sendMedia').mockImplementation(async (chatId: string, item: telegram.TelegramMedia, caption?: string) => {
    media.push({ chatId, media: item, ...(caption ? { caption } : {}) });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'downloadFile').mockResolvedValue({ buffer: PNG });
  return {
    shown,
    media,
    last: () => shown.at(-1)!,
    lastData: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data),
    allText: () => shown.map((row) => row.text).join('\n'),
  };
}

function post(body: object) {
  return request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
}
function message(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return post({ message: { message_id: 10, chat: { id: chatId, first_name: 'Test' }, from: { id: chatId }, text, ...extra } });
}
function photo(chatId: number, caption: string) {
  return post({ message: { message_id: 11, chat: { id: chatId }, from: { id: chatId }, caption, photo: [{ file_id: 'small', file_size: 10 }, { file_id: 'PHOTO_FILE_ID', file_size: 100 }] } });
}
function press(chatId: number, data: string) {
  return post({ callback_query: { id: 'cb', data, from: { id: chatId }, message: { message_id: 10, chat: { id: chatId } } } });
}

async function createStudent(courseId: string, groupId: string, firstName: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Test',
      phone: `+99893${String(2_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function linkStaff(role: string, chatId: number) {
  const { user, token } = await createUserWithToken(app, { role });
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(chatId, `/start ${link.linkCode}`);
  return { user, token };
}

async function linkStudent(studentId: string, chatId: number) {
  const link = await telegramLinkService.ensureLink({ studentId });
  await message(chatId, `/start ${link.linkCode}`);
}

describe.skipIf(!hasTestDatabase)('Telegram 2.0 (PHASE 11)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('onlayn imtihon: o‘quvchi botda boshlaydi, variant va matnli javob beradi, topshiradi — web bilan bir urinish', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Aziz');
    const single = (await request(app).post('/api/questions').set(bearer(token)).send({ courseId: course.id, text: '2 + 2 nechiga teng?', options: [{ text: '4', isCorrect: true }, { text: '5' }] })).body.data;
    const short = (await request(app).post('/api/questions').set(bearer(token)).send({ courseId: course.id, text: 'Massivga qo‘shish metodi?', type: 'SHORT_TEXT', acceptedAnswers: ['push'] })).body.data;
    const exam = (await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Bot testi', groupId: group.id, date: '2026-10-01', isOnline: true })).body.data;
    await request(app).post(`/api/exams/${exam.id}/questions`).set(bearer(token)).send({ questionIds: [single.id, short.id] });
    await linkStudent(student.id, 71_001);
    const bot = captureBot();

    await message(71_001, '/start').expect(200);
    expect(bot.lastData()).toContain('ex_list');
    await press(71_001, 'ex_list').expect(200);
    expect(bot.last().text).toContain('Bot testi');
    // TZ 3.1 GAP-06: ro'yxat → tafsilot → boshlash → tasdiq → savol
    await press(71_001, `ex_info:${exam.id}`).expect(200);
    expect(bot.last().text).toContain('Savollar: <b>2</b>');
    await press(71_001, `ex_start:${exam.id}`).expect(200);
    expect(bot.last().text).toContain('Boshlaymizmi?');
    expect(await prisma.examAttempt.count({ where: { examId: exam.id } })).toBe(0);
    await press(71_001, `ex_go:${exam.id}`).expect(200);
    expect(bot.last().text).toContain('1/2');
    expect(bot.last().text).toContain('2 + 2 nechiga teng?');

    const optionIndex = (bot.last().keyboard ?? []).flat().findIndex((button) => button.text.endsWith(' 4'));
    await press(71_001, `ex_a:0:${optionIndex}`).expect(200);
    // Bitta javobli savoldan keyingisiga avtomatik o'tildi
    expect(bot.last().text).toContain('2/2');
    await message(71_001, 'push').expect(200);
    await press(71_001, 'ex_sub').expect(200);
    expect(bot.last().text).toContain('Topshirasizmi');
    await press(71_001, 'ex_subok').expect(200);
    expect(bot.last().text).toContain('2/2');
    expect(bot.last().text).toContain('100%');

    // Web bilan bitta urinish (§44): xodim ham, kabinet ham shu natijani ko'radi
    const attempts = await request(app).get(`/api/exams/${exam.id}/attempts`).set(bearer(token));
    expect(attempts.body.data).toEqual([expect.objectContaining({ status: 'GRADED', score: 2, percentage: 100 })]);
    // Imtihon oqimi yopildi — keyingi xabar oddiy buyruq sifatida ishlanadi
    expect((await telegramSessionService.get('71001'))?.flow ?? 'idle').toBe('idle');
  });

  it('sotuv: lead kartasidan qo‘ng‘iroq (izohli va izohsiz) va follow-up (tayyor muddat va o‘z sanasi)', async () => {
    const { user } = await linkStaff('SALES_MANAGER', 72_001);
    const source = await createSource('Instagram');
    const lead = await prisma.lead.create({ data: { firstName: 'Bekzod', phone: '+998901110022', sourceId: source.id, assignedToId: user.id } });
    const bot = captureBot();

    await press(72_001, `sl_lead:${lead.id}`).expect(200);
    expect(bot.lastData()).toEqual(expect.arrayContaining([`sl_call:${lead.id}`, `sl_fn:${lead.id}`]));
    await press(72_001, `sl_call:${lead.id}`).expect(200);
    await press(72_001, `sl_cr:${lead.id}:INTERESTED`).expect(200);
    await message(72_001, 'Ertaga sinov darsiga keladi').expect(200);
    expect(bot.last().text).toContain('Qo‘ng‘iroq yozildi');
    await press(72_001, `sl_call:${lead.id}`).expect(200);
    await press(72_001, `sl_cr:${lead.id}:NO_ANSWER`).expect(200);
    await press(72_001, 'sl_cs').expect(200);
    const calls = await prisma.call.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'asc' }, select: { result: true, notes: true, managerId: true } });
    expect(calls).toEqual([
      { result: 'INTERESTED', notes: 'Ertaga sinov darsiga keladi', managerId: user.id },
      { result: 'NO_ANSWER', notes: null, managerId: user.id },
    ]);

    await press(72_001, `sl_fn:${lead.id}`).expect(200);
    await press(72_001, `sl_fw:${lead.id}:t10`).expect(200);
    expect(bot.last().text).toContain('Follow-up qo‘yildi');
    await press(72_001, `sl_fn:${lead.id}`).expect(200);
    await message(72_001, '01.01.2020 10:00').expect(200);
    expect(bot.last().text).toContain('kelajakdagi');
    await message(72_001, '25.12.2099 15:30').expect(200);
    const followUps = await prisma.followUp.findMany({ where: { leadId: lead.id }, orderBy: { dueAt: 'asc' } });
    expect(followUps).toHaveLength(2);
    expect(followUps[1]!.dueAt.toISOString()).toBe('2099-12-25T10:30:00.000Z');
  });

  it('broadcast media: rasm izoh bilan — har chatga file_id orqali; matn ikki marta escape qilinmaydi', async () => {
    await linkStaff('OWNER', 73_001);
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Qabul');
    await linkStudent(student.id, 73_002);
    const bot = captureBot();

    await press(73_001, 'bc_start').expect(200);
    await press(73_001, 'bc_aud:STUDENTS').expect(200);
    await photo(73_001, 'Ertaga <bayram> — dars yo‘q').expect(200);
    expect(bot.allText()).toContain('🖼 Rasm bilan');
    await press(73_001, 'bc_send').expect(200);
    const broadcast = await prisma.telegramBroadcast.findFirstOrThrow();
    expect(broadcast).toMatchObject({ mediaKind: 'photo', mediaFileId: 'PHOTO_FILE_ID' });

    await notificationDeliveryService.processQueue(new Date(Date.now() + 1000));
    expect(bot.media).toHaveLength(1);
    expect(bot.media[0]).toMatchObject({ chatId: '73002', media: { kind: 'photo', fileId: 'PHOTO_FILE_ID' } });
    expect(bot.media[0]!.caption).toContain('Ertaga &lt;bayram&gt; — dars yo‘q');
    expect(bot.media[0]!.caption).not.toContain('&amp;lt;');
  });

  it('sozlamalar: ovozsiz rejim avtomatik eslatmani to‘xtatadi; xodim tur bo‘yicha o‘chiradi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id, 'Jim');
    await linkStudent(student.id, 74_001);
    const bot = captureBot();

    await message(74_001, '/sozlamalar').expect(200);
    expect(bot.lastData()).toContain('ws_mute');
    await press(74_001, 'ws_mute').expect(200);
    expect(bot.last().text).toContain('to‘xtatilgan');
    const queued = await prisma.$transaction((tx) => notificationDeliveryService.enqueueInTransaction(tx, { title: 'Test', body: 'x', target: { studentId: student.id } }));
    expect(queued).toBe(0);
    await press(74_001, 'ws_mute').expect(200);
    expect(await prisma.$transaction((tx) => notificationDeliveryService.enqueueInTransaction(tx, { title: 'Test', body: 'y', target: { studentId: student.id } }))).toBe(1);

    const { user } = await linkStaff('SALES_MANAGER', 74_002);
    await press(74_002, 'ws_set').expect(200);
    expect(bot.lastData()).toContain('ws_st:NEW_LEAD');
    expect(bot.lastData()).not.toContain('ws_st:EXPENSE_APPROVAL');
    await press(74_002, 'ws_st:NEW_LEAD').expect(200);
    expect(await prisma.notificationSetting.findUnique({ where: { userId_type: { userId: user.id, type: 'NEW_LEAD' } } })).toMatchObject({ telegram: false, inApp: true });
  });

  it('qidiruv, KPI, hisobot va marketing — ruxsatga qarab', async () => {
    const { user: teacher } = await linkStaff('TEACHER', 75_001);
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Front-9' });
    await createStudent(course.id, group.id, 'Qidirilgan');
    const bot = captureBot();

    await message(75_001, '/qidir').expect(200);
    await message(75_001, 'Qidirilgan').expect(200);
    expect(bot.last().text).toContain('Qidirilgan Test');
    await press(75_001, 'ws_kpi').expect(200);
    expect(bot.last().text).toContain('Front-9');
    expect(bot.last().text).toContain('Guruhlar: <b>1</b>');
    // O'qituvchida hisobot va marketing ruxsati yo'q
    await press(75_001, 'ws_rep').expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    await press(75_001, 'ws_r:profit').expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');

    await linkStaff('OWNER', 75_002);
    await press(75_002, 'ws_rep').expect(200);
    expect(bot.lastData()).toEqual(expect.arrayContaining(['ws_r:sales', 'ws_r:profit']));
    await press(75_002, 'ws_r:payments').expect(200);
    expect(bot.last().text).toContain('CRM → Hisobotlar');
    await press(75_002, 'ws_mkt').expect(200);
    expect(bot.last().text).toContain('Marketing');
  });

  it('o‘qituvchi botda topshiriqni ko‘radi (fayl bilan), baholaydi va qaytaradi; vazifaga fayl biriktiradi', async () => {
    const { user: teacher, token } = await linkStaff('TEACHER', 76_001);
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Web-3' });
    const ali = await createStudent(course.id, group.id, 'Ali');
    const vali = await createStudent(course.id, group.id, 'Vali');
    const homework = (await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Formalar', groupId: group.id, deadline: new Date(Date.now() + 86_400_000).toISOString() })).body.data;
    await prisma.homeworkSubmission.update({ where: { homeworkId_studentId: { homeworkId: homework.id, studentId: ali.id } }, data: { status: 'SUBMITTED', submittedAt: new Date(), answerText: 'Mening formam tayyor' } });
    await prisma.homeworkSubmission.update({ where: { homeworkId_studentId: { homeworkId: homework.id, studentId: vali.id } }, data: { status: 'SUBMITTED', submittedAt: new Date(), answerText: 'Vali javobi' } });
    const bot = captureBot();

    await press(76_001, 'ws_rv').expect(200);
    expect(bot.lastData()).toEqual(expect.arrayContaining([`ws_ro:${homework.id}:${ali.id}`, `ws_ro:${homework.id}:${vali.id}`]));
    await press(76_001, `ws_ro:${homework.id}:${ali.id}`).expect(200);
    expect(bot.allText()).toContain('Mening formam tayyor');
    await press(76_001, `ws_rg:${homework.id}:${ali.id}`).expect(200);
    await message(76_001, '85 Yaxshi, validatsiya qo‘shing').expect(200);
    expect(await prisma.homeworkSubmission.findUniqueOrThrow({ where: { homeworkId_studentId: { homeworkId: homework.id, studentId: ali.id } } })).toMatchObject({ status: 'GRADED', score: 85, feedback: 'Yaxshi, validatsiya qo‘shing' });
    await press(76_001, `ws_rb:${homework.id}:${vali.id}`).expect(200);
    await message(76_001, 'Formaga email maydoni qo‘shing').expect(200);
    expect(await prisma.homeworkSubmission.findUniqueOrThrow({ where: { homeworkId_studentId: { homeworkId: homework.id, studentId: vali.id } } })).toMatchObject({ status: 'RETURNED' });

    // Begona o'qituvchi — boshqa guruh topshirig'ini ocholmaydi
    await linkStaff('TEACHER', 76_002);
    await press(76_002, `ws_ro:${homework.id}:${ali.id}`).expect(200);
    expect(bot.last().text).toContain('❌');

    // Vazifa yaratishda rasm biriktirish
    await press(76_001, `tc_hw:${group.id}`).expect(200);
    await message(76_001, 'Rasmga qarab chizing').expect(200);
    await message(76_001, '25.12.2099').expect(200);
    await message(76_001, '-').expect(200);
    await photo(76_001, '').expect(200);
    expect(bot.last().text).toContain('Fayl qo‘shildi (1/5)');
    await press(76_001, 'tc_hwok').expect(200);
    expect(bot.last().text).toContain('1 ta biriktirildi');
    const created = await prisma.homework.findFirstOrThrow({ where: { title: 'Rasmga qarab chizing' }, select: { attachments: { select: { kind: true, mimeType: true } } } });
    expect(created.attachments).toEqual([{ kind: 'FILE', mimeType: 'image/png' }]);
  });
});
