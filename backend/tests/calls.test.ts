import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

describe.skipIf(!hasTestDatabase)('Calls API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('call.view ruxsati yo‘q rolga 403 qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).get('/api/calls').set(bearer(token))).status).toBe(403);
  });

  it('qo‘ng‘iroqni yozadi, timeline va leadning oxirgi aloqa sanasini yangilaydi', async () => {
    const source = await createSource();
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: user.id });

    const response = await request(app).post('/api/calls').set(bearer(token)).send({
      leadId: lead.id,
      result: 'INTERESTED',
      durationSec: 180,
      notes: 'Kurs narxi aytildi',
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      leadId: lead.id,
      direction: 'OUTGOING',
      status: 'COMPLETED',
      result: 'INTERESTED',
      durationSec: 180,
      manager: { id: user.id },
    });
    expect(response.body.data.lead.code).toMatch(/^L-\d{6}$/);

    const activity = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: lead.id, type: 'CALL_LOGGED' } });
    expect(activity.description).toBe('Qo‘ng‘iroq: Qiziqdi, 3 daqiqa. Kurs narxi aytildi');
    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.lastContactedAt).not.toBeNull();
  });

  it('"keyingi qo‘ng‘iroq" ko‘rsatilsa avtomatik follow-up yaratadi', async () => {
    const source = await createSource();
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: user.id });
    const nextCallAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const response = await request(app)
      .post('/api/calls')
      .set(bearer(token))
      .send({ leadId: lead.id, result: 'CALLBACK', nextCallAt: nextCallAt.toISOString() });

    expect(response.status).toBe(201);
    const followUp = await prisma.followUp.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(followUp.title).toBe('Qayta qo‘ng‘iroq qilish');
    expect(followUp.assignedToId).toBe(user.id);
    expect(followUp.dueAt.toISOString()).toBe(nextCallAt.toISOString());
    // Eslatma muddatdan 30 daqiqa oldin
    expect(followUp.remindAt?.getTime()).toBe(nextCallAt.getTime() - 30 * 60 * 1000);
    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.nextFollowUpAt?.toISOString()).toBe(nextCallAt.toISOString());
  });

  it('boshqa managerning leadiga qo‘ng‘iroq yozib bo‘lmaydi va u ro‘yxatda ko‘rinmaydi', async () => {
    const source = await createSource();
    const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const foreignLead = await createLead({ sourceId: source.id, assignedToId: other.id });

    const created = await request(app)
      .post('/api/calls')
      .set(bearer(adminToken))
      .send({ leadId: foreignLead.id, result: 'ANSWERED' });
    const salesAttempt = await request(app).post('/api/calls').set(bearer(salesToken)).send({ leadId: foreignLead.id, result: 'ANSWERED' });
    const salesList = await request(app).get('/api/calls').set(bearer(salesToken));
    const adminList = await request(app).get('/api/calls').set(bearer(adminToken));

    expect(created.status).toBe(201);
    expect(salesAttempt.status).toBe(404);
    expect(salesList.body.data).toHaveLength(0);
    expect(adminList.body.data).toHaveLength(1);
  });

  it('leadId va managerId bo‘yicha filtrlaydi, tahrirlaydi va o‘chiradi', async () => {
    const source = await createSource();
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const leadA = await createLead({ sourceId: source.id, assignedToId: user.id });
    const leadB = await createLead({ sourceId: source.id, assignedToId: user.id });
    const callA = await request(app).post('/api/calls').set(bearer(token)).send({ leadId: leadA.id, result: 'ANSWERED' });
    await request(app).post('/api/calls').set(bearer(adminToken)).send({ leadId: leadB.id, result: 'NO_ANSWER' });

    const byLead = await request(app).get('/api/calls').query({ leadId: leadA.id }).set(bearer(adminToken));
    const mine = await request(app).get('/api/calls').query({ managerId: 'me' }).set(bearer(token));
    const updated = await request(app)
      .put(`/api/calls/${callA.body.data.id}`)
      .set(bearer(token))
      .send({ result: 'NOT_INTERESTED', durationSec: 30, status: 'COMPLETED' });
    const removed = await request(app).delete(`/api/calls/${callA.body.data.id}`).set(bearer(token));

    expect(byLead.body.data).toHaveLength(1);
    expect(mine.body.data).toHaveLength(1);
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ result: 'NOT_INTERESTED', durationSec: 30 });
    expect(removed.status).toBe(200);
    expect(await prisma.call.count({ where: { leadId: leadA.id } })).toBe(0);
  });
});
