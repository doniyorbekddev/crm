import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

/** Vaqt qotirilgan: "bugun / ertaga / kechikkan" bo‘limlari test qaysi soatda ishlashiga bog‘liq bo‘lmaydi. */
const NOW = new Date('2026-09-15T09:00:00+05:00');
const YESTERDAY = new Date('2026-09-14T16:00:00+05:00');
const LATER_TODAY = new Date('2026-09-15T15:00:00+05:00');
const TOMORROW = new Date('2026-09-16T10:00:00+05:00');
const NEXT_WEEK = new Date('2026-09-18T10:00:00+05:00');

describe.skipIf(!hasTestDatabase)('Follow-ups API (integratsion)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('followup.view ruxsati yo‘q rolga 403 qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).get('/api/follow-ups').set(bearer(token))).status).toBe(403);
  });

  it('follow-up yaratadi, leadning keyingi aloqa sanasini va timeline’ni yangilaydi', async () => {
    const source = await createSource();
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: user.id });

    const response = await request(app)
      .post('/api/follow-ups')
      .set(bearer(token))
      .send({ leadId: lead.id, title: 'Sinov darsiga taklif qilish', dueAt: TOMORROW.toISOString() });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      title: 'Sinov darsiga taklif qilish',
      status: 'PENDING',
      state: 'PENDING',
      assignedTo: { id: user.id },
      lead: { id: lead.id },
    });
    expect(new Date(response.body.data.remindAt).getTime()).toBe(TOMORROW.getTime() - 30 * 60 * 1000);

    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.nextFollowUpAt?.toISOString()).toBe(TOMORROW.toISOString());
    expect(await prisma.leadActivity.count({ where: { leadId: lead.id, type: 'FOLLOW_UP_CREATED' } })).toBe(1);
  });

  it('bo‘limlar bo‘yicha ajratadi va sonlarni qaytaradi', async () => {
    const source = await createSource();
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: user.id });
    const create = (title: string, dueAt: Date) =>
      request(app).post('/api/follow-ups').set(bearer(token)).send({ leadId: lead.id, title, dueAt: dueAt.toISOString() });

    await create('Kechikkan vazifa', YESTERDAY);
    await create('Bugungi vazifa', LATER_TODAY);
    await create('Ertangi vazifa', TOMORROW);
    await create('Keyingi hafta', NEXT_WEEK);

    const summary = await request(app).get('/api/follow-ups/summary').set(bearer(token));
    const overdue = await request(app).get('/api/follow-ups').query({ scope: 'overdue' }).set(bearer(token));
    const today = await request(app).get('/api/follow-ups').query({ scope: 'today' }).set(bearer(token));
    const tomorrow = await request(app).get('/api/follow-ups').query({ scope: 'tomorrow' }).set(bearer(token));

    expect(summary.body.data).toEqual({ overdue: 1, today: 1, tomorrow: 1, upcoming: 1 });
    expect(overdue.body.data).toHaveLength(1);
    expect(overdue.body.data[0]).toMatchObject({ title: 'Kechikkan vazifa', state: 'OVERDUE' });
    expect(today.body.data[0].title).toBe('Bugungi vazifa');
    expect(tomorrow.body.data[0].title).toBe('Ertangi vazifa');
    // Leadning keyingi aloqasi — eng yaqin bajarilmagan vazifa
    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.nextFollowUpAt?.toISOString()).toBe(YESTERDAY.toISOString());
  });

  it('bajarilganda timeline’ga yoziladi va keyingi vazifa yaratiladi', async () => {
    const source = await createSource();
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: user.id });
    const created = await request(app)
      .post('/api/follow-ups')
      .set(bearer(token))
      .send({ leadId: lead.id, title: 'Qo‘ng‘iroq qilish', dueAt: LATER_TODAY.toISOString() });
    const id = created.body.data.id as string;

    const completed = await request(app)
      .patch(`/api/follow-ups/${id}/complete`)
      .set(bearer(token))
      .send({ comment: 'Gaplashdik, o‘ylab ko‘radi', nextDueAt: TOMORROW.toISOString(), nextTitle: 'Javobini olish' });
    const repeat = await request(app).patch(`/api/follow-ups/${id}/complete`).set(bearer(token)).send({});
    const edit = await request(app)
      .put(`/api/follow-ups/${id}`)
      .set(bearer(token))
      .send({ title: 'O‘zgargan nom', dueAt: TOMORROW.toISOString() });

    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ status: 'DONE', state: 'DONE' });
    expect(repeat.status).toBe(409);
    expect(edit.status).toBe(409);

    const activity = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: lead.id, type: 'FOLLOW_UP_COMPLETED' } });
    expect(activity.description).toBe('Follow-up bajarildi: Qo‘ng‘iroq qilish. Gaplashdik, o‘ylab ko‘radi');
    const next = await prisma.followUp.findFirstOrThrow({ where: { leadId: lead.id, status: 'PENDING' } });
    expect(next.title).toBe('Javobini olish');
    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.nextFollowUpAt?.toISOString()).toBe(TOMORROW.toISOString());
  });

  it('o‘chirilganda leadning keyingi aloqa sanasi qayta hisoblanadi', async () => {
    const source = await createSource();
    const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const lead = await createLead({ sourceId: source.id, assignedToId: user.id });
    const first = await request(app)
      .post('/api/follow-ups')
      .set(bearer(token))
      .send({ leadId: lead.id, title: 'Birinchi', dueAt: LATER_TODAY.toISOString() });
    await request(app).post('/api/follow-ups').set(bearer(token)).send({ leadId: lead.id, title: 'Ikkinchi', dueAt: TOMORROW.toISOString() });

    const removed = await request(app).delete(`/api/follow-ups/${first.body.data.id}`).set(bearer(token));

    expect(removed.status).toBe(200);
    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.nextFollowUpAt?.toISOString()).toBe(TOMORROW.toISOString());
  });

  it('Sales boshqa xodimga biriktira olmaydi, Admin biriktirganda bildirishnoma ketadi', async () => {
    const source = await createSource();
    const { user: sales, token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const lead = await createLead({ sourceId: source.id, assignedToId: sales.id });
    const payload = { leadId: lead.id, title: 'Shartnoma bo‘yicha gaplashish', dueAt: TOMORROW.toISOString() };

    const salesAttempt = await request(app).post('/api/follow-ups').set(bearer(salesToken)).send({ ...payload, assignedToId: other.id });
    const adminAssign = await request(app).post('/api/follow-ups').set(bearer(adminToken)).send({ ...payload, assignedToId: other.id });

    expect(salesAttempt.status).toBe(403);
    expect(adminAssign.status).toBe(201);
    expect(adminAssign.body.data.assignedTo.id).toBe(other.id);
    expect(await prisma.notification.count({ where: { userId: other.id, type: 'FOLLOW_UP_REMINDER' } })).toBe(1);
  });
});
