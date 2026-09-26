import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { sendDueReminders, sendOverdueAlerts } from '../src/jobs/followUpReminder.job.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createLead, createSource } from './helpers/fixtures.js';

/**
 * TZ 3.1 GAP-09 / audit S4: follow-up eslatmasi Telegramga NotificationDelivery navbati orqali, xodim
 * sozlamasi va "ovozsiz" rejim hisobga olinadi; muhimlik maydoni (REST).
 */
const app = createApp();
const MINUTE = 60_000;
let chat = 80_000;

async function linkChat(userId: string, muted = false) {
  chat += 1;
  return prisma.telegramLink.create({ data: { userId, chatId: String(chat), linkCode: `fu-${chat}`, verifiedAt: new Date(), muted } });
}

describe.skipIf(!hasTestDatabase)('Follow-up eslatmasi Telegramga (S4) va muhimlik (GAP-09)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('eslatma va kechikish Telegram navbatiga; muhim follow-up belgisi; sozlama (telegram: false) va ovozsiz chat hurmat qilinadi', async () => {
    const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: quiet } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: muted } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const link = await linkChat(manager.id);
    await linkChat(quiet.id);
    await linkChat(muted.id, true);
    await prisma.notificationSetting.create({ data: { userId: quiet.id, type: 'FOLLOW_UP_REMINDER', inApp: true, telegram: false } });

    const source = await createSource();
    const now = new Date('2026-09-26T09:00:00.000Z');
    const at = (minutes: number) => new Date(now.getTime() + minutes * MINUTE);
    for (const owner of [manager, quiet, muted]) {
      const lead = await createLead({ sourceId: source.id, firstName: 'Aziz', assignedToId: owner.id });
      await prisma.followUp.create({ data: { leadId: lead.id, assignedToId: owner.id, title: 'Shartnoma', priority: 'URGENT', dueAt: at(30), remindAt: at(-1) } });
    }

    expect(await sendDueReminders(now)).toBe(3);
    // Ilova ichida — hammaga
    expect(await prisma.notification.count({ where: { type: 'FOLLOW_UP_REMINDER' } })).toBe(3);
    // Telegram — faqat sozlamasi yoqilgan va ovozsiz bo'lmagan chatga
    const deliveries = await prisma.notificationDelivery.findMany({ where: { channel: 'TELEGRAM' }, select: { telegramLinkId: true, title: true, body: true, status: true } });
    expect(deliveries).toEqual([expect.objectContaining({ telegramLinkId: link.id, title: 'Follow-up eslatmasi', status: 'PENDING' })]);
    expect(deliveries[0]!.body).toContain('🔴 Aziz');

    // Kechikish ham shu yo'l bilan; takror yurishda dublikat yo'q
    expect(await sendOverdueAlerts(at(60))).toBe(3);
    expect(await prisma.notificationDelivery.count({ where: { channel: 'TELEGRAM', title: 'Follow-up muddati o‘tdi' } })).toBe(2);
    expect(await sendDueReminders(at(61))).toBe(0);
    expect(await sendOverdueAlerts(at(62))).toBe(0);
    expect(await prisma.notificationDelivery.count({ where: { channel: 'TELEGRAM' } })).toBe(3);
  });

  it('REST: muhimlik saqlanadi (standart MEDIUM), tahrirda o‘zgaradi, noto‘g‘ri qiymat — 422', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, assignedToId: user.id });
    const dueAt = new Date(Date.now() + 86_400_000).toISOString();

    const plain = await request(app).post('/api/follow-ups').set(bearer(token)).send({ leadId: lead.id, title: 'Oddiy', dueAt });
    expect(plain.status).toBe(201);
    expect(plain.body.data.priority).toBe('MEDIUM');
    const high = await request(app).post('/api/follow-ups').set(bearer(token)).send({ leadId: lead.id, title: 'Muhim', dueAt, priority: 'HIGH' });
    expect(high.body.data.priority).toBe('HIGH');
    const edited = await request(app).put(`/api/follow-ups/${plain.body.data.id}`).set(bearer(token)).send({ title: 'Oddiy', dueAt, priority: 'URGENT' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.priority).toBe('URGENT');
    // Muhimlik berilmasa tahrir uni o'zgartirmaydi
    const kept = await request(app).put(`/api/follow-ups/${plain.body.data.id}`).set(bearer(token)).send({ title: 'Oddiy 2', dueAt });
    expect(kept.body.data.priority).toBe('URGENT');
    expect((await request(app).post('/api/follow-ups').set(bearer(token)).send({ leadId: lead.id, title: 'Xato', dueAt, priority: 'SUPER' })).status).toBe(422);
  });
});
