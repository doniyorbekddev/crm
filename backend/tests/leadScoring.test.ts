import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { computeLeadScore, leadScoreService, temperatureFor } from '../src/services/leadScore.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createSource } from './helpers/fixtures.js';

const app = createApp();
const DAY = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

describe('Lead scoring hisobi (sof funksiya)', () => {
  const base = {
    status: 'NEW' as const,
    courseId: null,
    lastContactedAt: null,
    nextFollowUpAt: null,
    createdAt: new Date(),
    calls: [],
    sourceConversion: null,
  };

  it('bosqich oshgani sari ball ortadi', () => {
    const fresh = computeLeadScore({ ...base, status: 'NEW' });
    const trial = computeLeadScore({ ...base, status: 'TRIAL_ATTENDED' });

    expect(trial.score).toBeGreaterThan(fresh.score);
    expect(fresh.temperature).toBe('COLD');
    expect(trial.temperature).toBe('WARM');
  });

  it('rad javobi ballni pasaytiradi, qiziqish esa oshiradi', () => {
    const refused = computeLeadScore({ ...base, status: 'CONTACTED', calls: [{ result: 'NOT_INTERESTED' }] });
    const interested = computeLeadScore({ ...base, status: 'CONTACTED', calls: [{ result: 'INTERESTED' }] });

    expect(refused.score).toBeLessThan(interested.score);
    expect(interested.reasons.join(' ')).toContain('qiziqish');
  });

  it('uzoq vaqt aloqa bo‘lmasa lead sovuydi', () => {
    const recent = computeLeadScore({ ...base, status: 'INTERESTED', lastContactedAt: new Date() });
    const stale = computeLeadScore({ ...base, status: 'INTERESTED', lastContactedAt: daysAgo(40) });

    expect(stale.score).toBeLessThan(recent.score);
    expect(stale.factors.find((factor) => factor.key === 'recency')?.points).toBeLessThan(0);
  });

  it('ball 0–100 oralig‘idan chiqmaydi va daraja to‘g‘ri aniqlanadi', () => {
    const negative = computeLeadScore({ ...base, status: 'LOST', calls: [{ result: 'NOT_INTERESTED' }], lastContactedAt: daysAgo(90) });

    expect(negative.score).toBe(0);
    expect(temperatureFor(0)).toBe('COLD');
    expect(temperatureFor(45)).toBe('WARM');
    expect(temperatureFor(75)).toBe('HOT');
    expect(temperatureFor(95)).toBe('VERY_HOT');
  });
});

describe.skipIf(!hasTestDatabase)('Lead scoring va avtomatik taqsimot (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createLead(token: string, sourceId: string, name: string) {
    const response = await request(app)
      .post('/api/leads')
      .set(bearer(token))
      .send({ firstName: name, phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`, sourceId });
    expect(response.status).toBe(201);
    return response.body.data;
  }

  it('ball hisoblanadi va ro‘yxatda daraja bo‘yicha filtrlash mumkin', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const source = await createSource();
    const lead = await createLead(token, source.id, 'Qiziqqan');
    await request(app).patch(`/api/leads/${lead.id}/status`).set(bearer(token)).send({ status: 'TRIAL_ATTENDED' });

    const result = await leadScoreService.recalculateAll();
    const scored = await request(app).get(`/api/leads/${lead.id}/score`).set(bearer(token));
    const warm = await request(app).get('/api/leads').query({ temperature: 'WARM' }).set(bearer(token));
    const hot = await request(app).get('/api/leads').query({ temperature: 'VERY_HOT' }).set(bearer(token));

    expect(result.updated).toBe(1);
    expect(scored.body.data.score).toBeGreaterThan(40);
    expect(scored.body.data.factors).toHaveLength(7);
    expect(warm.body.data).toHaveLength(1);
    expect(hot.body.data).toHaveLength(0);
  });

  it('avtomatik taqsimot: navbat bo‘yicha va vazn hisobga olinadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: first } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'birinchi@test.uz' });
    const { user: second } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'ikkinchi@test.uz' });
    const source = await createSource();

    await request(app)
      .put('/api/leads/assignment-rules')
      .set(bearer(token))
      .send({
        rules: [
          { userId: first.id, weight: 2, dailyLimit: 0, isActive: true },
          { userId: second.id, weight: 1, dailyLimit: 0, isActive: true },
        ],
      });

    const created = [];
    for (const name of ['Bir', 'Ikki', 'Uch']) {
      created.push(await createLead(token, source.id, name));
    }

    const assignees = created.map((lead: { assignedTo: { id: string } | null }) => lead.assignedTo?.id);
    // Hammasi biriktirilgan va ikkala xodim ham lead olgan
    expect(assignees.every(Boolean)).toBe(true);
    expect(new Set(assignees).size).toBe(2);
    // Vazni 2 bo'lgan xodim ko'proq oldi
    expect(assignees.filter((id) => id === first.id).length).toBeGreaterThan(assignees.filter((id) => id === second.id).length);
  });

  it('kunlik limitga yetgan xodim navbatdan chetlatiladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: limited } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'cheklangan@test.uz' });
    const source = await createSource();
    await request(app)
      .put('/api/leads/assignment-rules')
      .set(bearer(token))
      .send({ rules: [{ userId: limited.id, weight: 1, dailyLimit: 1, isActive: true }] });

    const first = await createLead(token, source.id, 'Birinchi');
    const second = await createLead(token, source.id, 'Ikkinchi');

    expect(first.assignedTo?.id).toBe(limited.id);
    // Limit tugadi — ikkinchisi biriktirilmagan qoladi (jarayon to'xtamaydi)
    expect(second.assignedTo).toBeNull();
  });

  it('qoida yo‘q bo‘lsa lead biriktirilmagan qoladi, qo‘lda biriktirish ustun turadi', async () => {
    const { token, user: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'qol@test.uz' });
    const source = await createSource();

    const auto = await createLead(token, source.id, 'Avtomatsiz');
    await request(app)
      .put('/api/leads/assignment-rules')
      .set(bearer(token))
      .send({ rules: [{ userId: manager.id, weight: 1, dailyLimit: 0, isActive: true }] });
    const manual = await request(app)
      .post('/api/leads')
      .set(bearer(token))
      .send({ firstName: 'Qo‘lda', phone: '+998901234567', sourceId: source.id, assignedToId: admin.id });

    expect(auto.assignedTo).toBeNull();
    // Qo'lda ko'rsatilgan mas'ul avtomatikadan ustun
    expect(manual.body.data.assignedTo.id).toBe(admin.id);
  });

  it('taqsimot qoidalari faqat lead.assign ruxsati bilan o‘zgaradi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: callCenter } = await createUserWithToken(app, { role: 'CALL_CENTER' });

    const byCallCenter = await request(app).put('/api/leads/assignment-rules').set(bearer(callCenter)).send({ rules: [] });
    const byAdmin = await request(app).get('/api/leads/assignment-rules').set(bearer(admin));

    expect(byCallCenter.status).toBe(403);
    expect(byAdmin.status).toBe(200);
  });

  it('voronka bosqichlariga o‘tish vaqti hisoblanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const source = await createSource();
    const lead = await createLead(token, source.id, 'Vaqt');
    await request(app).patch(`/api/leads/${lead.id}/status`).set(bearer(token)).send({ status: 'CONTACTED' });
    // Lead 4 kun oldin yaratilgan deb ko'rsatamiz
    await prisma.lead.update({ where: { id: lead.id }, data: { createdAt: new Date(Date.now() - 4 * DAY) } });

    const funnel = await request(app).get('/api/dashboard/funnel').set(bearer(token));
    const contacted = funnel.body.data.find((stage: { status: string }) => stage.status === 'CONTACTED');

    expect(contacted.avgDaysToReach).toBeGreaterThanOrEqual(3.9);
    // Hali hech kim yetmagan bosqichda ma'lumot yo'q
    expect(funnel.body.data.find((stage: { status: string }) => stage.status === 'WON').avgDaysToReach).toBeNull();
  });
});
