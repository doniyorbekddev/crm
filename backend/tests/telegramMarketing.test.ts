import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { prisma } from '../src/config/database.js';
import { permissionService } from '../src/services/permission.service.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard, TelegramMedia } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { moneyUz } from '../src/telegram/format.js';
import { periodRange } from '../src/telegram/handlers/workspace.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { startOfBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createLead, createSource } from './helpers/fixtures.js';

/** TZ 3.1 GAP-11 — rahbar botda marketing: manba bo'yicha tushum, xarajat, foyda, ROI, davr, CSV */
const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const CHAT = 77_001;

function captureBot() {
  const shown: Array<{ text: string; keyboard: InlineKeyboard | undefined }> = [];
  const files: Array<{ media: TelegramMedia; caption: string | undefined }> = [];
  vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (_c: string, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false, messageId: 100 + shown.length };
  });
  vi.spyOn(telegram.telegramService, 'editMessageText').mockImplementation(async (_c: string, _i: number, text: string, keyboard?: InlineKeyboard) => {
    shown.push({ text, keyboard });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'sendMedia').mockImplementation(async (_c: string, media: TelegramMedia, caption?: string) => {
    files.push({ media, caption });
    return { ok: true, retryable: false };
  });
  vi.spyOn(telegram.telegramService, 'answerCallbackQuery').mockResolvedValue({ ok: true, retryable: false });
  return { files, last: () => shown.at(-1)!, data: () => (shown.at(-1)!.keyboard ?? []).flat().map((button) => button.data) };
}

const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
const message = (text: string, chat = CHAT) => post({ message: { message_id: 10, chat: { id: chat, first_name: 'S' }, from: { id: chat }, text } });
const press = (data: string, chat = CHAT) => post({ callback_query: { id: 'cb', data, from: { id: chat }, message: { message_id: 10, chat: { id: chat } } } });

async function linked(role: string, chat = CHAT) {
  const { user, token } = await createUserWithToken(app, { role });
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(`/start ${link.linkCode}`, chat);
  return { user, token };
}

describe('periodRange — biznes sana bo‘yicha davrlar', () => {
  it('bu oy, o‘tgan oy (yil chegarasida ham), 30 kun', () => {
    // 2026-01-10 03:00 Toshkent
    const now = new Date('2026-01-09T22:00:00Z');
    expect(periodRange('month', now)).toEqual({ from: '2026-01-01', to: '2026-01-10' });
    expect(periodRange('last', now)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('d30', now)).toEqual({ from: '2025-12-12', to: '2026-01-10' });
  });
});

describe.skipIf(!hasTestDatabase)('Telegram: marketing (GAP-11)', () => {
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

  async function setup() {
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const advert = await prisma.expenseCategory.create({ data: { key: 'ADVERTISEMENT', name: 'Reklama' } });
    const instagram = await createSource('Instagram');
    const telegramSource = await createSource('Telegram');
    const course = await createCourse('Frontend');
    const expense = (amount: number, sourceId: string | null) =>
      request(app).post('/api/expenses').set(bearer(accountant)).send({ method: 'CASH', categoryId: advert.id, amount, sourceId }).expect(201);
    await expense(1_000_000, instagram.id);
    await expense(3_000_000, telegramSource.id);
    await expense(200_000, null);
    const leads = [];
    for (let index = 0; index < 3; index += 1) leads.push(await createLead({ sourceId: instagram.id, courseId: course.id, phone: `+99893200000${index}` }));
    await createLead({ sourceId: telegramSource.id, courseId: course.id, phone: '+998932000009' });
    const student = (await request(app).post(`/api/leads/${leads[0]!.id}/convert`).set(bearer(admin)).send({ contractPrice: 3_000_000 }).expect(201)).body.data;
    await request(app).post('/api/payments').set(bearer(accountant)).send({ studentId: student.id, amount: 2_000_000, method: 'CASH' }).expect(201);
    return { instagram, telegramSource, course };
  }

  it('rahbar: manba bo‘yicha lead, konversiya, tushum, xarajat, foyda (manfiy ham), ROI — REST bilan bir xil', async () => {
    await setup();
    const { token } = await linked('OWNER');
    const bot = captureBot();
    const rest = (await request(app).get('/api/analytics/sources').query(periodRange('month')).set(bearer(token)).expect(200)).body.data;

    await press('ws_mkt').expect(200);
    const text = bot.last().text;
    expect(text).toContain('Bu oy');
    expect(text).toContain(`Leadlar: <b>${rest.totals.leads}</b> · o‘quvchi bo‘ldi: <b>1</b> (${rest.totals.conversion}%)`);
    expect(text).toContain(`Tushum: <b>${moneyUz(2_000_000)}</b> · xarajat: ${moneyUz(4_000_000)}`);
    expect(text).toContain(`Foyda: <b>−${moneyUz(2_000_000)}</b> · ROI <b>${rest.totals.roi}%</b>`);
    expect(text).toContain(`Manbaga bog‘lanmagan reklama xarajati: ${moneyUz(200_000)}`);
    const instagramRow = rest.rows.find((row: { name: string }) => row.name === 'Instagram');
    expect(text).toContain(`<b>Instagram</b>: 3 lead → 1 (${instagramRow.conversion}%)`);
    expect(text).toContain(`tushum ${moneyUz(2_000_000)} · xarajat ${moneyUz(1_000_000)} · foyda ${moneyUz(1_000_000)} · ROI 100%`);
    expect(text).toContain(`foyda −${moneyUz(3_000_000)} · ROI -100%`);
    expect(bot.data()).toEqual(expect.arrayContaining(['ws_mkt:month', 'ws_mkt:last', 'ws_mkt:d30', 'ws_mcsv:month']));
  });

  it('davr: o‘tgan oy ma’lumoti faqat “O‘tgan oy”da, joriy oy ma’lumoti unda yo‘q', async () => {
    const { instagram, course } = await setup();
    const old = await createLead({ sourceId: instagram.id, courseId: course.id, phone: '+998932000077' });
    await prisma.lead.update({ where: { id: old.id }, data: { createdAt: new Date(startOfBusinessMonth(new Date()).getTime() - 3 * 86_400_000) } });
    await linked('OWNER');
    const bot = captureBot();

    await press('ws_mkt:last').expect(200);
    expect(bot.last().text).toContain('O‘tgan oy');
    expect(bot.last().text).toContain('Leadlar: <b>1</b>');
    expect(bot.last().text).toContain('<b>Instagram</b>: 1 lead → 0 (0%)');
    expect(bot.data()).toContain('ws_mcsv:last');
    await press('ws_mkt:month').expect(200);
    expect(bot.last().text).toContain('Leadlar: <b>4</b>');
    // Noma'lum davr — joriy oy
    await press('ws_mkt:1999').expect(200);
    expect(bot.last().text).toContain('Bu oy');
  });

  it('CSV: chatga hujjat — REST eksport bilan bir xil ustunlar; formula injeksiyasi zararsizlanadi', async () => {
    const { instagram } = await setup();
    await prisma.source.update({ where: { id: instagram.id }, data: { name: '=HYPERLINK("x")' } });
    await linked('OWNER');
    const bot = captureBot();

    await press('ws_mcsv:month').expect(200);
    expect(bot.files).toHaveLength(1);
    const { media, caption } = bot.files[0]!;
    expect(media).toMatchObject({ kind: 'document', mimeType: 'text/csv' });
    if (!('buffer' in media)) throw new Error('buffer kutilgan');
    expect(media.fileName).toMatch(/^lead-manbalari-\d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = media.buffer.toString('utf8');
    expect(csv).toContain('Manba');
    expect(csv).toContain('ROI');
    expect(csv).toContain('Telegram');
    expect(csv).not.toMatch(/(^|[;,\n])"?=HYPERLINK/);
    expect(caption).toContain('Lead manbalari');
  });

  it('ruxsat: sotuv/buxgalter — rad; analytics.view bor, report.export yo‘q — CSV tugmasi yo‘q va callback rad', async () => {
    await setup();
    for (const [index, role] of ['SALES_MANAGER', 'ACCOUNTANT', 'TEACHER'].entries()) {
      const chat = CHAT + 10 + index;
      await linked(role, chat);
      const bot = captureBot();
      await press('ws_mkt', chat).expect(200);
      expect(bot.last().text).toContain('ruxsatingiz yo‘q');
      await press('ws_mcsv:month', chat).expect(200);
      expect(bot.last().text).toContain('ruxsatingiz yo‘q');
      expect(bot.files).toHaveLength(0);
    }

    const role = await prisma.role.create({ data: { key: 'ANALYST', name: 'Analitik', isSystem: false } });
    const permissions = await prisma.permission.findMany({ where: { key: { in: [PERMISSIONS.ANALYTICS_VIEW] } } });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
    await linked('ANALYST', CHAT + 20);
    const bot = captureBot();
    await press('ws_mkt', CHAT + 20).expect(200);
    expect(bot.last().text).toContain('Marketing');
    expect(bot.data().some((data) => data?.startsWith('ws_mcsv'))).toBe(false);
    await press('ws_mcsv:month', CHAT + 20).expect(200);
    expect(bot.last().text).toContain('ruxsatingiz yo‘q');
    expect(bot.files).toHaveLength(0);
  });
});
