import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { digestService } from '../src/services/digest.service.js';
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
    expect(full.payments).toMatchObject({ totalDebt: 1_200_000, dueDebt: 400_000, dueDebtors: 1 });

    const limited = (await request(app).get('/api/org/overview').set(bearer(accountant))).body.data;
    expect(limited.tasks).toBeNull();
    expect(limited.approvals).toBeNull();
    expect(limited.assets).not.toBeNull();
    // Maxfiy murojaat buxgalter sonida yo'q
    expect(limited.complaints).toMatchObject({ open: 1 });

    const none = (await request(app).get('/api/org/overview').set(bearer(teacher))).body.data;
    expect(Object.entries(none).filter(([key, value]) => key !== 'date' && value !== null)).toEqual([]);
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
