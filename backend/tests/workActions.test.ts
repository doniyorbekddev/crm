import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { startEscalationJob } from '../src/jobs/escalation.job.js';
import { ALERT_GRACE_HOURS, TASK_GRACE_HOURS, escalationService } from '../src/services/escalation.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/** CRM 4.0 · 2-faza: "xabar → amal" (ogohlantirish / bildirishnoma → vazifa, kechiktirish, biriktirish) va eskalatsiya */
const app = createApp();
const HOUR = 3_600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

function createAlert(data: Partial<{ branchId: string | null; severity: 'CRITICAL' | 'WARNING'; title: string; createdAt: Date }> = {}) {
  return prisma.alert.create({
    data: { type: 'HIGH_DEBT', severity: data.severity ?? 'CRITICAL', title: data.title ?? 'Qarzdorlik oshdi', message: 'Ali Test: 3 oy to‘lanmagan', entityType: 'student', entityId: 'st1', branchId: data.branchId ?? null, ...(data.createdAt ? { createdAt: data.createdAt } : {}) },
  });
}

describe.skipIf(!hasTestDatabase)('Xabar → amal va eskalatsiya', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ogohlantirish → vazifa → bajarildi: vazifa ogohlantirishga bog‘lanadi, ijrochi mas’ul bo‘ladi', async () => {
    const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    // ADMIN ogohlantirishlarni ko'ra oladi — vazifa ijrochisi sifatida ularning mas'uli ham bo'ladi
    const { token: accountant, user: accountantUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const alert = await createAlert();

    const created = await request(app).post(`/api/alerts/${alert.id}/task`).set(bearer(owner)).send({ assigneeId: accountantUser.id, dueAt: inHours(24).toISOString() });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ title: 'Qarzdorlik oshdi', source: 'ALERT', alertId: alert.id, priority: 'URGENT', link: '/students/st1', assignee: { id: accountantUser.id }, createdBy: { id: ownerUser.id } });

    const listed = await request(app).get('/api/alerts').set(bearer(owner));
    expect(listed.body.data[0]).toMatchObject({ id: alert.id, openTasks: 1, assignee: { id: accountantUser.id }, resolvedAt: null });
    // Ijrochi "menga biriktirilgan" ro'yxatida va "Ishlarim"da ko'radi
    expect((await request(app).get('/api/alerts').query({ status: 'mine' }).set(bearer(accountant))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/alerts').query({ status: 'mine' }).set(bearer(owner))).body.data).toHaveLength(0);

    const done = await request(app).patch(`/api/tasks/${created.body.data.id}`).set(bearer(accountant)).send({ status: 'DONE' });
    expect(done.body.data.status).toBe('DONE');
    expect((await request(app).get('/api/alerts').set(bearer(owner))).body.data[0].openTasks).toBe(0);

    // Yopilgan ogohlantirishdan vazifa yaratilmaydi
    await request(app).patch(`/api/alerts/${alert.id}/resolve`).set(bearer(owner)).send({});
    expect((await request(app).post(`/api/alerts/${alert.id}/task`).set(bearer(owner)).send({})).status).toBe(409);
  });

  it('ogohlantirishni kechiktirish: faol ro‘yxat va hisoblagichdan chiqadi, muddati kelgach qaytadi', async () => {
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const alert = await createAlert();
    await createAlert({ title: 'Boshqa' });

    expect((await request(app).post(`/api/alerts/${alert.id}/snooze`).set(bearer(owner)).send({ until: inHours(-1).toISOString() })).status).toBe(422);
    expect((await request(app).post(`/api/alerts/${alert.id}/snooze`).set(bearer(owner)).send({ until: inHours(24 * 60).toISOString() })).status).toBe(422);
    const snoozed = await request(app).post(`/api/alerts/${alert.id}/snooze`).set(bearer(owner)).send({ until: inHours(2).toISOString() });
    expect(snoozed.status).toBe(200);
    expect(snoozed.body.data.snoozedUntil).not.toBeNull();

    expect((await request(app).get('/api/alerts').set(bearer(owner))).body.data.map((row: { title: string }) => row.title)).toEqual(['Boshqa']);
    expect((await request(app).get('/api/alerts/summary').set(bearer(owner))).body.data).toMatchObject({ open: 1, unread: 1 });
    expect((await request(app).get('/api/alerts').query({ status: 'snoozed' }).set(bearer(owner))).body.data).toHaveLength(1);

    // Muddat o'tdi — yana ko'rinadi
    await prisma.alert.update({ where: { id: alert.id }, data: { snoozedUntil: inHours(-1) } });
    expect((await request(app).get('/api/alerts').set(bearer(owner))).body.data).toHaveLength(2);
    expect((await request(app).get('/api/alerts/summary').set(bearer(owner))).body.data.open).toBe(2);
  });

  it('doira va ruxsat: boshqa filial ogohlantirishi 404; biriktirish `task.assign` talab qiladi; mas’ul ogohlantirishni ko‘ra olishi shart', async () => {
    const branch = await prisma.branch.create({ data: { key: 'CHILONZOR', name: 'Chilonzor filiali', sortOrder: 10 } });
    const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const far = await createAlert({ branchId: branch.id });
    const near = await createAlert();

    for (const path of ['task', 'snooze', 'assign']) {
      const response = await request(app).post(`/api/alerts/${far.id}/${path}`).set(bearer(admin)).send({ until: inHours(1).toISOString(), assigneeId: ownerUser.id });
      expect(response.status, path).toBe(404);
    }
    // Buxgalterda `task.assign` yo'q
    expect((await request(app).post(`/api/alerts/${near.id}/assign`).set(bearer(accountant)).send({ assigneeId: ownerUser.id })).status).toBe(403);
    // O'qituvchi ogohlantirishlarni ko'ra olmaydi — unga biriktirib bo'lmaydi
    expect((await request(app).post(`/api/alerts/${near.id}/assign`).set(bearer(owner)).send({ assigneeId: teacher.id })).status).toBe(422);

    // Tanlash ro'yxati: faqat ogohlantirishlarni ko'ra oladiganlar (o'qituvchi va buxgalter yo'q); ruxsatsiz xodimga yopiq
    const options = await request(app).get('/api/alerts/assignees').set(bearer(admin));
    const optionIds = options.body.data.map((row: { id: string }) => row.id);
    expect(optionIds).toContain(ownerUser.id);
    expect(optionIds).not.toContain(teacher.id);
    expect((await request(app).get('/api/alerts/assignees').set(bearer(accountant))).status).toBe(403);

    const assigned = await request(app).post(`/api/alerts/${near.id}/assign`).set(bearer(admin)).send({ assigneeId: ownerUser.id });
    expect(assigned.body.data.assignee.id).toBe(ownerUser.id);
    expect(await prisma.notification.count({ where: { userId: ownerUser.id, title: 'Sizga ogohlantirish biriktirildi' } })).toBe(1);
    const cleared = await request(app).post(`/api/alerts/${near.id}/assign`).set(bearer(admin)).send({ assigneeId: null });
    expect(cleared.body.data.assignee).toBeNull();
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: far.id } })).assigneeId).toBeNull();
  });

  it('bildirishnoma: kechiktirish va vazifaga aylantirish faqat egasiga; ikkinchi marta vazifa yaratilmaydi', async () => {
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: other } = await createUserWithToken(app, { role: 'ADMIN' });
    const first = await prisma.notification.create({ data: { userId: adminUser.id, type: 'NEW_LEAD', title: 'Yangi lead', message: 'Vali — Instagram', entityType: 'lead', entityId: 'l1', actionUrl: '/leads/l1' } });
    const second = await prisma.notification.create({ data: { userId: adminUser.id, type: 'NEW_LEAD', title: 'Yana lead', message: '-' } });

    expect((await request(app).post(`/api/notifications/${first.id}/snooze`).set(bearer(other)).send({ until: inHours(1).toISOString() })).status).toBe(404);
    expect((await request(app).post(`/api/notifications/${first.id}/task`).set(bearer(other)).send({})).status).toBe(404);

    expect((await request(app).post(`/api/notifications/${second.id}/snooze`).set(bearer(admin)).send({ until: inHours(1).toISOString() })).status).toBe(200);
    const list = await request(app).get('/api/notifications').set(bearer(admin));
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([first.id]);
    expect((await request(app).get('/api/notifications/summary').set(bearer(admin))).body.data.unread).toBe(1);

    const task = await request(app).post(`/api/notifications/${first.id}/task`).set(bearer(admin)).send({ priority: 'HIGH' });
    expect(task.status).toBe(201);
    expect(task.body.data).toMatchObject({ title: 'Yangi lead', source: 'NOTIFICATION', priority: 'HIGH', link: '/leads/l1', entityType: 'lead', entityId: 'l1' });
    const linked = await prisma.notification.findUniqueOrThrow({ where: { id: first.id }, select: { taskId: true, readAt: true } });
    expect(linked.taskId).toBe(task.body.data.id);
    expect(linked.readAt).not.toBeNull();
    expect((await request(app).post(`/api/notifications/${first.id}/task`).set(bearer(admin)).send({})).status).toBe(409);
    expect(await prisma.task.count()).toBe(1);
  });

  it('eskalatsiya: muddati o‘tgan vazifa bir marta ko‘tariladi; muddat surilsa qayta ko‘tarilishi mumkin', async () => {
    const { token: admin, user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const late = await prisma.task.create({ data: { title: 'Kechikkan', assigneeId: teacher.id, createdById: adminUser.id, dueAt: inHours(-(TASK_GRACE_HOURS + 2)) } });
    // Hali muhlat ichida, muddatsiz va yopilgan vazifalar ko'tarilmaydi
    await prisma.task.createMany({
      data: [
        { title: 'Muhlat ichida', assigneeId: teacher.id, dueAt: inHours(-(TASK_GRACE_HOURS - 2)) },
        { title: 'Muddatsiz', assigneeId: teacher.id },
        { title: 'Yopilgan', assigneeId: teacher.id, status: 'DONE', dueAt: inHours(-100) },
      ],
    });

    expect(await escalationService.run()).toEqual({ tasks: 1, alerts: 0 });
    expect(await escalationService.run()).toEqual({ tasks: 0, alerts: 0 });

    const notes = await prisma.notification.findMany({ where: { title: 'Vazifa muddati o‘tdi' }, select: { userId: true, entityId: true } });
    expect(notes.map((note) => note.userId).sort()).toEqual([adminUser.id, ownerUser.id].sort());
    expect(notes.every((note) => note.entityId === late.id)).toBe(true);
    // Ijrochining o'ziga yuborilmaydi
    expect(notes.some((note) => note.userId === teacher.id)).toBe(false);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: late.id } })).escalatedAt).not.toBeNull();

    // Rahbar muddatni surdi — belgi tozalanadi
    await request(app).patch(`/api/tasks/${late.id}`).set(bearer(admin)).send({ dueAt: inHours(48).toISOString() });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: late.id } })).escalatedAt).toBeNull();
    expect(await escalationService.run()).toEqual({ tasks: 0, alerts: 0 });
  });

  it('eskalatsiya: ko‘p kechikkan vazifa — har qabul qiluvchiga bitta yig‘ma xabar; boshqa filial rahbari olmaydi', async () => {
    const branch = await prisma.branch.create({ data: { key: 'CHILONZOR', name: 'Chilonzor filiali', sortOrder: 10 } });
    const { user: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const { user: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: farAdmin } = await createUserWithToken(app, { role: 'ADMIN', branchId: branch.id });
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    // Vazifa bergan, lekin "hammasini ko'rish" huquqi yo'q xodim
    const { user: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    await prisma.task.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        title: `Kechikkan ${index + 1}`,
        assigneeId: teacher.id,
        createdById: index === 0 ? accountant.id : null,
        dueAt: inHours(-(TASK_GRACE_HOURS + 10 - index)),
      })),
    });

    expect(await escalationService.run()).toEqual({ tasks: 5, alerts: 0 });

    const notes = await prisma.notification.findMany({ where: { type: 'TASK_UPDATE' }, select: { userId: true, title: true, message: true, actionUrl: true } });
    const byUser = new Map(notes.map((note) => [note.userId, note]));
    // 5 ta vazifa × 2 rahbar = 10 emas, har biriga bittadan
    expect(notes).toHaveLength(3);
    for (const manager of [owner.id, admin.id]) {
      expect(byUser.get(manager)).toMatchObject({ title: '5 ta vazifa muddati o‘tdi', actionUrl: '/tasks?scope=all&overdue=1' });
      // Eng eski muddatdan boshlab uchtasi nomi bilan, qolgani son bilan
      expect(byUser.get(manager)!.message).toBe('Kechikkan 1; Kechikkan 2; Kechikkan 3 va yana 2 ta');
    }
    // Muallif faqat o'zi bergan bitta vazifa haqida, "men berganlar" ro'yxatiga havola bilan
    expect(byUser.get(accountant.id)).toMatchObject({ title: 'Vazifa muddati o‘tdi', actionUrl: '/tasks?scope=created&overdue=1' });
    expect(byUser.get(accountant.id)!.message).toContain('Kechikkan 1');
    expect(byUser.has(farAdmin.id)).toBe(false);
    expect(byUser.has(teacher.id)).toBe(false);
    expect(await prisma.task.count({ where: { escalatedAt: null } })).toBe(0);
  });

  it('eskalatsiya jobi: ijara ostida yuradi, tugagach ijarani bo‘shatadi; ijara band bo‘lsa yurmaydi', async () => {
    const run = vi.spyOn(escalationService, 'run').mockResolvedValue({ tasks: 0, alerts: 0 });
    try {
      const stop = startEscalationJob();
      await expect.poll(() => run.mock.calls.length).toBe(1);
      await expect.poll(() => prisma.jobLease.count({ where: { name: 'escalation', lockedUntil: { lt: new Date() } } })).toBe(1);
      stop();

      // Boshqa nusxa ishlayapti — bu jarayon o'tkazib yuboradi
      await prisma.jobLease.update({ where: { name: 'escalation' }, data: { owner: 'boshqa-nusxa', lockedUntil: inHours(1) } });
      const stopSecond = startEscalationJob();
      await new Promise((resolve) => setTimeout(resolve, 300));
      stopSecond();
      expect(run).toHaveBeenCalledTimes(1);
      expect((await prisma.jobLease.findUniqueOrThrow({ where: { name: 'escalation' } })).owner).toBe('boshqa-nusxa');
    } finally {
      run.mockRestore();
    }
  });

  it('eskalatsiya: biriktirilgan, uzoq hal qilinmagan ogohlantirish sozlovchilarga ko‘tariladi; kechiktirilgani va biriktirilmagani — yo‘q', async () => {
    const { user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    const { user: adminUser } = await createUserWithToken(app, { role: 'ADMIN' });
    const old = new Date(Date.now() - (ALERT_GRACE_HOURS + 2) * HOUR);
    const stale = await createAlert({ title: 'Eski', createdAt: old });
    const snoozed = await createAlert({ title: 'Kechiktirilgan', createdAt: old });
    await createAlert({ title: 'Egasiz', createdAt: old });
    const fresh = await createAlert({ title: 'Yangi' });
    await prisma.alert.updateMany({ where: { id: { in: [stale.id, snoozed.id, fresh.id] } }, data: { assigneeId: adminUser.id } });
    await prisma.alert.update({ where: { id: snoozed.id }, data: { snoozedUntil: inHours(5) } });

    expect(await escalationService.run()).toEqual({ tasks: 0, alerts: 1 });
    expect(await escalationService.run()).toEqual({ tasks: 0, alerts: 0 });
    const notes = await prisma.notification.findMany({ where: { title: 'Ogohlantirish hal qilinmayapti' }, select: { userId: true, entityId: true } });
    // ADMIN da `alert.manage` yo'q — faqat owner oladi
    expect(notes).toEqual([{ userId: ownerUser.id, entityId: stale.id }]);
  });
});
