import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { NOTIFICATION_TYPES } from '../src/validators/notification.validator.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();
const DAY_MS = 86_400_000;

describe('Bildirishnoma turlari ro‘yxati', () => {
  it('bazadagi barcha turlarni qamraydi', () => {
    // Ro'yxat Prisma enumidan olinadi — qo'lda yozilgan ro'yxat eskirib qolardi
    expect(NOTIFICATION_TYPES).toContain('CHILD_ABSENT');
    expect(NOTIFICATION_TYPES).toContain('PAYMENT_DUE_SOON');
    expect(NOTIFICATION_TYPES).toContain('NEGATIVE_FEEDBACK');
    expect(NOTIFICATION_TYPES).toContain('DAILY_DIGEST');
  });
});

describe.skipIf(!hasTestDatabase)('Global qidiruv va bildirishnoma filtrlari', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sertifikat raqami va o‘quvchi ismi bo‘yicha topiladi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Frontend');
    const student = await prisma.student.create({
      data: {
        firstName: 'Nodira',
        lastName: 'Sultonova',
        phone: '+998901112233',
        courseId: course.id,
        contractPrice: 1_000_000,
        startDate: new Date('2026-01-10'),
      },
    });
    const certificate = await prisma.certificate.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        studentName: 'Nodira Sultonova',
        courseName: 'Frontend',
        issuedAt: new Date('2026-06-01'),
        startDate: new Date('2026-01-10'),
        completionDate: new Date('2026-06-01'),
        verifyToken: 'a'.repeat(32),
        issuedById: user.id,
      },
    });

    const byName = await request(app).get('/api/search').query({ q: 'Nodira' }).set(bearer(token));
    const certificateGroup = byName.body.data.groups.find((group: { key: string }) => group.key === 'certificates');
    expect(certificateGroup).toBeTruthy();
    expect(certificateGroup.hits[0].code).toMatch(/^CRT-2026-\d{6}$/);

    const byNumber = await request(app).get('/api/search').query({ q: `CRT-2026-${String(certificate.number).padStart(6, '0')}` }).set(bearer(token));
    const found = byNumber.body.data.groups.find((group: { key: string }) => group.key === 'certificates');
    expect(found.hits).toHaveLength(1);
  });

  it('sertifikatlar ruxsatsiz xodimga qidiruvda ko‘rinmaydi', async () => {
    const { token: adminToken, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Backend');
    const student = await prisma.student.create({
      data: { firstName: 'Maxfiy', lastName: 'Talaba', phone: '+998901114455', courseId: course.id, contractPrice: 500_000, startDate: new Date() },
    });
    await prisma.certificate.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        studentName: 'Maxfiy Talaba',
        courseName: 'Backend',
        issuedAt: new Date(),
        startDate: new Date(),
        completionDate: new Date(),
        verifyToken: 'b'.repeat(32),
        issuedById: user.id,
      },
    });
    expect(adminToken).toBeTruthy();

    // Call-center o'quvchilarni ko'rmaydi
    const { token } = await createUserWithToken(app, { role: 'CALL_CENTER', email: 'callcenter-search@local.uz' });
    const response = await request(app).get('/api/search').query({ q: 'Maxfiy' }).set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.groups.find((group: { key: string }) => group.key === 'certificates')).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('Maxfiy Talaba');
  });

  it('bildirishnomalar o‘qilgan/o‘qilmagan va sana bo‘yicha filtrlanadi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'ADMIN' });
    const old = new Date(Date.now() - 10 * DAY_MS);
    await prisma.notification.createMany({
      data: [
        { userId: user.id, type: 'SYSTEM', title: 'Eski', message: 'Eski xabar', createdAt: old, readAt: old },
        { userId: user.id, type: 'CHILD_ABSENT', title: 'Yangi', message: 'Yangi xabar' },
      ],
    });

    const unread = await request(app).get('/api/notifications').query({ unreadOnly: 'true' }).set(bearer(token));
    expect(unread.body.data.map((row: { title: string }) => row.title)).toEqual(['Yangi']);

    const read = await request(app).get('/api/notifications').query({ readOnly: 'true' }).set(bearer(token));
    expect(read.body.data.map((row: { title: string }) => row.title)).toEqual(['Eski']);

    // Yangi tur bo'yicha filtr ishlaydi (avval bu 422 qaytarardi)
    const byType = await request(app).get('/api/notifications').query({ type: 'CHILD_ABSENT' }).set(bearer(token));
    expect(byType.status).toBe(200);
    expect(byType.body.data).toHaveLength(1);

    const today = new Date().toISOString().slice(0, 10);
    const todayOnly = await request(app).get('/api/notifications').query({ from: today }).set(bearer(token));
    expect(todayOnly.body.data.map((row: { title: string }) => row.title)).toEqual(['Yangi']);
  });
});
