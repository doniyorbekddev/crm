import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { digestService } from '../src/services/digest.service.js';
import { groupUz } from '../src/utils/money.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/** ORG tizimi · 4-bosqich: CEO paneli (bloklar ruxsat bo'yicha) va kunlik xulosadagi jamoa bo'limi */
const app = createApp();

describe.skipIf(!hasTestDatabase)('ORG · 4-bosqich', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CEO barcha bloklarni ko‘radi; buxgalter — faqat ruxsatidagilarni; o‘qituvchi — hech birini; raqamlar manbaga mos', async () => {
    const { token: owner, user: ownerUser } = await createUserWithToken(app, { role: 'OWNER' });
    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const { token: teacher, user: teacherUser } = await createUserWithToken(app, { role: 'TEACHER' });
    await prisma.task.createMany({
      data: [
        { title: 'Kechikkan', assigneeId: teacherUser.id, createdById: ownerUser.id, dueAt: new Date(Date.now() - 3_600_000) },
        { title: 'Tekshiruvda', assigneeId: teacherUser.id, createdById: ownerUser.id, status: 'REVIEW' },
      ],
    });
    await prisma.complaint.create({ data: { source: 'PARENT', category: 'SAFETY', severity: 'CRITICAL', title: 'Jiddiy', description: 'Sinov', dueAt: new Date(Date.now() - 60_000) } });
    await prisma.complaint.create({ data: { source: 'STAFF', category: 'STAFF_CONFLICT', title: 'Maxfiy', description: 'Sinov', confidential: true } });
    await prisma.asset.create({ data: { inventoryNumber: 'A-1', name: 'Noutbuk', category: 'Kompyuter', purchaseCost: 5_000_000, status: 'UNDER_REPAIR' } });
    // Qarz: 1 200 000 shartnoma, kecha muddati kelgan 400 000 qism — panelda qarz 400 000, shartnoma qoldig'i alohida
    const course = await prisma.course.create({ data: { name: 'Qarz kursi', durationMonths: 3, price: 1_200_000, finalPrice: 1_200_000 } });
    await prisma.student.create({
      data: {
        firstName: 'Qarzdor',
        lastName: 'O‘quvchi',
        phone: '+998901112233',
        courseId: course.id,
        contractPrice: 1_200_000,
        startDate: new Date(Date.now() - 86_400_000),
        debt: { create: { totalAmount: 1_200_000, remainingAmount: 1_200_000 } },
        installments: {
          create: [
            { sequence: 1, dueDate: new Date(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)), amount: 400_000 },
            { sequence: 2, dueDate: new Date(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)), amount: 800_000 },
          ],
        },
      },
    });

    const full = (await request(app).get('/api/org/overview').set(bearer(owner))).body.data;
    for (const key of ['attendance', 'team', 'tasks', 'kpi', 'academic', 'sales', 'marketing', 'payments', 'payroll', 'expenses', 'complaints', 'assets', 'approvals']) {
      expect(full[key], key).not.toBeNull();
    }
    expect(full.tasks).toMatchObject({ open: 1, review: 1, overdue: 1, overdueItems: [{ title: 'Kechikkan' }] });
    expect(full.complaints).toMatchObject({ open: 2, critical: 1, overdue: 1 });
    expect(full.assets).toMatchObject({ count: 1, value: 5_000_000, underRepair: 1 });
    expect(full.payments).toMatchObject({ totalDebt: 1_200_000, dueDebt: 400_000, dueDebtors: 1, debtSource: 'LIVE' });
    expect(full.period).toMatchObject({ isCurrent: true });
    // Boshqaruv xulosasi: salbiylar oldin, har biri manba ko'rsatkichi va havola bilan
    const keys = (full.summary as Array<{ key: string }>).map((item) => item.key);
    expect(keys.slice(0, 3)).toEqual(['complaints_critical', 'tasks_overdue', 'due_debt']);
    expect(full.summary.find((item: { key: string }) => item.key === 'due_debt')).toMatchObject({
      tone: 'negative',
      metric: { label: 'Muddati kelgan qarz', value: `${groupUz(400_000)} so‘m` },
      link: '/debts',
    });

    const limited = (await request(app).get('/api/org/overview').set(bearer(accountant))).body.data;
    expect(limited.tasks).toBeNull();
    expect(limited.approvals).toBeNull();
    expect(limited.assets).not.toBeNull();
    // Maxfiy murojaat buxgalter sonida yo'q
    expect(limited.complaints).toMatchObject({ open: 1 });

    const none = (await request(app).get('/api/org/overview').set(bearer(teacher))).body.data;
    expect(Object.entries(none).filter(([key, value]) => key !== 'date' && key !== 'period' && key !== 'summary' && value !== null)).toEqual([]);
    // Ruxsati yo'q — xulosa ham bo'sh (bloklardan yig'iladi)
    expect(none.summary).toEqual([]);
  });

  it('tarix: ?period= bilan tugagan oy — oylik bloklar o‘sha oy uchun, shartnoma qoldig‘i yo‘q; kelajak oy va noto‘g‘ri format — 422', async () => {
    const { token: owner } = await createUserWithToken(app, { role: 'OWNER' });
    const now = new Date();
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 15));
    const key = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
    // O'sha oyda bajarilgan vazifa "o'sha oy bajarildi" ga tushadi, joriy oydagisi — tushmaydi
    const { user } = await createUserWithToken(app, { role: 'TEACHER' });
    await prisma.task.createMany({
      data: [
        { title: 'Eski', assigneeId: user.id, createdById: user.id, status: 'DONE', completedAt: previous },
        { title: 'Yangi', assigneeId: user.id, createdById: user.id, status: 'DONE', completedAt: now },
      ],
    });

    const past = await request(app).get(`/api/org/overview?period=${key}`).set(bearer(owner));
    expect(past.status).toBe(200);
    expect(past.body.data.period).toEqual({ year: previous.getUTCFullYear(), month: previous.getUTCMonth() + 1, isCurrent: false });
    expect(past.body.data.payments.totalDebt).toBeNull();
    expect(['SNAPSHOT', 'ESTIMATED']).toContain(past.body.data.payments.debtSource);
    expect(past.body.data.tasks.doneThisMonth).toBe(1);
    expect(past.body.data.kpi.month).toBe(key);

    const future = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    const futureKey = `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}`;
    const futureResponse = await request(app).get(`/api/org/overview?period=${futureKey}`).set(bearer(owner));
    expect(futureResponse.status).toBe(422);
    expect(futureResponse.body.errors[0].field).toBe('period');
    expect((await request(app).get('/api/org/overview?period=2026-13').set(bearer(owner))).status).toBe(422);
  });

  it('kunlik xulosa: jamoa qatori (ishga kelganlar, muddati o‘tgan vazifa, murojaat, tasdiq kutayotganlar)', async () => {
    const { user } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    await prisma.task.create({ data: { title: 'Kechikkan', assigneeId: user.id, dueAt: new Date(Date.now() - 3_600_000) } });
    await prisma.complaint.create({ data: { source: 'PARENT', category: 'SERVICE', severity: 'CRITICAL', title: 'X', description: 'Sinov' } });
    const digest = await digestService.build();
    expect(digest.team).toMatchObject({ overdueTasks: 1, openComplaints: 1, criticalComplaints: 1 });
    expect(digestService.format(digest).message).toContain('Jamoa: 0 xodim ishda, 1 vazifa muddati o‘tgan, 1 ochiq murojaat (1 jiddiy), 0 ta tasdiq kutmoqda');
  });
});
