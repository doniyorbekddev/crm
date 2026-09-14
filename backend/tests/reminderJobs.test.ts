import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/database.js';
import { sendDailyDebtSummary } from '../src/jobs/debtReminder.job.js';
import { sendDueReminders, sendOverdueAlerts } from '../src/jobs/followUpReminder.job.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { createTestUser, hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createLead, createSource } from './helpers/fixtures.js';

const MINUTE = 60_000;

async function createRole(key: string, permissionKeys: string[]) {
  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  return prisma.role.create({
    data: { key, name: key, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
  });
}

let counter = 0;

async function studentWithDebt(courseId: string, remaining: number, extra: { deletedAt?: Date } = {}) {
  counter += 1;
  return prisma.student.create({
    data: {
      firstName: `Qarzdor${counter}`,
      lastName: 'Aliyev',
      phone: `+99891${String(4_000_000 + counter)}`,
      courseId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      deletedAt: extra.deletedAt ?? null,
      debt: { create: { totalAmount: 2_000_000, paidAmount: 2_000_000 - remaining, remainingAmount: remaining } },
    },
  });
}

describe.skipIf(!hasTestDatabase)('Fon joblari: qarzdorlik va follow-up eslatmalari (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('qarzdorlik xulosasi faqat debt.view ruxsati bor faol xodimga, o‘quv markaz kuni bo‘yicha bir marta yuboriladi', async () => {
    await createRole('DEBT_WATCHER', [PERMISSIONS.DEBT_VIEW]);
    await createRole('NO_DEBT', []);
    const watcher = await createTestUser({ role: 'DEBT_WATCHER', email: 'watcher@test.uz' });
    await createTestUser({ role: 'DEBT_WATCHER', email: 'pending@test.uz', status: 'PENDING' });
    await createTestUser({ role: 'NO_DEBT', email: 'other@test.uz' });
    const course = await createCourse();

    // Qarzdor yo'q — bildirishnoma ham yo'q
    expect(await sendDailyDebtSummary(new Date('2026-09-14T08:00:00.000Z'))).toBe(0);

    await studentWithDebt(course.id, 1_200_000);
    await studentWithDebt(course.id, 0);
    await studentWithDebt(course.id, 500_000, { deletedAt: new Date() });

    expect(await sendDailyDebtSummary(new Date('2026-09-14T08:00:00.000Z'))).toBe(1);
    const [notification] = await prisma.notification.findMany({ where: { type: 'DEBT_REMINDER' } });
    expect(notification).toMatchObject({ userId: watcher.id, entityType: 'debt', dedupeKey: `debt-summary:2026-09-14:${watcher.id}` });
    expect(notification?.message).toContain('1 ta o‘quvchida');

    // Shu kuni qayta ishga tushsa — takrorlanmaydi
    expect(await sendDailyDebtSummary(new Date('2026-09-14T15:00:00.000Z'))).toBe(0);
    // 15-sentabr 20:00 UTC — Toshkentda allaqachon 16-sentabr
    expect(await sendDailyDebtSummary(new Date('2026-09-15T20:00:00.000Z'))).toBe(1);
    expect(await prisma.notification.count({ where: { dedupeKey: `debt-summary:2026-09-16:${watcher.id}` } })).toBe(1);
  });

  it('follow-up eslatmasi va kechikish ogohlantirishi bir martadan, faqat biriktirilgan va ochiq vazifaga yuboriladi', async () => {
    const manager = await createTestUser({ role: 'SALES_MANAGER', email: 'manager@test.uz' });
    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, firstName: 'Aziz', lastName: 'Karimov', assignedToId: manager.id });
    const now = new Date('2026-09-14T09:00:00.000Z');
    const at = (minutes: number) => new Date(now.getTime() + minutes * MINUTE);
    const base = { leadId: lead.id, assignedToId: manager.id };

    const due = await prisma.followUp.create({ data: { ...base, title: 'Qayta qo‘ng‘iroq', dueAt: at(60), remindAt: at(-10) } });
    await prisma.followUp.create({ data: { ...base, title: 'Keyinroq', dueAt: at(2 * 24 * 60), remindAt: at(24 * 60) } });
    const overdue = await prisma.followUp.create({ data: { ...base, title: 'Muddati o‘tgan', dueAt: at(-60) } });
    await prisma.followUp.create({ data: { ...base, assignedToId: null, title: 'Egasiz', dueAt: at(-60), remindAt: at(-60) } });
    await prisma.followUp.create({ data: { ...base, status: 'DONE', title: 'Bajarilgan', dueAt: at(-60), remindAt: at(-60) } });

    expect(await sendDueReminders(now)).toBe(1);
    const reminders = await prisma.notification.findMany({ where: { type: 'FOLLOW_UP_REMINDER' } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ userId: manager.id, entityType: 'followUp', entityId: due.id });
    expect(reminders[0]?.message).toContain('Aziz Karimov (');
    expect(reminders[0]?.message).toContain('Qayta qo‘ng‘iroq');
    expect((await prisma.followUp.findUniqueOrThrow({ where: { id: due.id } })).reminderSentAt).toEqual(now);
    expect(await sendDueReminders(at(1))).toBe(0);

    expect(await sendOverdueAlerts(now)).toBe(1);
    const overdueAlerts = await prisma.notification.findMany({ where: { type: 'FOLLOW_UP_OVERDUE' } });
    expect(overdueAlerts).toHaveLength(1);
    expect(overdueAlerts[0]).toMatchObject({ userId: manager.id, entityId: overdue.id });
    expect((await prisma.followUp.findUniqueOrThrow({ where: { id: overdue.id } })).overdueNotifiedAt).toEqual(now);
    expect(await sendOverdueAlerts(at(1))).toBe(0);
  });
});
