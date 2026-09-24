import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { callback, grid, parseCallback, paginationRow } from '../src/telegram/keyboards.js';
import { allowChat, resetRateLimits } from '../src/telegram/rateLimit.js';
import { processUpdates } from '../src/telegram/polling.js';
import { telegramSessionService } from '../src/telegram/session.service.js';
import { createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';

interface Sent {
  chatId: string;
  text: string;
  keyboard: InlineKeyboard | undefined;
}

/** Bot javoblarini ushlaydi — token yo'q, haqiqiy so'rov ketmaydi */
function captureBot() {
  const sent: Sent[] = [];
  const edited: Sent[] = [];
  const answered: string[] = [];

  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(
    async (chatId: string, text: string, keyboard?: InlineKeyboard) => {
      sent.push({ chatId, text, keyboard });
      return { ok: true, retryable: false, messageId: 500 + sent.length };
    },
  );
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(
    async (chatId: string, _messageId: number, text: string, keyboard?: InlineKeyboard) => {
      edited.push({ chatId, text, keyboard });
      return { ok: true, retryable: false };
    },
  );
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockImplementation(async (id: string) => {
    answered.push(id);
    return { ok: true, retryable: false };
  });

  return { sent, edited, answered };
}

function post(body: object) {
  return request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
}

const CHAT_ID = 707_001;

function messageUpdate(text: string, chatId = CHAT_ID) {
  return { message: { message_id: 10, chat: { id: chatId, first_name: 'Test' }, from: { id: 900 }, text } };
}

function callbackUpdate(data: string, chatId = CHAT_ID) {
  return {
    callback_query: {
      id: 'cbq-1',
      data,
      from: { id: 900 },
      message: { message_id: 10, chat: { id: chatId, first_name: 'Test' } },
    },
  };
}

async function linkStudent(chatId = CHAT_ID) {
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id });
  const student = await prisma.student.create({
    data: {
      firstName: 'Sardor',
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId: course.id,
      groupId: group.id,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
  const link = await telegramLinkService.ensureLink({ studentId: student.id });
  await post(messageUpdate(`/start ${link.linkCode}`, chatId));
  return { student, group };
}

/** Klaviaturadagi barcha `callback_data` qiymatlari */
function dataOf(keyboard: InlineKeyboard | undefined): string[] {
  return (keyboard ?? []).flat().map((button) => button.data);
}

describe('Telegram poydevor — sof funksiyalar', () => {
  it('callback ma’lumoti quriladi va ajratiladi', () => {
    expect(callback('menu')).toBe('menu');
    expect(callback('cmd', '/qarz')).toBe('cmd:/qarz');
    expect(parseCallback('cmd:/qarz')).toEqual({ action: 'cmd', arg: '/qarz' });
    // Argument ichida ikki nuqta bo'lsa ham birinchisi bo'yicha ajratiladi
    expect(parseCallback('page:list:3')).toEqual({ action: 'page', arg: 'list:3' });
    expect(parseCallback('menu')).toEqual({ action: 'menu', arg: null });
  });

  it('64 baytdan uzun callback rad etiladi', () => {
    // Telegram uzun callback_data ni qabul qilmaydi va tugma jimgina ishlamay qoladi
    expect(() => callback('cmd', 'x'.repeat(70))).toThrow(/juda uzun/);
  });

  it('tugmalar ustunlarga bo‘linadi', () => {
    const buttons = [1, 2, 3, 4, 5].map((n) => ({ text: String(n), data: String(n) }));
    expect(grid(buttons, 2).map((row) => row.length)).toEqual([2, 2, 1]);
  });

  it('sahifalash: chekkadagi tugma ko‘rsatilmaydi', () => {
    // Bitta sahifa bo'lsa qator umuman chiqmaydi
    expect(paginationRow('page', { page: 1, totalPages: 1 })).toEqual([]);

    const first = paginationRow('page', { page: 1, totalPages: 3 });
    expect(first.map((b) => b.text)).toEqual(['1/3', '➡️']);

    const middle = paginationRow('page', { page: 2, totalPages: 3 });
    expect(middle.map((b) => b.text)).toEqual(['⬅️', '2/3', '➡️']);

    const last = paginationRow('page', { page: 3, totalPages: 3 });
    expect(last.map((b) => b.text)).toEqual(['⬅️', '3/3']);
  });

  it('chat chegarasi: oyna ichida ortiqcha so‘rov to‘xtatiladi', () => {
    resetRateLimits();
    const now = Date.now();
    // 20 tasi o'tadi, 21-si yo'q
    for (let i = 0; i < 20; i += 1) expect(allowChat('c1', now)).toBe(true);
    expect(allowChat('c1', now)).toBe(false);

    // Boshqa chat ta'sirlanmaydi — flood qilgan odam qolganlarni bloklamaydi
    expect(allowChat('c2', now)).toBe(true);

    // Oyna o'tgach yana ochiladi
    expect(allowChat('c1', now + 11_000)).toBe(true);
  });
});

describe.skipIf(!hasTestDatabase)('Telegram poydevor (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bog‘langandan keyin /start bosh menyuni tugmalar bilan ko‘rsatadi', async () => {
    await linkStudent();
    const bot = captureBot();

    await post(messageUpdate('/start')).expect(200);

    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0]!.text).toContain('Kerakli bo‘limni tanlang');
    expect(dataOf(bot.sent[0]!.keyboard)).toEqual([
      'cmd:/qarz',
      'cmd:/darslar',
      'cmd:/davomat',
      'cmd:/holat',
      'cmd:/uzish',
    ]);
  });

  it('tugma bosilganda javob o‘sha xabarning o‘rniga yoziladi va tugma tasdiqlanadi', async () => {
    await linkStudent();
    const bot = captureBot();

    await post(callbackUpdate('cmd:/qarz')).expect(200);

    // Yangi xabar emas — mavjudi tahrirlanadi, suhbat to'lib ketmasin
    expect(bot.sent).toHaveLength(0);
    expect(bot.edited).toHaveLength(1);
    expect(bot.edited[0]!.text).toContain('Shartnoma');
    expect(dataOf(bot.edited[0]!.keyboard)).toEqual(['menu']);
    // Tugmadagi "soat" aylanib qolmasligi uchun
    expect(bot.answered).toEqual(['cbq-1']);
  });

  it('xodim menyusida o‘quvchi buyruqlari yo‘q', async () => {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    await post(messageUpdate(`/start ${link.linkCode}`));
    const bot = captureBot();

    await post(messageUpdate('/start')).expect(200);

    expect(dataOf(bot.sent[0]!.keyboard)).toEqual(['cmd:/holat', 'cmd:/uzish']);
  });

  it('noma’lum callback bosh menyuga qaytaradi', async () => {
    await linkStudent();
    const bot = captureBot();

    await post(callbackUpdate('allaqanday_narsa:123')).expect(200);

    expect(bot.edited[0]!.text).toContain('Kerakli bo‘limni tanlang');
  });

  it('bog‘lanmagan chatga menyu ham, tugma ham berilmaydi', async () => {
    const bot = captureBot();

    await post(callbackUpdate('cmd:/qarz', 777_777)).expect(200);

    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0]!.text).toContain('havoladan foydalaning');
    expect(bot.sent[0]!.keyboard).toBeUndefined();
    expect(bot.edited).toHaveLength(0);
  });

  it('chat chegarasidan oshsa javob umuman yuborilmaydi', async () => {
    await linkStudent();
    const bot = captureBot();

    for (let i = 0; i < 25; i += 1) {
      await post(messageUpdate('/holat'));
    }

    // Flood qilgan chatga javob yozilsa, o'zimiz Telegram chegarasiga urilardik
    expect(bot.sent.length + bot.edited.length).toBeLessThan(25);
    expect(await prisma.telegramEvent.count({ where: { status: 'THROTTLED' } })).toBeGreaterThan(0);
  });

  it('hodisa jurnaliga yoziladi, lekin foydalanuvchi matni saqlanmaydi', async () => {
    await linkStudent();
    captureBot();

    await post(messageUpdate('/qarz')).expect(200);

    const events = await prisma.telegramEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 1 });
    expect(events[0]).toMatchObject({ kind: 'message', action: '/qarz', status: 'OK', chatId: String(CHAT_ID) });
    expect(events[0]!.telegramUserId).toBe('900');
    // Jadvalda matn ustuni umuman yo'q — maxfiylik uchun
    expect(Object.keys(events[0]!)).not.toContain('text');
  });

  it('handler xato bersa foydalanuvchi texnik xatoni ko‘rmaydi', async () => {
    await linkStudent();
    const bot = captureBot();
    vi.spyOn(prisma.paymentInstallment, 'findMany').mockRejectedValueOnce(new Error('baza yiqildi'));

    await post(messageUpdate('/qarz')).expect(200);

    const shown = [...bot.sent, ...bot.edited].map((item) => item.text).join('\n');
    expect(shown).toContain('Xatolik yuz berdi');
    expect(shown).not.toContain('baza yiqildi');

    const failed = await prisma.telegramEvent.findFirst({ where: { status: 'FAILED' } });
    expect(failed?.error).toContain('baza yiqildi');
  });

  it('/uzish darhol o‘chirmaydi — avval tasdiq so‘raydi', async () => {
    await linkStudent();
    const bot = captureBot();

    await post(messageUpdate('/uzish')).expect(200);

    // Telegram `/uzish` ni bosiladigan havola qilib ko'rsatadi — tasodifan bosilsa
    // bog'lanish yo'qolmasligi kerak
    expect(await prisma.telegramLink.count()).toBe(1);
    const shown = [...bot.sent, ...bot.edited].at(-1)!;
    expect(shown.text).toContain('uzasizmi');
    expect(dataOf(shown.keyboard)).toEqual(['unlink_yes', 'menu']);
  });

  it('tasdiqlangandan keyin bog‘lanish o‘chadi va chat yana begona bo‘ladi', async () => {
    await linkStudent();
    const bot = captureBot();

    await post(messageUpdate('/uzish')).expect(200);
    await post(callbackUpdate('unlink_yes')).expect(200);

    expect(await prisma.telegramLink.count()).toBe(0);
    await post(messageUpdate('/holat')).expect(200);
    expect(bot.sent.at(-1)!.text).toContain('havoladan foydalaning');
  });

  it('bekor qilinsa bog‘lanish joyida qoladi', async () => {
    await linkStudent();
    const bot = captureBot();

    await post(messageUpdate('/uzish')).expect(200);
    await post(callbackUpdate('menu')).expect(200);

    expect(await prisma.telegramLink.count()).toBe(1);
    expect([...bot.sent, ...bot.edited].at(-1)!.text).toContain('Kerakli bo‘limni tanlang');
  });
});

describe.skipIf(!hasTestDatabase)('Telegram oqim holati (session)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  it('oqim saqlanadi, yangilanadi va tugatiladi', async () => {
    await telegramSessionService.set('c1', { flow: 'attendance', step: 'group', data: {} });
    expect(await telegramSessionService.get('c1')).toMatchObject({ flow: 'attendance', step: 'group' });

    await telegramSessionService.set('c1', { flow: 'attendance', step: 'marking', data: { groupId: 'g1' } });
    const next = await telegramSessionService.get('c1');
    expect(next).toMatchObject({ step: 'marking', data: { groupId: 'g1' } });

    await telegramSessionService.clear('c1');
    expect(await telegramSessionService.get('c1')).toBeNull();
  });

  it('muddati o‘tgan oqim qaytarilmaydi va tozalanadi', async () => {
    const past = new Date(Date.now() - 60 * 60_000);
    await telegramSessionService.set('c2', { flow: 'broadcast', step: 'text', data: {} }, past);

    // Tozalash jobi yurmagan bo'lsa ham o'qishda qaytarilmaydi
    expect(await telegramSessionService.get('c2')).toBeNull();
    expect(await telegramSessionService.purgeExpired()).toBe(1);
    expect(await prisma.telegramSession.count()).toBe(0);
  });

  it('bitta chatda bitta oqim bo‘ladi', async () => {
    await telegramSessionService.set('c3', { flow: 'attendance', step: 'group', data: {} });
    await telegramSessionService.set('c3', { flow: 'broadcast', step: 'text', data: {} });

    expect(await prisma.telegramSession.count({ where: { chatId: 'c3' } })).toBe(1);
    expect(await telegramSessionService.get('c3')).toMatchObject({ flow: 'broadcast' });
  });
});

describe.skipIf(!hasTestDatabase)('Telegram polling (sinov rejimi)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  it('offset oxirgi update bo‘yicha suriladi', async () => {
    await linkStudent();
    captureBot();

    const next = await processUpdates([{ ...messageUpdate('/holat'), update_id: 41 }, { ...messageUpdate('/holat'), update_id: 42 }], 0);

    // Telegram `offset` dan kichiklarini o'chiradi — u faqat ishlangandan keyin suriladi
    expect(next).toBe(43);
  });

  it('bitta update xato bersa ham qolganlari ishlanadi va offset suriladi', async () => {
    await linkStudent();
    const bot = captureBot();
    // Birinchi xabar ishlovchisi yiqiladi
    vi.spyOn(prisma.telegramLink, 'findFirst').mockRejectedValueOnce(new Error('tarmoq uzildi'));

    const next = await processUpdates([{ ...messageUpdate('/holat'), update_id: 7 }, { ...messageUpdate('/holat'), update_id: 8 }], 0);

    // Xato bergan xabarda offset to'xtab qolsa, u abadiy takrorlanardi
    expect(next).toBe(9);
    expect(bot.sent.length + bot.edited.length).toBeGreaterThan(0);
  });

  it('bo‘sh partiyada offset o‘zgarmaydi', async () => {
    expect(await processUpdates([], 15)).toBe(15);
  });

  it('update_id yo‘q bo‘lsa offset orqaga ketmaydi', async () => {
    await linkStudent();
    captureBot();

    const next = await processUpdates([messageUpdate('/holat')], 100);

    expect(next).toBe(100);
  });
});

describe('Bog‘lash urinishlari chegarasi (sof funksiya)', () => {
  it('ketma-ket xatodan keyin chat bloklanadi va vaqt o‘tgach ochiladi', async () => {
    const { allowLinkAttempt, registerFailedLinkAttempt, resetAllLinkAttempts, resetLinkAttempts } = await import(
      '../src/telegram/linkAttempts.js'
    );
    resetAllLinkAttempts();
    const now = Date.now();

    for (let i = 0; i < 4; i += 1) {
      registerFailedLinkAttempt('chat-a', now);
      expect(allowLinkAttempt('chat-a', now)).toBe(true);
    }
    // Beshinchi xato — blok
    registerFailedLinkAttempt('chat-a', now);
    expect(allowLinkAttempt('chat-a', now)).toBe(false);

    // Boshqa chat ta'sirlanmaydi
    expect(allowLinkAttempt('chat-b', now)).toBe(true);

    // Blok muddati o'tgach ochiladi
    expect(allowLinkAttempt('chat-a', now + 16 * 60_000)).toBe(true);

    // To'g'ri kod kiritgan odam oldingi xatolari uchun jazolanmaydi
    registerFailedLinkAttempt('chat-c', now);
    resetLinkAttempts('chat-c');
    for (let i = 0; i < 4; i += 1) registerFailedLinkAttempt('chat-c', now);
    expect(allowLinkAttempt('chat-c', now)).toBe(true);
  });
});

describe.skipIf(!hasTestDatabase)('Bog‘lash kodi xavfsizligi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    const { resetAllLinkAttempts } = await import('../src/telegram/linkAttempts.js');
    resetAllLinkAttempts();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Xodim uchun yangi kod */
  async function freshCode() {
    const { user } = await createUserWithToken(app, { role: 'ADMIN' });
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    return { userId: user.id, code: link.linkCode, expiresAt: link.codeExpiresAt };
  }

  it('kod muddat bilan beriladi', async () => {
    const { expiresAt } = await freshCode();

    expect(expiresAt).not.toBeNull();
    const remaining = new Date(expiresAt!).getTime() - Date.now();
    // 15 daqiqa — havolani ochib botga o'tishga yetarli, lekin abadiy emas
    expect(remaining).toBeGreaterThan(10 * 60_000);
    expect(remaining).toBeLessThanOrEqual(15 * 60_000);
  });

  it('muddati o‘tgan kod ishlamaydi', async () => {
    const { code } = await freshCode();
    await prisma.telegramLink.update({ where: { linkCode: code }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });
    const bot = captureBot();

    await post(messageUpdate(`/start ${code}`)).expect(200);

    expect(bot.sent[0]!.text).toContain('eskirgan');
    expect(await prisma.telegramLink.count({ where: { verifiedAt: { not: null } } })).toBe(0);
  });

  it('kod bir martalik — ikkinchi chat u bilan bog‘lana olmaydi', async () => {
    const { code } = await freshCode();
    const bot = captureBot();

    // Birinchi chat bog'lanadi
    await post(messageUpdate(`/start ${code}`, 111_111)).expect(200);
    const first = await prisma.telegramLink.findUniqueOrThrow({ where: { linkCode: code } });
    expect(first.chatId).toBe('111111');

    // Ikkinchi chat o'sha kod bilan urinadi — bu ilgari bog'lanishni o'g'irlar edi
    await post(messageUpdate(`/start ${code}`, 222_222)).expect(200);

    const after = await prisma.telegramLink.findUniqueOrThrow({ where: { linkCode: code } });
    expect(after.chatId).toBe('111111');
    expect(bot.sent.at(-1)!.text).toContain('eskirgan');
  });

  it('bog‘lanish va uzish audit jurnaliga yoziladi', async () => {
    const { userId, code } = await freshCode();
    captureBot();

    await post(messageUpdate(`/start ${code}`)).expect(200);
    const linked = await prisma.auditLog.findFirst({ where: { action: 'telegram.linked' } });
    expect(linked).toMatchObject({ entityType: 'telegram_link', userId });

    await post(messageUpdate('/uzish')).expect(200);
    await post(callbackUpdate('unlink_yes')).expect(200);
    const unlinked = await prisma.auditLog.findFirst({ where: { action: 'telegram.unlinked' } });
    expect(unlinked).toMatchObject({ entityType: 'telegram_link' });
  });

  it('bog‘lagan Telegram foydalanuvchisi saqlanadi', async () => {
    const { code } = await freshCode();
    captureBot();

    await post(messageUpdate(`/start ${code}`)).expect(200);

    const saved = await prisma.telegramLink.findUniqueOrThrow({ where: { linkCode: code } });
    // Guruh chatida `chatId` va foydalanuvchi id bir xil emas — kim bog'laganini bilish kerak
    expect(saved.telegramUserId).toBe('900');
    expect(saved.codeUsedAt).not.toBeNull();
  });

  it('amal qilayotgan kod sahifa qayta ochilganda o‘zgarmaydi', async () => {
    const { userId, code } = await freshCode();

    const again = await telegramLinkService.ensureLink({ userId });

    // Aks holda foydalanuvchi nusxalagan havola keyin ishlamay qolardi
    expect(again.linkCode).toBe(code);
  });

  it('muddati o‘tgan kod sahifa ochilganda yangilanadi', async () => {
    const { userId, code } = await freshCode();
    await prisma.telegramLink.update({ where: { linkCode: code }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });

    const again = await telegramLinkService.ensureLink({ userId });

    expect(again.linkCode).not.toBe(code);
    // Eski yozuv qayta ishlatiladi — "bitta egaga bitta bog'lanish" qoidasi buzilmaydi
    expect(await prisma.telegramLink.count({ where: { userId } })).toBe(1);
  });

  it('ishlatilmagan eski kodlar tozalanadi, bog‘langanlari qoladi', async () => {
    const { code } = await freshCode();
    await prisma.telegramLink.update({ where: { linkCode: code }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });

    const { user: other } = await createUserWithToken(app, { role: 'TEACHER', email: 'ustoz-tg@local.uz' });
    const live = await telegramLinkService.ensureLink({ userId: other.id });
    captureBot();
    await post(messageUpdate(`/start ${live.linkCode}`, 333_333)).expect(200);

    const removed = await telegramLinkService.purgeExpiredCodes();

    expect(removed).toBe(1);
    expect(await prisma.telegramLink.count()).toBe(1);
    expect((await prisma.telegramLink.findFirstOrThrow()).verifiedAt).not.toBeNull();
  });
});
