import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { telegramSessionService } from '../src/telegram/session.service.js';
import { moneyUz } from '../src/utils/money.js';
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

/** Rolga ega xodim, chat bog'langan */
async function linkedStaff(role: string, chatId: number, email?: string) {
  const { user } = await createUserWithToken(app, { role, ...(email ? { email } : {}) });
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(`/start ${link.linkCode}`, chatId);
  return user;
}

describe.skipIf(!hasTestDatabase)('Telegram — sotuv boti', () => {
  const CHAT = 1_001;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('leadlarim: faqat menga biriktirilganlar, kartochka va status o‘zgartirish', async () => {
    const manager = await linkedStaff('SALES_MANAGER', CHAT);
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'boshqa-manager@local.uz' });
    const source = await createSource();
    const mine = await createLead({ sourceId: source.id, firstName: 'Dilnoza', assignedToId: manager.id });
    const foreign = await createLead({ sourceId: source.id, firstName: 'Begona', assignedToId: other.id });
    const bot = captureBot();

    await message('/start', CHAT).expect(200);
    expect(bot.lastData()).toEqual(expect.arrayContaining(['sl_leads', 'sl_hot', 'sl_fu']));

    await message('/leadlar', CHAT).expect(200);
    expect(bot.lastData()).toContain(`sl_lead:${mine.id}`);
    expect(bot.lastData()).not.toContain(`sl_lead:${foreign.id}`);

    await press(`sl_lead:${mine.id}`, CHAT).expect(200);
    expect(bot.last().text).toContain('Dilnoza');
    expect(bot.lastData()).toContain(`sl_st:${mine.id}:CONTACTED`);
    // WON bot orqali qo'yilmaydi — o'quvchiga aylantirish CRM'da
    expect(bot.lastData().some((data) => data.endsWith(':WON'))).toBe(false);

    await press(`sl_st:${mine.id}:CONTACTED`, CHAT).expect(200);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe('CONTACTED');
    expect(bot.last().text).toContain('Bog‘lanildi');

    // Begona leadga id bilan ham kirib bo'lmaydi
    await press(`sl_lead:${foreign.id}`, CHAT).expect(200);
    expect(bot.last().text).toContain('❌');
    expect(bot.last().text).not.toContain('Begona');
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe('NEW');
  });

  it('yo‘qotilgan lead: sabab so‘raladi, keyin saqlanadi', async () => {
    const manager = await linkedStaff('SALES_MANAGER', CHAT);
    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, firstName: 'Aziz', assignedToId: manager.id });
    const bot = captureBot();

    await press(`sl_st:${lead.id}:LOST`, CHAT).expect(200);
    expect(bot.last().text).toContain('sababini');
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('NEW');

    await message('x', CHAT).expect(200); // juda qisqa
    expect(bot.last().text).toContain('2 dan 255');

    await message('Narx qimmat dedi', CHAT).expect(200);
    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved).toMatchObject({ status: 'LOST', lostReason: 'Narx qimmat dedi' });
    expect(await telegramSessionService.get(String(CHAT))).toBeNull();
  });

  it('follow-uplar: bugungi ro‘yxat va bajarildi deb belgilash', async () => {
    const manager = await linkedStaff('SALES_MANAGER', CHAT);
    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, firstName: 'Kamola', assignedToId: manager.id });
    const followUp = await prisma.followUp.create({
      data: { leadId: lead.id, title: 'Qayta qo‘ng‘iroq', dueAt: new Date(Date.now() + 60 * 60_000), assignedToId: manager.id, createdById: manager.id },
    });
    const bot = captureBot();

    await message('/followup', CHAT).expect(200);
    expect(bot.lastData()).toContain(`sl_fud:${followUp.id}`);

    await press(`sl_fud:${followUp.id}`, CHAT).expect(200);
    expect(bot.last().text).toContain('Qayta qo‘ng‘iroq');
    expect(bot.lastData()).toContain(`sl_fuok:${followUp.id}`);

    await press(`sl_fuok:${followUp.id}`, CHAT).expect(200);
    expect(bot.last().text).toContain('bajarildi');
    expect((await prisma.followUp.findUniqueOrThrow({ where: { id: followUp.id } })).status).toBe('DONE');

    await press('sl_fu', CHAT).expect(200);
    expect(bot.last().text).toContain('follow-up yo‘q');
  });
});

describe.skipIf(!hasTestDatabase)('Telegram — rahbar paneli', () => {
  const CHAT = 2_001;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  it('ko‘rsatkichlar CRM dashboardidan olinadi', async () => {
    await linkedStaff('OWNER', CHAT);
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await prisma.student.create({
      data: { firstName: 'Faol', lastName: 'Talaba', phone: '+998901000001', courseId: course.id, groupId: group.id, contractPrice: 1_000_000, startDate: new Date('2026-06-01') },
    });
    const bot = captureBot();

    await message('/panel', CHAT).expect(200);

    expect(bot.last().text).toContain('Ko‘rsatkichlar');
    expect(bot.last().text).toContain('Faol o‘quvchilar: <b>1</b>');
  });

  it('qarzdorlar: eng kattalari, ruxsatsiz xodimga yopiq', async () => {
    await linkedStaff('ACCOUNTANT', CHAT);
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await prisma.student.create({
      data: {
        firstName: 'Qarzdor',
        lastName: 'Talaba',
        phone: '+998901000002',
        courseId: course.id,
        groupId: group.id,
        contractPrice: 2_000_000,
        startDate: new Date('2026-06-01'),
        debt: { create: { totalAmount: 2_000_000, paidAmount: 500_000, remainingAmount: 1_500_000, status: 'PARTIAL' } },
      },
    });
    const bot = captureBot();

    await message('/qarzdorlar', CHAT).expect(200);
    expect(bot.last().text).toContain('Qarzdor Talaba');
    // Pul formati — CRM'dagi bilan bir xil yordamchi
    expect(bot.last().text).toContain(moneyUz(1_500_000));

    // O'qituvchida debt.view yo'q
    await linkedStaff('TEACHER', 2_002, 'ustoz-qarz@local.uz');
    await press('ow_debts', 2_002).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    expect(bot.last().text).not.toContain('Qarzdor Talaba');
  });

  it('xavf ostidagilar va ogohlantirishlar bo‘sh holatlari', async () => {
    await linkedStaff('OWNER', CHAT);
    const bot = captureBot();

    await press('ow_risk', CHAT).expect(200);
    expect(bot.last().text).toContain('Xavf ostidagi o‘quvchi yo‘q');

    await press('ow_alerts', CHAT).expect(200);
    expect(bot.last().text).toMatch(/ogohlantirish yo‘q|ruxsatingiz yo‘q/);
  });
});
