import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { alertService } from '../src/services/alert.service.js';
import { digestService } from '../src/services/digest.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

const app = createApp();

/** O‘quv markaz vaqti bilan 15-sentabr 14:00 */
const NOW = new Date('2026-09-15T09:00:00.000Z');
const at = (value: string, hour = 9) => new Date(`${value}T${String(hour).padStart(2, '0')}:00:00.000Z`);

let counter = 0;

async function student(courseId: string, groupId: string, extra: { remaining?: number; paid?: number; status?: 'ACTIVE' | 'DROPPED'; statusChangedAt?: Date; createdAt?: Date } = {}) {
  counter += 1;
  const remaining = extra.remaining ?? 0;
  const paid = extra.paid ?? 1_000_000 - remaining;
  return prisma.student.create({
    data: {
      firstName: `O‘quvchi${counter}`,
      lastName: 'Sinov',
      phone: `+99893${String(1_000_000 + counter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-07-01'),
      status: extra.status ?? 'ACTIVE',
      statusChangedAt: extra.statusChangedAt ?? null,
      ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: remaining, paidAmount: paid } },
    },
  });
}

const openAlert = (type: string, entityId?: string) =>
  prisma.alert.findFirst({ where: { type: type as never, resolvedAt: null, ...(entityId ? { entityId } : {}) } });

describe.skipIf(!hasTestDatabase)('Ogohlantirishlar: sozlamalar, yangi qoidalar, o‘qildi va kunlik xulosa (integratsion)', () => {
  let owner: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    ({ token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('chegaralar sozlanadi: standart qiymatlar, qisman saqlash, noto‘g‘ri kombinatsiya va ruxsat', async () => {
    const defaults = await request(app).get('/api/alerts/settings').set(bearer(owner));
    expect(defaults.status).toBe(200);
    expect(defaults.body.data).toMatchObject({ debtSharePercent: 50, attendanceWarning: 70, digestEnabled: true, digestHour: 8, updatedAt: null });
    expect(defaults.body.data.rules.CASH_SHORTAGE).toBe(true);

    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const debtor = await student(course.id, group.id, { remaining: 600_000 });
    await alertService.evaluate(new Date());
    expect(await openAlert('HIGH_DEBT', debtor.id)).not.toBeNull();

    const saved = await request(app).put('/api/alerts/settings').set(bearer(owner)).send({ debtSharePercent: 80, rules: { LOW_GROUP_CAPACITY: false } });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ debtSharePercent: 80, attendanceWarning: 70 });
    expect(saved.body.data.rules).toMatchObject({ LOW_GROUP_CAPACITY: false, HIGH_DEBT: true });
    expect(await prisma.auditLog.count({ where: { action: 'alert.settings_updated' } })).toBe(1);

    // 60% qarz endi 80% chegaradan past — alert avtomatik yopiladi
    await alertService.evaluate(new Date());
    expect(await openAlert('HIGH_DEBT', debtor.id)).toBeNull();

    const invalid = await request(app).put('/api/alerts/settings').set(bearer(owner)).send({ attendanceCritical: 80 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.errors[0].field).toBe('attendanceCritical');

    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' });
    expect((await request(app).get('/api/alerts/settings').set(bearer(admin))).status).toBe(200);
    expect((await request(app).put('/api/alerts/settings').set(bearer(admin)).send({ debtSharePercent: 60 })).status).toBe(403);
  });

  it('yangi qoidalar: konversiya tushishi, ketishlar o‘sishi, kassa yetishmasligi, kutib qolgan tasdiq', async () => {
    const source = await createSource();
    const lead = (status: 'WON' | 'LOST', date: Date) =>
      prisma.lead.create({
        data: {
          firstName: 'Mijoz',
          phone: `+99894${String(1_000_000 + (counter += 1))}`,
          sourceId: source.id,
          status,
          createdAt: date,
          ...(status === 'WON' ? { convertedAt: date } : { updatedAt: date }),
        },
      });
    // O'tgan oyning shu davri: 5/5 sotuv (100%), joriy oy: 1/5 (20%)
    for (let index = 0; index < 5; index += 1) await lead('WON', at('2026-08-05'));
    await lead('WON', at('2026-09-03'));
    for (let index = 0; index < 4; index += 1) await lead('LOST', at('2026-09-10'));

    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await student(course.id, group.id, { status: 'DROPPED', statusChangedAt: at('2026-08-10') });
    for (const day of ['2026-09-02', '2026-09-05', '2026-09-09']) {
      await student(course.id, group.id, { status: 'DROPPED', statusChangedAt: at(day) });
    }

    await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 100_000 } });
    const rent = await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara' } });
    await prisma.expense.create({ data: { categoryId: rent.id, amount: 500_000, spentAt: at('2026-09-25'), status: 'UPCOMING' } });
    await prisma.expense.create({ data: { categoryId: rent.id, amount: 200_000, spentAt: at('2026-09-10'), status: 'PENDING', createdAt: at('2026-09-10') } });

    await alertService.evaluate(new Date());

    expect(await openAlert('CONVERSION_DROP')).toMatchObject({ severity: 'CRITICAL', entityType: 'analytics' });
    expect(await openAlert('DROPOUT_INCREASE')).toMatchObject({ severity: 'WARNING' });
    const cash = await openAlert('CASH_SHORTAGE');
    expect(cash).toMatchObject({ severity: 'CRITICAL' });
    expect(cash!.message).toContain('yetishmaydi');
    expect(await openAlert('PENDING_EXPENSE_APPROVAL')).toMatchObject({ severity: 'WARNING' });

    const list = await request(app).get('/api/alerts').query({ type: 'CASH_SHORTAGE' }).set(bearer(owner));
    expect(list.body.data[0]).toMatchObject({ priority: 'HIGH', link: '/finance', readAt: null });

    // Qoida o'chirilsa — uning ochiq alerti avtomatik yopiladi
    await request(app).put('/api/alerts/settings').set(bearer(owner)).send({ rules: { CASH_SHORTAGE: false } }).expect(200);
    await alertService.evaluate(new Date());
    expect(await openAlert('CASH_SHORTAGE')).toBeNull();
  });

  it('o‘qildi, hammasini o‘qildi, daraja oshsa qayta o‘qilmagan va dismiss', async () => {
    const course = await createCourse();
    // Guruh to'la — faqat qarz alertlari ochiladi
    const group = await createGroup({ courseId: course.id, capacity: 2 });
    const partial = await student(course.id, group.id, { remaining: 900_000, paid: 100_000 });
    await student(course.id, group.id, { remaining: 1_000_000, paid: 0 });
    await alertService.evaluate(new Date());

    const summary = await request(app).get('/api/alerts/summary').set(bearer(owner));
    expect(summary.body.data).toMatchObject({ open: 2, unread: 2 });

    const warning = await openAlert('HIGH_DEBT', partial.id);
    const read = await request(app).patch(`/api/alerts/${warning!.id}/read`).set(bearer(owner));
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).not.toBeNull();
    expect(read.body.data.readBy).not.toBeNull();
    expect((await request(app).get('/api/alerts/summary').set(bearer(owner))).body.data.unread).toBe(1);
    expect((await request(app).get('/api/alerts').query({ status: 'unread' }).set(bearer(owner))).body.data).toHaveLength(1);

    // To'lov bekor bo'lib qarz to'liq qoldi — kritikka ko'tarildi va qayta o'qilmagan
    await prisma.debt.update({ where: { studentId: partial.id }, data: { remainingAmount: 1_000_000, paidAmount: 0 } });
    await alertService.evaluate(new Date());
    const escalated = await prisma.alert.findUniqueOrThrow({ where: { id: warning!.id } });
    expect(escalated).toMatchObject({ severity: 'CRITICAL', readAt: null });

    const all = await request(app).post('/api/alerts/read-all').set(bearer(owner));
    expect(all.body.data.updated).toBe(2);
    expect((await request(app).get('/api/alerts/summary').set(bearer(owner))).body.data.unread).toBe(0);

    const dismissed = await request(app).patch(`/api/alerts/${warning!.id}/dismiss`).set(bearer(owner)).send({});
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.data.resolvedAt).not.toBeNull();
    expect((await request(app).patch('/api/alerts/yoq/read').set(bearer(owner))).status).toBe(404);
  });

  it('kunlik xulosa: kechagi raqamlar, belgilangan soatdan keyin bir marta yuboriladi', async () => {
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    await prisma.transaction.createMany({
      data: [
        { type: 'INCOME', amount: 1_000_000, entityType: 'income', occurredAt: at('2026-09-14', 5) },
        { type: 'EXPENSE', amount: 300_000, entityType: 'expense', occurredAt: at('2026-09-14', 6) },
        // Bugungi yozuv kechagi xulosaga kirmaydi
        { type: 'INCOME', amount: 777_000, entityType: 'income', occurredAt: at('2026-09-15', 5) },
      ],
    });
    const fresh = await student(course.id, group.id, { remaining: 1_000_000, paid: 0, createdAt: at('2026-09-14', 6) });
    await prisma.attendance.createMany({
      data: [
        { studentId: fresh.id, groupId: group.id, date: new Date('2026-09-14T00:00:00.000Z'), status: 'PRESENT' },
        { studentId: (await student(course.id, group.id)).id, groupId: group.id, date: new Date('2026-09-14T00:00:00.000Z'), status: 'ABSENT' },
      ],
    });
    await alertService.evaluate(new Date());

    const digest = await request(app).get('/api/alerts/digest').set(bearer(owner));
    expect(digest.status).toBe(200);
    expect(digest.body.data).toMatchObject({
      date: '2026-09-14',
      revenue: 1_000_000,
      expenses: 300_000,
      netProfit: 700_000,
      newStudents: 1,
      attendanceRate: 50,
      attendanceMarks: 2,
      totalDebt: 1_000_000,
      debtors: 1,
    });
    expect(digest.body.data.criticalAlerts).toBeGreaterThanOrEqual(1);

    // O'quv markaz vaqti bilan 07:00 — hali erta
    expect(await digestService.sendDaily(new Date('2026-09-15T02:00:00.000Z'))).toMatchObject({ sent: 0, skipped: 'too-early' });
    const first = await digestService.sendDaily(NOW);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const notification = await prisma.notification.findFirstOrThrow({ where: { type: 'DAILY_DIGEST' } });
    expect(notification.title).toBe('Kunlik xulosa: 14.09.2026');
    expect(notification.message).toContain('Tushum: 1 000 000 so‘m');
    expect((await digestService.sendDaily(NOW)).sent).toBe(0);

    await request(app).put('/api/alerts/settings').set(bearer(owner)).send({ digestEnabled: false }).expect(200);
    expect(await digestService.sendDaily(NOW)).toMatchObject({ skipped: 'disabled' });

    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });
    expect((await request(app).get('/api/alerts/digest').set(bearer(sales))).status).toBe(403);
  });
});
