import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { alertService } from '../src/services/alert.service.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();
const DAY = 86_400_000;

let counter = 0;

/** Bugundan `k` kun oldingi sana (@db.Date uchun UTC yarim tun) */
function daysAgo(k: number): Date {
  return new Date(new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`).getTime() - k * DAY);
}

async function enroll(courseId: string, groupId: string, debt: { total: number; remaining: number } = { total: 1_000_000, remaining: 0 }) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Valiyev',
      phone: `+99890${String(1_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: debt.total,
      startDate: daysAgo(40),
      debt: { create: { totalAmount: debt.total, remainingAmount: debt.remaining, paidAmount: debt.total - debt.remaining } },
    },
  });
}

async function openAlert(type: string, entityId?: string) {
  return prisma.alert.findFirst({ where: { type: type as never, resolvedAt: null, ...(entityId ? { entityId } : {}) } });
}

describe.skipIf(!hasTestDatabase)('Ogohlantirishlar (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Qoidalar va hayot sikli', () => {
    it('katta qarz alerti yaratiladi, holat to‘g‘rilansa yopiladi va qaytsa qayta ochiladi', async () => {
      const { user: admin } = await createUserWithToken(app, { role: 'ADMIN' });
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const student = await enroll(course.id, group.id, { total: 1_000_000, remaining: 1_000_000 });

      const first = await alertService.evaluate(new Date());
      expect(first.created).toBeGreaterThanOrEqual(1);
      const alert = await openAlert('HIGH_DEBT', student.id);
      expect(alert).toMatchObject({ severity: 'CRITICAL', dedupeKey: `high-debt:${student.id}` });

      // Kritik alert haqida alert.view egasiga bildirishnoma
      const notification = await prisma.notification.findFirst({ where: { entityType: 'alert', entityId: alert!.id, userId: admin.id } });
      expect(notification).not.toBeNull();

      // Takroriy tekshiruv yangi alert yaratmaydi
      const second = await alertService.evaluate(new Date());
      expect(await prisma.alert.count({ where: { type: 'HIGH_DEBT' } })).toBe(1);
      expect(second.updated).toBeGreaterThanOrEqual(1);

      // Qarz to'landi — alert avtomatik yopiladi, kalit arxivlanadi
      await prisma.debt.update({ where: { studentId: student.id }, data: { remainingAmount: 200_000, paidAmount: 800_000 } });
      const third = await alertService.evaluate(new Date());
      expect(third.resolved).toBeGreaterThanOrEqual(1);
      const closed = await prisma.alert.findUniqueOrThrow({ where: { id: alert!.id } });
      expect(closed.resolvedAt).not.toBeNull();
      expect(closed.resolvedById).toBeNull();
      expect(closed.dedupeKey).toContain('#');

      // Muammo qaytdi — yangi alert ochiladi
      await prisma.debt.update({ where: { studentId: student.id }, data: { remainingAmount: 900_000, paidAmount: 100_000 } });
      await alertService.evaluate(new Date());
      const reopened = await openAlert('HIGH_DEBT', student.id);
      expect(reopened).not.toBeNull();
      expect(reopened!.id).not.toBe(alert!.id);
      expect(reopened!.severity).toBe('WARNING');
    });

    it('qo‘lda yopilgan alert muammo davom etsa ham qayta ochilmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const student = await enroll(course.id, group.id, { total: 1_000_000, remaining: 1_000_000 });
      await alertService.evaluate(new Date());
      const alert = await openAlert('HIGH_DEBT', student.id);

      const resolved = await request(app)
        .patch(`/api/alerts/${alert!.id}/resolve`)
        .set(bearer(token))
        .send({ note: 'Ota-onasi bilan gaplashildi, oy oxirigacha to‘laydi' });
      expect(resolved.status).toBe(200);
      expect(resolved.body.data.resolvedBy).not.toBeNull();

      const result = await alertService.evaluate(new Date());
      expect(result.created).toBe(0);
      expect(await openAlert('HIGH_DEBT', student.id)).toBeNull();

      const repeat = await request(app).patch(`/api/alerts/${alert!.id}/resolve`).set(bearer(token)).send({});
      expect(repeat.status).toBe(409);
    });

    it('chiqib ketish xavfi va past davomat aniqlanadi', async () => {
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      const [absent, mixed] = [await enroll(course.id, group.id), await enroll(course.id, group.id)];
      await prisma.attendance.createMany({
        data: [
          { studentId: absent.id, groupId: group.id, date: daysAgo(1), status: 'ABSENT' },
          { studentId: absent.id, groupId: group.id, date: daysAgo(2), status: 'ABSENT' },
          { studentId: absent.id, groupId: group.id, date: daysAgo(3), status: 'ABSENT' },
          { studentId: mixed.id, groupId: group.id, date: daysAgo(1), status: 'PRESENT' },
          { studentId: mixed.id, groupId: group.id, date: daysAgo(2), status: 'ABSENT' },
          { studentId: mixed.id, groupId: group.id, date: daysAgo(3), status: 'ABSENT' },
        ],
      });

      await alertService.evaluate(new Date());
      expect(await openAlert('HIGH_DROPOUT', absent.id)).toMatchObject({ severity: 'CRITICAL' });
      expect(await openAlert('HIGH_DROPOUT', mixed.id)).toBeNull();
      // 6 belgidan 1 tasi kelgan — 17%
      expect(await openAlert('LOW_ATTENDANCE', group.id)).toMatchObject({ severity: 'CRITICAL' });
    });

    it('kechikkan follow-uplar ko‘p bo‘lsa managerga alert ochiladi', async () => {
      const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { user: calm } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const source = await createSource();
      const lead = await createLead({ sourceId: source.id, assignedToId: manager.id });
      const past = new Date(Date.now() - 2 * DAY);
      await prisma.followUp.createMany({
        data: [
          ...Array.from({ length: 5 }, (_, index) => ({ leadId: lead.id, assignedToId: manager.id, title: `Qo‘ng‘iroq ${index + 1}`, dueAt: past })),
          // Bajarilgan va kelajakdagi follow-uplar hisobga olinmaydi
          { leadId: lead.id, assignedToId: manager.id, title: 'Bajarilgan', dueAt: past, status: 'DONE' as const },
          ...Array.from({ length: 4 }, (_, index) => ({ leadId: lead.id, assignedToId: calm.id, title: `Kichik ${index}`, dueAt: past })),
        ],
      });

      await alertService.evaluate(new Date());
      expect(await openAlert('OVERDUE_FOLLOWUPS', manager.id)).toMatchObject({ severity: 'WARNING', message: expect.stringContaining('5 ta') });
      // 4 ta kechikish chegaradan (5) past
      expect(await openAlert('OVERDUE_FOLLOWUPS', calm.id)).toBeNull();
    });

    it('to‘lanmagan maosh, budjetdan oshish va to‘lmagan guruh aniqlanadi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
      const profile = await prisma.teacherProfile.create({ data: { userId: teacher.id } });
      const { year, month } = currentBusinessMonth();
      const old = new Date(Date.UTC(year, month - 1 - 3, 1));
      await prisma.teacherSalaryPeriod.create({
        data: {
          teacherProfileId: profile.id,
          year: old.getUTCFullYear(),
          month: old.getUTCMonth() + 1,
          salaryType: 'FIXED',
          totalAmount: 2_000_000,
          remainingAmount: 500_000,
          paidAmount: 1_500_000,
          status: 'PARTIALLY_PAID',
        },
      });

      const rent = await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara' } });
      await prisma.budget.create({ data: { year, month, lines: { create: [{ categoryId: rent.id, plannedAmount: 1_000_000 }] } } });
      await request(app).post('/api/expenses').set(bearer(token)).send({ categoryId: rent.id, amount: 1_300_000, method: 'CASH' });

      const course = await createCourse();
      const emptyGroup = await createGroup({ courseId: course.id, capacity: 10, startDate: '2026-01-01' });
      await enroll(course.id, emptyGroup.id);

      await alertService.evaluate(new Date());
      expect(await openAlert('UNPAID_SALARY')).toMatchObject({ severity: 'CRITICAL' });
      expect(await openAlert('BUDGET_EXCEEDED', rent.id)).toMatchObject({ severity: 'CRITICAL' });
      expect(await openAlert('LOW_GROUP_CAPACITY', emptyGroup.id)).toMatchObject({ severity: 'INFO' });
    });

    it('bajarilgan sotuv rejasi managerga xabar beradi va avtomatik yopilmaydi', async () => {
      const { user: manager } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { year, month } = currentBusinessMonth();
      await prisma.salesTarget.create({ data: { userId: manager.id, year, month, type: 'SALES', targetValue: 1 } });
      const source = await createSource();
      const lead = await createLead({ sourceId: source.id, assignedToId: manager.id, status: 'WON' });
      await prisma.lead.update({ where: { id: lead.id }, data: { convertedAt: new Date() } });

      await alertService.evaluate(new Date());
      const alert = await openAlert('SALES_TARGET_ACHIEVED');
      expect(alert).toMatchObject({ severity: 'SUCCESS' });
      expect(await prisma.notification.count({ where: { userId: manager.id, entityType: 'alert' } })).toBe(1);

      // Yutuq voqeasi — keyin lead holati o'zgarsa ham yopilmaydi
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'LOST' } });
      await alertService.evaluate(new Date());
      expect(await openAlert('SALES_TARGET_ACHIEVED')).not.toBeNull();
    });
  });

  describe('API va ruxsatlar', () => {
    it('ro‘yxat, xulosa va qo‘lda tekshirish ishlaydi; manager alertlarni ko‘rmaydi', async () => {
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const course = await createCourse();
      const group = await createGroup({ courseId: course.id });
      await enroll(course.id, group.id, { total: 1_000_000, remaining: 1_000_000 });

      const evaluated = await request(app).post('/api/alerts/evaluate').set(bearer(token));
      expect(evaluated.status).toBe(200);
      expect(evaluated.body.data.created).toBeGreaterThanOrEqual(1);

      const list = await request(app).get('/api/alerts').set(bearer(token));
      expect(list.body.data[0]).toMatchObject({ type: 'HIGH_DEBT', link: expect.stringMatching(/^\/students\//) });

      const summary = await request(app).get('/api/alerts/summary').set(bearer(token));
      expect(summary.body.data.bySeverity.CRITICAL).toBeGreaterThanOrEqual(1);

      expect((await request(app).get('/api/alerts').set(bearer(managerToken))).status).toBe(403);
    });

    it('sotuv rejalari: manager faqat o‘zini ko‘radi, admin reja qo‘yadi va olib tashlaydi', async () => {
      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
      const { user: manager, token: managerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { year, month } = currentBusinessMonth();

      const saved = await request(app)
        .put('/api/targets')
        .set(bearer(adminToken))
        .send({ year, month, userId: manager.id, type: 'LEADS', targetValue: 10 });
      expect(saved.status).toBe(200);
      await request(app).put('/api/targets').set(bearer(adminToken)).send({ year, month, userId: other.id, type: 'LEADS', targetValue: 5 });

      const own = await request(app).get('/api/targets').set(bearer(managerToken));
      expect(own.body.data.canManage).toBe(false);
      expect(own.body.data.rows.map((row: { userId: string }) => row.userId)).toEqual([manager.id]);
      expect(own.body.data.rows[0].targets.LEADS).toMatchObject({ target: 10, actual: 0, progress: 0 });

      const forbidden = await request(app)
        .put('/api/targets')
        .set(bearer(managerToken))
        .send({ year, month, userId: manager.id, type: 'LEADS', targetValue: 1 });
      expect(forbidden.status).toBe(403);

      const removed = await request(app)
        .put('/api/targets')
        .set(bearer(adminToken))
        .send({ year, month, userId: other.id, type: 'LEADS', targetValue: 0 });
      expect(removed.body.data.rows.map((row: { userId: string }) => row.userId)).toEqual([manager.id]);
    });
  });
});
