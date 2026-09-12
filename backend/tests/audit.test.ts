import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { DEFAULT_PASSWORD, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createSource } from './helpers/fixtures.js';

const app = createApp();

async function seedLog(data: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  ip?: string;
  createdAt?: Date;
  metadata?: Record<string, string>;
}) {
  return prisma.auditLog.create({
    data: {
      userId: data.userId ?? null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      ip: data.ip ?? '127.0.0.1',
      userAgent: 'vitest',
      ...(data.metadata ? { metadata: data.metadata } : {}),
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
  });
}

/** `createUserWithToken` login qiladi va audit yozuvi qoldiradi — sanoqli testlar uchun tozalanadi */
async function clearLogs() {
  await prisma.auditLog.deleteMany({});
}

describe.skipIf(!hasTestDatabase)('Audit log API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('yozuvlarni o‘zbekcha izoh bilan, yangisidan boshlab qaytaradi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'ADMIN' });
    await clearLogs();
    await seedLog({ userId: user.id, action: 'lead.created', entityType: 'lead', entityId: 'lead-1', createdAt: new Date('2026-09-10T10:00:00.000Z') });
    await seedLog({
      userId: user.id,
      action: 'payment.deleted',
      entityType: 'payment',
      entityId: 'pay-1',
      createdAt: new Date('2026-09-12T10:00:00.000Z'),
      metadata: { receipt: 'PM-000001', reason: 'Ikki marta kiritilgan' },
    });

    const response = await request(app).get('/api/audit-logs').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).toMatchObject({
      action: 'payment.deleted',
      actionLabel: 'To‘lov bekor qilindi',
      entityType: 'payment',
      entityLabel: 'To‘lov',
      isCritical: true,
      ip: '127.0.0.1',
      user: { id: user.id },
    });
    expect(response.body.data[0].metadata).toMatchObject({ receipt: 'PM-000001' });
    expect(response.body.data[1]).toMatchObject({ action: 'lead.created', actionLabel: 'Lead qo‘shildi', isCritical: false });
  });

  it('xodim, amal, obyekt va sana bo‘yicha filtrlaydi', async () => {
    const { user: first, token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: second } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await clearLogs();
    await seedLog({ userId: first.id, action: 'lead.created', entityType: 'lead', createdAt: new Date('2026-09-01T10:00:00.000Z') });
    await seedLog({ userId: second.id, action: 'lead.deleted', entityType: 'lead', entityId: 'lead-9', createdAt: new Date('2026-09-10T10:00:00.000Z') });
    await seedLog({ userId: second.id, action: 'course.created', entityType: 'course', createdAt: new Date('2026-09-11T10:00:00.000Z') });

    const byUser = await request(app).get(`/api/audit-logs?userId=${second.id}`).set(bearer(token));
    const byAction = await request(app).get('/api/audit-logs?action=lead.deleted').set(bearer(token));
    const byEntity = await request(app).get('/api/audit-logs?entityType=course').set(bearer(token));
    const byEntityId = await request(app).get('/api/audit-logs?entityId=lead-9').set(bearer(token));
    const byRange = await request(app).get('/api/audit-logs?from=2026-09-10&to=2026-09-10').set(bearer(token));
    const badRange = await request(app).get('/api/audit-logs?from=2026-09-12&to=2026-09-01').set(bearer(token));

    expect(byUser.body.meta.total).toBe(2);
    expect(byAction.body.data).toHaveLength(1);
    expect(byEntity.body.data[0].entityLabel).toBe('Kurs');
    expect(byEntityId.body.data).toHaveLength(1);
    expect(byRange.body.data).toHaveLength(1);
    expect(byRange.body.data[0].action).toBe('lead.deleted');
    expect(badRange.status).toBe(422);
  });

  it('criticalOnly faqat muhim amallarni qoldiradi va qidiruv ishlaydi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'ADMIN', firstName: 'Jamshid' });
    await clearLogs();
    await seedLog({ userId: user.id, action: 'lead.created', entityType: 'lead' });
    await seedLog({ userId: user.id, action: 'student.deleted', entityType: 'student' });
    await seedLog({ userId: null, action: 'auth.login_failed', entityType: 'user', ip: '10.0.0.5' });

    const critical = await request(app).get('/api/audit-logs?criticalOnly=true').set(bearer(token));
    const byIp = await request(app).get('/api/audit-logs?search=10.0.0.5').set(bearer(token));
    const byName = await request(app).get('/api/audit-logs?search=Jamshid').set(bearer(token));

    expect(critical.body.data.map((item: { action: string }) => item.action).sort()).toEqual([
      'auth.login_failed',
      'student.deleted',
    ]);
    expect(byIp.body.data).toHaveLength(1);
    expect(byIp.body.data[0].user).toBeNull();
    expect(byName.body.meta.total).toBe(2);
  });

  it('filtr ro‘yxatlarini sonlari bilan qaytaradi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'ADMIN' });
    await clearLogs();
    await seedLog({ userId: user.id, action: 'lead.created', entityType: 'lead' });
    await seedLog({ userId: user.id, action: 'lead.created', entityType: 'lead' });
    await seedLog({ userId: null, action: 'auth.login_failed', entityType: 'user' });

    const filters = await request(app).get('/api/audit-logs/filters').set(bearer(token));

    expect(filters.status).toBe(200);
    expect(filters.body.data.actions).toEqual(
      expect.arrayContaining([{ value: 'lead.created', label: 'Lead qo‘shildi', count: 2 }]),
    );
    expect(filters.body.data.entityTypes).toEqual(
      expect.arrayContaining([{ value: 'user', label: 'Xodim', count: 1 }]),
    );
    expect(filters.body.data.users).toHaveLength(1);
    expect(filters.body.data.users[0]).toMatchObject({ id: user.id, count: 2 });
  });

  it('haqiqiy amallar jurnalga tushadi va faqat audit.view bilan ko‘rinadi', async () => {
    const source = await createSource();
    const { user: admin, token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

    await request(app)
      .post('/api/leads')
      .set(bearer(token))
      .send({ firstName: 'Nodira', phone: '+998901234567', sourceId: source.id });
    await request(app).post('/api/auth/login').send({ email: admin.email, password: 'NotoGriParol1' });

    const list = await request(app).get('/api/audit-logs').set(bearer(token));
    const forbidden = await request(app).get('/api/audit-logs').set(bearer(managerToken));
    const filtersForbidden = await request(app).get('/api/audit-logs/filters').set(bearer(managerToken));

    const actions = list.body.data.map((item: { action: string }) => item.action);
    expect(actions).toContain('lead.created');
    expect(actions).toContain('auth.login_failed');
    expect(actions).toContain('auth.login');
    expect(forbidden.status).toBe(403);
    expect(filtersForbidden.status).toBe(403);
  });

  it('muvaffaqiyatli login ham yoziladi va IP saqlanadi', async () => {
    const { user, token } = await createUserWithToken(app, { role: 'ADMIN' });
    await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });

    const list = await request(app).get('/api/audit-logs?action=auth.login').set(bearer(token));

    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data[0]).toMatchObject({ actionLabel: 'Tizimga kirdi', entityLabel: 'Xodim' });
    expect(list.body.data[0].ip).not.toBeNull();
  });
});
