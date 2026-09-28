import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { notificationDeliveryService } from '../src/services/notificationDelivery.service.js';
import * as telegram from '../src/services/telegram.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * TZ 3.1 §42 — ommaviy xabar katta auditoriya bilan: 1500 ta Telegram chat. Yuborish (auditoriya + navbat) tez,
 * navbat bitta yurishda ≤ 1000 ta (Telegram chegarasi uchun), qolgani keyingi yurishda; takror va yo'qotish yo'q.
 */
const app = createApp();
const AUDIENCE = 1500;

describe.skipIf(!hasTestDatabase)('Ommaviy xabar — katta auditoriya (yuk)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(`${AUDIENCE} ta chat: navbatga tez, partiyalab to‘liq yuboriladi, dublikatsiz`, async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, name: 'Yuk guruhi' });
    await prisma.student.createMany({
      data: Array.from({ length: AUDIENCE }, (_, index) => ({
        id: `load-student-${index}`,
        firstName: `S${index}`,
        lastName: 'Yuk',
        phone: `+99877${String(1_000_000 + index).slice(-7)}`,
        courseId: course.id,
        groupId: group.id,
        contractPrice: 1,
        startDate: new Date('2026-01-01'),
      })),
    });
    await prisma.telegramLink.createMany({
      data: Array.from({ length: AUDIENCE }, (_, index) => ({ studentId: `load-student-${index}`, linkCode: `load-${index}`, chatId: String(900_000 + index), verifiedAt: new Date() })),
    });

    const sentTo = new Set<string>();
    let calls = 0;
    vi.spyOn(telegram.telegramService, 'sendMessage').mockImplementation(async (chatId: string) => {
      calls += 1;
      sentTo.add(chatId);
      return { ok: true, retryable: false };
    });

    const started = Date.now();
    const response = await request(app).post('/api/telegram/broadcasts').set(bearer(token)).send({ audience: 'GROUP', targetId: group.id, message: 'Yuk sinovi' }).expect(200);
    const enqueueMs = Date.now() - started;
    expect(response.body.data.recipients).toBe(AUDIENCE);
    expect(await prisma.notificationDelivery.count({ where: { broadcastId: response.body.data.id } })).toBe(AUDIENCE);
    expect(enqueueMs).toBeLessThan(10_000);

    const firstStarted = Date.now();
    const first = await notificationDeliveryService.processQueue(new Date());
    const firstMs = Date.now() - firstStarted;
    expect(first.sent).toBe(1000);
    const second = await notificationDeliveryService.processQueue(new Date());
    expect(second.sent).toBe(AUDIENCE - 1000);

    expect(calls).toBe(AUDIENCE);
    expect(sentTo.size).toBe(AUDIENCE);
    expect(await prisma.notificationDelivery.count({ where: { status: 'SENT' } })).toBe(AUDIENCE);
    // Bir yurish 50 s byudjetdan ancha kam (Telegram tarmog'isiz — DB tomoni)
    expect(firstMs).toBeLessThan(50_000);
    // eslint-disable-next-line no-console -- yuk natijasi hisobot uchun
    console.log(`broadcast load: enqueue ${enqueueMs} ms, 1000 ta yuborish (DB) ${firstMs} ms`);
  }, 180_000);
});
