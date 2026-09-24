/* eslint-disable no-console -- CLI skript: o‘lchov natijasi terminalga chiqariladi */
/**
 * Telegram bot yuklama sinovi (PHASE 14).
 *
 *   DATABASE_URL="postgresql://crm:...@localhost:5432/crm_test" npm run telegram:load -- 300
 *
 * Nima o'lchanadi: webhook → router → servis → javob zanjirining kechikishi (p50/p95/p99)
 * va sekundiga nechta update ishlanishi. Telegram API **chaqirilmaydi** — `sendMessage`
 * o'rniga hisoblagich qo'yiladi, shuning uchun natija faqat bizning kodimiz va bazani ko'rsatadi.
 *
 * Xavfsizlik: faqat nomida "test" yoki "perf" bo'lgan bazada ishlaydi — skript o'z yozuvlarini
 * yaratadi va oxirida o'chiradi, lekin ishchi bazada baribir yurgizilmaydi.
 */
import { config } from 'dotenv';

config({ quiet: true });

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const PREFIX = 'load-';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!/test|perf/i.test(url)) {
    console.error('DATABASE_URL sinov bazasini ko‘rsatishi kerak (nomida "test" yoki "perf").');
    process.exit(1);
  }
  if (!WEBHOOK_SECRET) {
    console.error('TELEGRAM_WEBHOOK_SECRET kerak — webhook imzosi tekshiriladi.');
    process.exit(1);
  }

  const chats = Math.max(10, Number(process.argv[2] ?? '200'));
  const { createApp } = await import('../src/app.js');
  const { prisma } = await import('../src/config/database.js');
  const { telegramService } = await import('../src/services/telegram.service.js');
  const { default: request } = await import('supertest');

  // Telegram API o'rniga hisoblagich — tarmoq o'lchovga aralashmasin
  let outgoing = 0;
  telegramService.sendMessage = async () => {
    outgoing += 1;
    return { ok: true, retryable: false, messageId: outgoing };
  };
  telegramService.editMessageText = async () => {
    outgoing += 1;
    return { ok: true, retryable: false };
  };
  telegramService.answerCallbackQuery = async () => ({ ok: true, retryable: false });

  const app = createApp();
  const post = (body: object) => request(app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', WEBHOOK_SECRET).send(body);

  // --- Sinov ma'lumoti: kurs, guruh, N o'quvchi, har biri bog'langan ---
  console.log(`Tayyorgarlik: ${chats} ta bog'langan o'quvchi...`);
  const course = await prisma.course.create({ data: { name: `${PREFIX}kurs-${Date.now()}`, durationMonths: 3, price: 1, finalPrice: 1 } });
  const group = await prisma.group.create({
    data: { name: `${PREFIX}guruh`, courseId: course.id, capacity: chats, scheduleDays: ['MONDAY'], startTime: '10:00', endTime: '12:00', startDate: new Date(), status: 'ACTIVE' },
  });
  const chatIds: string[] = [];
  for (let index = 0; index < chats; index += 1) {
    const student = await prisma.student.create({
      data: {
        firstName: `${PREFIX}${index}`,
        lastName: 'Sinov',
        phone: `+9989${String(90_000_000 + index)}`,
        courseId: course.id,
        groupId: group.id,
        contractPrice: 1_000_000,
        startDate: new Date(),
        debt: { create: { totalAmount: 1_000_000, remainingAmount: 500_000 } },
      },
    });
    const chatId = String(9_000_000 + index);
    await prisma.telegramLink.create({ data: { studentId: student.id, linkCode: `${PREFIX}${index}`, chatId, verifiedAt: new Date() } });
    chatIds.push(chatId);
  }

  const scenarios: Array<{ name: string; body: (chatId: string) => object }> = [
    { name: '/start (menyu)', body: (chatId) => ({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, from: { id: Number(chatId) }, text: '/start' } }) },
    { name: 'st_pay (qarz)', body: (chatId) => ({ callback_query: { id: 'cb', data: 'st_pay', from: { id: Number(chatId) }, message: { message_id: 1, chat: { id: Number(chatId), type: 'private' } } } }) },
    { name: 'st_hw (vazifalar)', body: (chatId) => ({ callback_query: { id: 'cb', data: 'st_hw', from: { id: Number(chatId) }, message: { message_id: 1, chat: { id: Number(chatId), type: 'private' } } } }) },
    { name: 'st_att (davomat)', body: (chatId) => ({ callback_query: { id: 'cb', data: 'st_att', from: { id: Number(chatId) }, message: { message_id: 1, chat: { id: Number(chatId), type: 'private' } } } }) },
  ];

  try {
    for (const scenario of scenarios) {
      const latencies: number[] = [];
      const started = Date.now();
      // 10 ta parallel "foydalanuvchi" — Telegram webhook'i ham shunday keladi
      const concurrency = 10;
      let cursor = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (cursor < chatIds.length) {
            const chatId = chatIds[cursor]!;
            cursor += 1;
            const t0 = performance.now();
            const response = await post(scenario.body(chatId));
            latencies.push(performance.now() - t0);
            if (response.status !== 200) console.warn(`  ${scenario.name}: HTTP ${response.status}`);
          }
        }),
      );
      const total = (Date.now() - started) / 1000;
      const sorted = [...latencies].sort((a, b) => a - b);
      console.log(
        `${scenario.name.padEnd(20)} ${chats} update · ${(chats / total).toFixed(0)} update/s · p50 ${percentile(sorted, 50).toFixed(0)} ms · p95 ${percentile(sorted, 95).toFixed(0)} ms · p99 ${percentile(sorted, 99).toFixed(0)} ms`,
      );
    }
    console.log(`\nChiquvchi xabarlar (Telegram o'rniga hisoblagich): ${outgoing}`);
    const throttled = await prisma.telegramEvent.count({ where: { status: 'THROTTLED', chatId: { in: chatIds } } });
    const failed = await prisma.telegramEvent.count({ where: { status: 'FAILED', chatId: { in: chatIds } } });
    console.log(`Chegaradan oshgan: ${throttled} · xato: ${failed}`);
  } finally {
    // O'z yozuvlarini tozalash — sinov bazasi bo'lsa ham iz qoldirmaslik
    await prisma.telegramEvent.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.telegramSession.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.telegramLink.deleteMany({ where: { linkCode: { startsWith: PREFIX } } });
    await prisma.student.deleteMany({ where: { firstName: { startsWith: PREFIX } } });
    await prisma.group.delete({ where: { id: group.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.$disconnect();
  }
}

void main();
