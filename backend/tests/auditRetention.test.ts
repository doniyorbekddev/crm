import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { cleanupAuditLogs, loadAuditSettings } from '../src/services/audit.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();
const DAY_MS = 86_400_000;

describe.skipIf(!hasTestDatabase)('Audit 2.0 — before/after va saqlash muddati', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('tahrirlashda oldingi va keyingi qiymatlar alohida saqlanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const role = await request(app)
      .post('/api/roles')
      .set(bearer(token))
      .send({ key: 'TEST_ROLE', name: 'Sinov roli', permissionKeys: ['dashboard.view'] });
    expect(role.status).toBe(201);

    await request(app).put(`/api/roles/${role.body.data.id}`).set(bearer(token)).send({ name: 'Yangi nom' }).expect(200);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'role.updated' } });
    expect(log.before).toMatchObject({ name: 'Sinov roli' });
    expect(log.after).toMatchObject({ name: 'Yangi nom' });
  });

  it('jurnal ro‘yxatida before/after qaytariladi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'employee.updated',
        entityType: 'employee',
        entityId: 'x',
        before: { status: 'ACTIVE' },
        after: { status: 'RESIGNED' },
      },
    });

    const response = await request(app).get('/api/audit-logs').set(bearer(token));

    expect(response.status).toBe(200);
    const entry = response.body.data.find((row: { action: string }) => row.action === 'employee.updated');
    expect(entry.before).toMatchObject({ status: 'ACTIVE' });
    expect(entry.after).toMatchObject({ status: 'RESIGNED' });
    // Muhim amal sifatida belgilanadi
    expect(entry.isCritical).toBe(true);
  });

  it('muddati o‘tgan oddiy yozuvlar o‘chiriladi, muhimlari qoladi', async () => {
    const { user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const old = new Date(Date.now() - 400 * DAY_MS);
    await prisma.auditLog.createMany({
      data: [
        { userId: user.id, action: 'lead.updated', entityType: 'lead', createdAt: old },
        { userId: user.id, action: 'payment.deleted', entityType: 'payment', createdAt: old },
        { userId: user.id, action: 'lead.updated', entityType: 'lead' },
      ],
    });

    const result = await cleanupAuditLogs(new Date());

    expect(result.deleted).toBe(1);
    // Login yozuvi ham bor (test foydalanuvchisi kirgan), shuning uchun faqat yaratganlarimizni tekshiramiz
    const left = await prisma.auditLog.findMany({ where: { entityType: { in: ['lead', 'payment'] } }, select: { action: true } });
    expect(left.map((row) => row.action).sort()).toEqual(['lead.updated', 'payment.deleted'].sort());
  });

  it('saqlash muddati sozlanadi va o‘zgarish auditga tushadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });

    const saved = await request(app)
      .put('/api/audit-logs/settings')
      .set(bearer(token))
      .send({ retentionDays: 90, criticalRetentionDays: 1000 });

    expect(saved.status).toBe(200);
    expect(saved.body.data.retentionDays).toBe(90);
    expect((await loadAuditSettings()).retentionDays).toBe(90);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'audit.settings_updated' } });
    expect(log.before).toMatchObject({ retentionDays: 365 });
    expect(log.after).toMatchObject({ retentionDays: 90 });
  });

  it('sozlamani o‘zgartirish huquqi tekshiriladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    // ADMIN da settings.manage yo'q
    await request(app).put('/api/audit-logs/settings').set(bearer(token)).send({ retentionDays: 10, criticalRetentionDays: 10 }).expect(403);
    // Ko'rish mumkin
    await request(app).get('/api/audit-logs/settings').set(bearer(token)).expect(200);
  });

  it('audit yozuvini o‘chiradigan API yo‘q', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const log = await prisma.auditLog.create({ data: { userId: user.id, action: 'lead.updated', entityType: 'lead' } });

    const attempt = await request(app).delete(`/api/audit-logs/${log.id}`).set(bearer(token));

    expect(attempt.status).toBe(404);
    expect(await prisma.auditLog.count({ where: { id: log.id } })).toBe(1);
  });
});
