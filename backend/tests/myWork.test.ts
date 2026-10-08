import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import type { WeekDay } from '../src/generated/prisma/client.js';
import { businessDateString, dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

/** CRM 4.0 · 2-faza: "Ishlarim" agregatori va umumiy tasdiq so'rovi */
const app = createApp();
const DAY_NAMES: readonly WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const today = () => DAY_NAMES[new Date(`${businessDateString(new Date())}T00:00:00Z`).getUTCDay()]!;

type Section = { key: string; count: number; overdue: number; items: Array<{ id: string; title: string; overdue: boolean; link: string | null }> };
const sectionOf = (body: { data: { sections: Section[] } }, key: string) => body.data.sections.find((section) => section.key === key);

describe.skipIf(!hasTestDatabase)('"Ishlarim" markazi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘qituvchi: o‘z vazifalari, baholanmagan ishlar va bugungi belgilanmagan darsni ko‘radi — begonanikini emas', async () => {
    const { token, user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: other } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const mine = await createGroup({ courseId: course.id });
    const foreign = await createGroup({ courseId: course.id });
    await prisma.group.update({ where: { id: mine.id }, data: { teacherId: teacher.id, status: 'ACTIVE', scheduleDays: [today()] } });
    await prisma.group.update({ where: { id: foreign.id }, data: { teacherId: other.id, status: 'ACTIVE', scheduleDays: [today()] } });
    const student = (groupId: string, firstName: string) =>
      prisma.student.create({ data: { firstName, lastName: 'Test', phone: `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, courseId: course.id, groupId, contractPrice: 1_000_000, startDate: new Date() } });
    const own = await student(mine.id, 'Ozim');
    const strange = await student(foreign.id, 'Begona');

    await prisma.task.createMany({
      data: [
        { title: 'Muddati o‘tgan ish', assigneeId: teacher.id, dueAt: new Date(Date.now() - 86_400_000) },
        { title: 'Muddatsiz ish', assigneeId: teacher.id },
        { title: 'Yopilgan ish', assigneeId: teacher.id, status: 'DONE' },
        { title: 'Begona ish', assigneeId: other.id },
      ],
    });
    const homework = (groupId: string, teacherId: string, studentId: string) =>
      prisma.homework.create({
        data: { title: 'Massivlar', groupId, courseId: course.id, teacherId, deadline: new Date(Date.now() + 86_400_000), status: 'PUBLISHED', maxPoints: 100, submissions: { create: [{ studentId, status: 'SUBMITTED', submittedAt: new Date() }] } },
      });
    const ownHomework = await homework(mine.id, teacher.id, own.id);
    await homework(foreign.id, other.id, strange.id);

    const response = await request(app).get('/api/my-work').set(bearer(token));
    expect(response.status).toBe(200);

    expect(sectionOf(response.body, 'tasks')).toMatchObject({ count: 2, overdue: 1 });
    expect(sectionOf(response.body, 'tasks')!.items.map((item) => item.title)).toEqual(['Muddati o‘tgan ish', 'Muddatsiz ish']);
    expect(sectionOf(response.body, 'tasks')!.items[0]!.overdue).toBe(true);
    expect(sectionOf(response.body, 'homework')).toMatchObject({ count: 1, items: [{ id: ownHomework.id, link: `/homework/${ownHomework.id}` }] });
    expect(sectionOf(response.body, 'attendance')).toMatchObject({ count: 1, items: [{ id: mine.id }] });
    // O'qituvchida bu bo'limlarga ruxsat yo'q — umuman qaytmaydi
    expect(sectionOf(response.body, 'approvals')).toBeUndefined();
    expect(sectionOf(response.body, 'followUps')).toBeUndefined();
    expect(response.body.data).toMatchObject({ total: 4, overdue: 1 });

    // Davomat belgilangach dars ro'yxatdan chiqadi
    await prisma.attendance.create({ data: { studentId: own.id, groupId: mine.id, date: dateColumn(new Date()), status: 'PRESENT' } });
    const after = await request(app).get('/api/my-work').set(bearer(token));
    expect(sectionOf(after.body, 'attendance')!.count).toBe(0);
  });

  it('sotuv menejeri: faqat o‘ziga biriktirilgan, bugungacha muddati kelgan follow-uplar', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { user: colleague } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const source = await createSource();
    const lead = await createLead({ sourceId: source.id, firstName: 'Mijoz' });
    await prisma.followUp.createMany({
      data: [
        { leadId: lead.id, assignedToId: user.id, title: 'Kechagi qo‘ng‘iroq', dueAt: new Date(Date.now() - 86_400_000) },
        { leadId: lead.id, assignedToId: user.id, title: 'Keyingi hafta', dueAt: new Date(Date.now() + 7 * 86_400_000) },
        { leadId: lead.id, assignedToId: user.id, title: 'Bajarilgan', dueAt: new Date(Date.now() - 86_400_000), status: 'DONE' },
        { leadId: lead.id, assignedToId: colleague.id, title: 'Hamkasbniki', dueAt: new Date(Date.now() - 86_400_000) },
      ],
    });

    const response = await request(app).get('/api/my-work').set(bearer(token));
    expect(sectionOf(response.body, 'followUps')).toMatchObject({ count: 1, overdue: 1, items: [{ title: 'Kechagi qo‘ng‘iroq', link: `/leads/${lead.id}` }] });
  });

  it('tasdiq so‘rovi xarajat bilan birga ochiladi va yopiladi; rahbar "Ishlarim"da ko‘radi, buxgalter ko‘rmaydi', async () => {
    await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 50_000_000, sortOrder: 1 } });
    const category = await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara', sortOrder: 1 } });
    const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: accountant, user: accountantUser } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    await request(app).put('/api/expenses/settings/approval').set(bearer(owner)).send({ approvalThreshold: 5_000_000 });

    const create = (description: string) =>
      request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: category.id, amount: 10_000_000, method: 'CASH', description });
    const first = (await create('Yillik ijara')).body.data.id as string;
    const second = (await create('Depozit')).body.data.id as string;
    // Chegaradan kichik xarajat uchun so'rov ochilmaydi
    await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: category.id, amount: 1_000_000, method: 'CASH' });

    const pending = await prisma.approvalRequest.findMany({ orderBy: { createdAt: 'asc' }, select: { entityId: true, status: true, type: true, requestedById: true, link: true } });
    expect(pending).toEqual([
      { entityId: first, status: 'PENDING', type: 'EXPENSE', requestedById: accountantUser.id, link: '/expenses' },
      { entityId: second, status: 'PENDING', type: 'EXPENSE', requestedById: accountantUser.id, link: '/expenses' },
    ]);

    const forOwner = await request(app).get('/api/my-work').set(bearer(owner));
    expect(sectionOf(forOwner.body, 'approvals')).toMatchObject({ count: 2 });
    expect(sectionOf(forOwner.body, 'approvals')!.items[0]!.title).toContain('Ijara — Yillik ijara');
    expect(sectionOf((await request(app).get('/api/my-work').set(bearer(accountant))).body, 'approvals')).toBeUndefined();

    await request(app).post(`/api/expenses/${first}/approve`).set(bearer(owner));
    await request(app).post(`/api/expenses/${second}/reject`).set(bearer(owner)).send({ reason: 'Budjetda yo‘q' });

    const decided = await prisma.approvalRequest.findMany({ orderBy: { createdAt: 'asc' }, select: { status: true, decidedById: true, reason: true } });
    expect(decided).toEqual([
      { status: 'APPROVED', decidedById: ownerUser.id, reason: null },
      { status: 'REJECTED', decidedById: ownerUser.id, reason: 'Budjetda yo‘q' },
    ]);
    expect(decided.every((row) => row.decidedById !== null)).toBe(true);
    expect(sectionOf((await request(app).get('/api/my-work').set(bearer(owner))).body, 'approvals')!.count).toBe(0);
  });

  it('kabinet hisobi "Ishlarim"ga kira olmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'PARENT' });
    expect((await request(app).get('/api/my-work').set(bearer(token))).status).toBe(403);
  });
});
