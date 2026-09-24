import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { telegramSessionService } from '../src/telegram/session.service.js';
import { createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

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
    texts: () => shown.map((item) => item.text).join('\n'),
    lastData: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data),
  };
}

function post(body: object) {
  return request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
}
function message(text: string, chatId: number) {
  return post({ message: { message_id: 10, chat: { id: chatId, first_name: 'T' }, from: { id: chatId }, text } });
}
function press(data: string, chatId: number) {
  return post({ callback_query: { id: 'cb', data, from: { id: chatId }, message: { message_id: 10, chat: { id: chatId } } } });
}

describe.skipIf(!hasTestDatabase)('Telegram — to‘lov tugmasi va do‘st taklifi', () => {
  const CHAT = 4_001;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function linkedStudent(referralCode: string | null) {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await prisma.student.create({
      data: {
        firstName: 'Sardor',
        lastName: 'T',
        phone: '+998900001111',
        courseId: course.id,
        groupId: group.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-06-01'),
        referralCode,
        debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
      },
    });
    const link = await telegramLinkService.ensureLink({ studentId: student.id });
    await message(`/start ${link.linkCode}`, CHAT);
    return { student, course };
  }

  it('to‘lash tugmasi: provayder ulanmagan bo‘lsa aniq aytiladi, bot to‘lovni tasdiqlamaydi', async () => {
    await linkedStudent(null);
    const bot = captureBot();

    await press('st_pay', CHAT).expect(200);
    expect(bot.lastData()).toContain('st_paynow');

    await press('st_paynow', CHAT).expect(200);
    expect(bot.last().text).toContain('Onlayn to‘lov');
    expect(bot.last().text).toContain('hali ulanmagan');
    // Hech qanday to'lov yoki so'rov yaratilmaydi
    expect(await prisma.paymentIntent.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('do‘st taklifi: kod, takliflar ro‘yxati va ulashish havolasi', async () => {
    const { student } = await linkedStudent('SARDOR7');
    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, firstName: 'Do‘st' });
    await prisma.referral.create({ data: { referrerStudentId: student.id, leadId: lead.id, status: 'PENDING', bonusAmount: 0 } });
    const bot = captureBot();

    await message('/taklif', CHAT).expect(200);

    const text = bot.texts();
    expect(text).toContain('SARDOR7');
    expect(text).toContain('Takliflar: <b>1</b>');
    expect(text).toContain('Do‘st');
    expect(text).toContain('kutilmoqda');
    expect(text).toContain('t.me/share/url');
  });

  it('kod berilmagan bo‘lsa — administratorga yo‘naltiradi', async () => {
    await linkedStudent(null);
    const bot = captureBot();

    await press('st_ref', CHAT).expect(200);
    expect(bot.last().text).toContain('hali berilmagan');
  });
});

describe.skipIf(!hasTestDatabase)('Telegram — AI yordamchi', () => {
  const CHAT = 5_001;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  async function linkedStaff(role: string, chatId: number, email?: string) {
    const { user } = await createUserWithToken(app, { role, ...(email ? { email } : {}) });
    const link = await telegramLinkService.ensureLink({ userId: user.id });
    await message(`/start ${link.linkCode}`, chatId);
    return user;
  }

  it('rahbar savol beradi, javob CRM ma’lumotidan keladi; taklif tugmasi ham ishlaydi', async () => {
    await linkedStaff('OWNER', CHAT);
    const bot = captureBot();

    await message('/start', CHAT).expect(200);
    expect(bot.lastData()).toContain('ai_start');

    await message('/ai', CHAT).expect(200);
    expect(bot.last().text).toContain('AI yordamchi');
    const suggestion = bot.lastData().find((data) => data.startsWith('ai_s:'));
    expect(suggestion).toBeDefined();
    expect(await telegramSessionService.get(String(CHAT))).toMatchObject({ flow: 'ai' });

    await message('Bugun qancha pul tushdi?', CHAT).expect(200);
    // Javob yoki "tushunmadim" — ikkalasi ham CRM'dan, xato emas
    expect(bot.last().text).not.toContain('Xatolik yuz berdi');
    expect(bot.last().text.length).toBeGreaterThan(10);
    // Oqim ochiq qoladi — keyingi savolga tayyor
    expect(await telegramSessionService.get(String(CHAT))).toMatchObject({ flow: 'ai' });
    // So'rov CRM jurnalida
    expect(await prisma.aiQuery.count()).toBe(1);

    await press(suggestion!, CHAT).expect(200);
    expect(await prisma.aiQuery.count()).toBe(2);

    await press('menu', CHAT).expect(200);
    expect(await telegramSessionService.get(String(CHAT))).toBeNull();
  });

  it('ruxsatsiz xodimga AI yopiq', async () => {
    await linkedStaff('TEACHER', CHAT);
    const bot = captureBot();

    await message('/start', CHAT).expect(200);
    expect(bot.lastData()).not.toContain('ai_start');

    await message('/ai', CHAT).expect(200);
    expect(bot.last().text).toContain('huquqingiz yo‘q');
    expect(await telegramSessionService.get(String(CHAT))).toBeNull();
  });
});
