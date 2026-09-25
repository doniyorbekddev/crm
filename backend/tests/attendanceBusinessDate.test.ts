import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * "Bugun" — o'quv markaz sanasi (APP_UTC_OFFSET_MINUTES = +300), UTC emas. Toshkentda 00:30 da UTC hali
 * kechagi kun: oldin o'qituvchi obzori va botdagi "Bugungi darslar" kechagi darslarni ko'rsatardi.
 */
const app = createApp();
// 2026-09-26 (shanba) 00:30 Toshkent = 2026-09-25 (juma) 19:30 UTC
const NIGHT = new Date('2026-09-25T19:30:00.000Z');

describe.skipIf(!hasTestDatabase)('Davomat: "bugun" — o‘quv markaz sanasi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NIGHT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('tunda (00:30) bugungi dars — shanba guruhi, juma emas; statistika sanasi ham markaz kuni', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['SATURDAY'], name: 'Shanba guruhi' });
    await createGroup({ courseId: course.id, teacherId: teacher.id, scheduleDays: ['FRIDAY'], name: 'Juma guruhi' });

    const overview = await request(app).get('/api/attendance/teacher-overview').set(bearer(token));
    expect(overview.status).toBe(200);
    expect(overview.body.data.date).toBe('2026-09-26');
    const scheduled = overview.body.data.groups.filter((group: { isScheduledToday: boolean }) => group.isScheduledToday).map((group: { name: string }) => group.name);
    expect(scheduled).toEqual(['Shanba guruhi']);
    expect(overview.body.data.todayLessons).toBe(1);
  });
});
