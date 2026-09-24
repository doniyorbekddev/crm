import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import * as telegram from '../src/services/telegram.service.js';
import type { InlineKeyboard } from '../src/services/telegram.service.js';
import { telegramLinkService } from '../src/services/telegramLink.service.js';
import { parseLocalDateTime } from '../src/telegram/format.js';
import { resetRateLimits } from '../src/telegram/rateLimit.js';
import { telegramSessionService } from '../src/telegram/session.service.js';
import { businessDateString } from '../src/utils/dates.js';
import { createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();
const WEBHOOK_SECRET = 'test-telegram-webhook-secret';
const CHAT_ID = 909_001;

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
/** Bot "bugun"ni o'quv markaz vaqti bo'yicha hisoblaydi — test ham shunday */
function todayWeekday() {
  return WEEKDAYS[new Date(`${businessDateString(new Date())}T00:00:00.000Z`).getUTCDay()]!;
}

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
    lastButtons: () => (shown.at(-1)!.keyboard ?? []).flat(),
  };
}

function post(body: object) {
  return request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);
}
function message(text: string, chatId = CHAT_ID) {
  return post({ message: { message_id: 10, chat: { id: chatId, first_name: 'Ustoz' }, from: { id: 700 }, text } });
}
function press(data: string, chatId = CHAT_ID) {
  return post({ callback_query: { id: 'cb', data, from: { id: 700 }, message: { message_id: 10, chat: { id: chatId } } } });
}

async function createStudent(courseId: string, groupId: string, firstName: string) {
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId,
      contractPrice: 500_000,
      startDate: new Date('2026-06-01'),
    },
  });
}

/** O'qituvchi + o'z guruhi (bugun dars kuni) + 3 o'quvchi, chat bog'langan */
async function linkedTeacher(chatId = CHAT_ID) {
  const { user } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: user.id, scheduleDays: [todayWeekday()], name: 'Frontend-1' });
  const students = [];
  for (const name of ['Ali', 'Vali', 'Hasan']) students.push(await createStudent(course.id, group.id, name));
  const link = await telegramLinkService.ensureLink({ userId: user.id });
  await message(`/start ${link.linkCode}`, chatId);
  return { user, course, group, students };
}

describe('Sana o‘qish (parseLocalDateTime)', () => {
  it('kun.oy.yil va vaqt; yo‘q bo‘lsa kun oxiri; noto‘g‘ri sana rad etiladi', () => {
    const full = parseLocalDateTime('25.12.2026 18:00')!;
    expect(full).not.toBeNull();
    expect(businessDateString(full)).toBe('2026-12-25');

    const dayOnly = parseLocalDateTime('25.12.2026')!;
    // 23:59 mahalliy — sana o'sha kun bo'lib qoladi
    expect(businessDateString(dayOnly)).toBe('2026-12-25');
    expect(dayOnly.getTime()).toBeGreaterThan(full.getTime());

    expect(parseLocalDateTime('31.02.2026')).toBeNull();
    expect(parseLocalDateTime('ertaga')).toBeNull();
    expect(parseLocalDateTime('25.12.2026 25:00')).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)('Telegram — o‘qituvchi boti', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    resetRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘qituvchi menyusida guruhlar va bugungi darslar bor, o‘quvchida yo‘q', async () => {
    await linkedTeacher();
    const bot = captureBot();

    await message('/start').expect(200);
    expect(bot.lastData()).toEqual(expect.arrayContaining(['tc_today', 'tc_groups', 'cmd:/holat', 'cmd:/uzish']));
    expect(bot.lastData().some((item) => item.startsWith('st_'))).toBe(false);

    // Davomat huquqi yo'q xodim (buxgalter) — o'qituvchi tugmalari chiqmaydi
    const { user: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'buxgalter-tg@local.uz' });
    const link = await telegramLinkService.ensureLink({ userId: accountant.id });
    await message(`/start ${link.linkCode}`, 909_002);
    await message('/start', 909_002).expect(200);
    expect(bot.lastData()).not.toContain('tc_today');
    expect(bot.lastData()).not.toContain('tc_groups');
  });

  it('guruhlar ro‘yxatida faqat o‘z guruhlari', async () => {
    const { group, course } = await linkedTeacher();
    const { user: other } = await createUserWithToken(app, { role: 'TEACHER', email: 'boshqa-ustoz@local.uz' });
    const foreign = await createGroup({ courseId: course.id, teacherId: other.id, name: 'Begona guruh' });
    const bot = captureBot();

    await message('/guruhlar').expect(200);

    const data = bot.lastData();
    expect(data).toContain(`tc_group:${group.id}`);
    expect(data).not.toContain(`tc_group:${foreign.id}`);
    expect(bot.last().text).toContain('1 ta');

    // Begona guruhga to'g'ridan-to'g'ri id bilan ham kirib bo'lmaydi
    await press(`tc_group:${foreign.id}`).expect(200);
    expect(bot.last().text).toContain('❌');
    expect(bot.last().text).not.toContain('Begona guruh');
  });

  it('bugungi darslar: dars kuni bo‘lgan guruh va davomat tugmasi', async () => {
    const { group } = await linkedTeacher();
    const bot = captureBot();

    await press('tc_today').expect(200);

    expect(bot.last().text).toContain('Frontend-1');
    expect(bot.last().text).toContain('davomat 0/3');
    expect(bot.lastData()).toContain(`tc_att:${group.id}`);
  });

  it('tezkor davomat: hammasi «keldi», tugma bilan almashtiriladi, saqlanadi', async () => {
    const { group, students } = await linkedTeacher();
    const [ali, vali] = students;
    const bot = captureBot();

    await press(`tc_att:${group.id}`).expect(200);
    // Belgilanmaganlar "keldi" deb boshlanadi — o'qituvchi faqat kelmaganlarni bosadi
    expect(bot.lastButtons().filter((b) => b.data.startsWith('tc_tog:')).every((b) => b.text.startsWith('✅'))).toBe(true);
    expect(bot.last().text).toContain('✅ 3 · ❌ 0');

    await press(`tc_tog:${ali!.id}`).expect(200); // → kelmadi
    expect(bot.last().text).toContain('✅ 2 · ❌ 1');
    await press(`tc_tog:${vali!.id}`).expect(200); // → kelmadi
    await press(`tc_tog:${vali!.id}`).expect(200); // → kechikdi
    expect(bot.last().text).toContain('⏰ 1');
    // Begona id — e'tiborsiz, varaq o'zgarmaydi
    await press('tc_tog:begona').expect(200);
    expect(bot.last().text).toContain('✅ 1 · ❌ 1 · ⏰ 1');

    await press('tc_save').expect(200);

    expect(bot.last().text).toContain('Davomat saqlandi');
    expect(bot.last().text).toContain('Keldi: 1');
    const rows = await prisma.attendance.findMany({ where: { groupId: group.id }, select: { studentId: true, status: true } });
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.studentId === ali!.id)?.status).toBe('ABSENT');
    expect(rows.find((r) => r.studentId === vali!.id)?.status).toBe('LATE');
    // Oqim yopildi
    expect(await telegramSessionService.get(String(CHAT_ID))).toBeNull();
    // Audit — bot orqali ekani ko'rinadi
    const audit = await prisma.auditLog.findFirst({ where: { action: { startsWith: 'attendance' } } });
    expect(audit?.userAgent).toBe('telegram-bot');
  });

  it('davomat varag‘i ochiq bo‘lganda boshqa bo‘limga o‘tish uni bekor qiladi', async () => {
    const { group } = await linkedTeacher();
    captureBot();

    await press(`tc_att:${group.id}`).expect(200);
    expect(await telegramSessionService.get(String(CHAT_ID))).toMatchObject({ flow: 'attendance' });

    await press('tc_groups').expect(200);
    expect(await telegramSessionService.get(String(CHAT_ID))).toBeNull();
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('vazifa berish oqimi: sarlavha → muddat → tavsif → tasdiq', async () => {
    const { group, user } = await linkedTeacher();
    const bot = captureBot();

    await press(`tc_hw:${group.id}`).expect(200);
    expect(bot.last().text).toContain('sarlavhasini');

    await message('ab').expect(200); // juda qisqa
    expect(bot.last().text).toContain('3 dan 200');

    await message('5-mashq, 12-bet').expect(200);
    expect(bot.last().text).toContain('Muddatni');

    await message('kecha').expect(200);
    expect(bot.last().text).toContain('tushunarsiz');
    await message('01.01.2020').expect(200);
    expect(bot.last().text).toContain('o‘tib ketgan');

    await message('31.12.2030 18:00').expect(200);
    expect(bot.last().text).toContain('Tavsif');

    await message('-').expect(200);
    expect(bot.last().text).toContain('E’lon qilinsinmi');
    expect(bot.lastData()).toContain('tc_hwok');
    expect(await prisma.homework.count()).toBe(0);

    await press('tc_hwok').expect(200);

    expect(bot.last().text).toContain('e’lon qilindi');
    const homework = await prisma.homework.findFirstOrThrow({ include: { submissions: true } });
    expect(homework).toMatchObject({ title: '5-mashq, 12-bet', groupId: group.id, status: 'PUBLISHED', teacherId: user.id, description: null });
    expect(businessDateString(homework.deadline)).toBe('2030-12-31');
    // Har faol o'quvchiga topshiriq ochildi — CRM servisining ishi, bot takrorlamaydi
    expect(homework.submissions).toHaveLength(3);
    expect(await telegramSessionService.get(String(CHAT_ID))).toBeNull();
  });

  it('buyruq yozilsa vazifa oqimi bekor bo‘ladi', async () => {
    const { group } = await linkedTeacher();
    const bot = captureBot();

    await press(`tc_hw:${group.id}`).expect(200);
    await message('/start').expect(200);

    expect(bot.last().text).toContain('Kerakli bo‘limni tanlang');
    expect(await telegramSessionService.get(String(CHAT_ID))).toBeNull();
  });

  it('o‘quvchilar ro‘yxati va bloklangan xodim', async () => {
    const { group, user } = await linkedTeacher();
    const bot = captureBot();

    await press(`tc_students:${group.id}`).expect(200);
    expect(bot.last().text).toContain('3 o‘quvchi');
    expect(bot.last().text).toContain('Ali');

    // Bloklangan xodim bot orqali ham ishlay olmaydi
    await prisma.user.update({ where: { id: user.id }, data: { status: 'BLOCKED' } });
    await press('tc_groups').expect(200);
    expect(bot.last().text).toContain('egasi topilmadi');
  });
});
