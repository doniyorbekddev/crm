import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

const NOW = new Date('2026-09-15T09:00:00.000Z');

let phoneCounter = 0;

async function enroll(courseId: string, groupId: string, firstName: string) {
  phoneCounter += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Valiyev',
      phone: `+99890${String(8_000_000 + phoneCounter)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

/** Seedda bo‘ladigan ma'lumotnomalar testda ham kerak */
async function seedGamificationReference() {
  const levels = [
    { number: 1, name: 'Yangi boshlovchi', minXp: 0 },
    { number: 2, name: 'Izlanuvchi', minXp: 30 },
    { number: 3, name: 'Tirishqoq', minXp: 100 },
  ];
  for (const level of levels) {
    await prisma.level.create({ data: level });
  }

  const rules = [
    { key: 'ATTENDANCE_PRESENT', name: 'Darsga keldi', source: 'ATTENDANCE' as const, points: 10 },
    { key: 'ATTENDANCE_LATE', name: 'Kechikib keldi', source: 'ATTENDANCE' as const, points: 5 },
    { key: 'STREAK_7', name: '7 kun ketma-ket', source: 'STREAK' as const, points: 100 },
    { key: 'HOMEWORK_SUBMITTED', name: 'Uy vazifasi', source: 'HOMEWORK' as const, points: 20 },
  ];
  for (const rule of rules) {
    await prisma.xpRule.create({ data: rule });
  }

  await prisma.badge.create({
    data: { key: 'STREAK_7', name: '7 kunlik seriya', description: '7 dars ketma-ket', icon: '🔥', rule: 'STREAK_DAYS', threshold: 7, xpReward: 50 },
  });
  await prisma.badge.create({
    data: { key: 'FAST_LEARNER', name: 'Tez o‘rganuvchi', description: '100 XP', icon: '🚀', rule: 'XP_TOTAL', threshold: 100, xpReward: 0 },
  });
  await prisma.badge.create({
    data: { key: 'TOP_STUDENT', name: 'Eng yaxshi', description: 'Qo‘lda beriladi', icon: '⭐', rule: 'MANUAL', threshold: null, xpReward: 25 },
  });
}

async function markDay(token: string, groupId: string, date: string, records: Array<{ studentId: string; status: string }>) {
  return request(app).post(`/api/groups/${groupId}/attendance`).set(bearer(token)).send({ date, records });
}

describe.skipIf(!hasTestDatabase)('Gamification (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedGamificationReference();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('davomat belgilanganda XP beriladi va daraja oshadi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    await markDay(token, group.id, '2026-09-08', [{ studentId: student.id, status: 'PRESENT' }]);
    await markDay(token, group.id, '2026-09-10', [{ studentId: student.id, status: 'LATE' }]);
    await markDay(token, group.id, '2026-09-12', [{ studentId: student.id, status: 'ABSENT' }]);

    const profile = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    // 10 (keldi) + 5 (kechikdi) + 0 (kelmadi) = 15
    expect(profile.status).toBe(200);
    expect(profile.body.data.totalXp).toBe(15);
    expect(profile.body.data.level).toMatchObject({ number: 1, name: 'Yangi boshlovchi' });
    expect(profile.body.data.nextLevel).toMatchObject({ number: 2, xpLeft: 15 });
    expect(profile.body.data.recentXp).toHaveLength(2);
    expect(profile.body.data.rank).toBe(1);
  });

  it('davomat o‘zgartirilsa XP qayta hisoblanadi (ikki marta berilmaydi)', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    await markDay(token, group.id, '2026-09-08', [{ studentId: student.id, status: 'PRESENT' }]);
    await markDay(token, group.id, '2026-09-08', [{ studentId: student.id, status: 'PRESENT' }]);
    const afterRepeat = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    await markDay(token, group.id, '2026-09-08', [{ studentId: student.id, status: 'ABSENT' }]);
    const afterChange = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    expect(afterRepeat.body.data.totalXp).toBe(10);
    expect(afterChange.body.data.totalXp).toBe(0);
    expect(await prisma.xpTransaction.count({ where: { studentId: student.id } })).toBe(0);
  });

  it('ketma-ketlik (streak) hisoblanadi va sababsiz qoldirish uzadi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    for (const date of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      await markDay(token, group.id, date, [{ studentId: student.id, status: 'PRESENT' }]);
    }
    const afterThree = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    await markDay(token, group.id, '2026-09-04', [{ studentId: student.id, status: 'ABSENT' }]);
    await markDay(token, group.id, '2026-09-05', [{ studentId: student.id, status: 'PRESENT' }]);
    const afterBreak = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    expect(afterThree.body.data.streak).toMatchObject({ current: 3, longest: 3 });
    expect(afterBreak.body.data.streak).toMatchObject({ current: 1, longest: 3 });
    expect(afterBreak.body.data.streak.lastAttendanceDate).toBe('2026-09-05');
  });

  it('7 kunlik seriyada bonus XP va nishon beriladi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      await markDay(token, group.id, `2026-09-0${day}`, [{ studentId: student.id, status: 'PRESENT' }]);
    }

    const profile = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    // 7 x 10 (davomat) + 100 (seriya bonusi) + 50 (nishon mukofoti) = 220
    expect(profile.body.data.streak.current).toBe(7);
    expect(profile.body.data.totalXp).toBe(220);
    expect(profile.body.data.badges.map((badge: { key: string }) => badge.key).sort()).toEqual(['FAST_LEARNER', 'STREAK_7']);
    // 100 XP dan oshgani uchun 3-daraja
    expect(profile.body.data.level.number).toBe(3);
    expect(profile.body.data.nextLevel).toBeNull();
    expect(profile.body.data.progress).toBe(100);
  });

  it('reyting davr bo‘yicha saralanadi va filtrlanadi', async () => {
    const course = await createCourse();
    const otherCourse = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const otherGroup = await createGroup({ courseId: otherCourse.id, teacherId: teacher.id });
    const best = await enroll(course.id, group.id, 'Aziz');
    const second = await enroll(course.id, group.id, 'Bek');
    const outsider = await enroll(otherCourse.id, otherGroup.id, 'Sardor');

    await markDay(token, group.id, '2026-09-08', [
      { studentId: best.id, status: 'PRESENT' },
      { studentId: second.id, status: 'LATE' },
    ]);
    await markDay(token, group.id, '2026-09-10', [{ studentId: best.id, status: 'PRESENT' }]);
    await markDay(token, otherGroup.id, '2026-09-10', [{ studentId: outsider.id, status: 'PRESENT' }]);

    const all = await request(app).get('/api/gamification/leaderboard?period=all').set(bearer(adminToken));
    const byCourse = await request(app).get(`/api/gamification/leaderboard?period=month&courseId=${course.id}`).set(bearer(adminToken));

    expect(all.body.data).toHaveLength(3);
    expect(all.body.data[0]).toMatchObject({ rank: 1, firstName: 'Aziz', xp: 20, totalXp: 20 });
    expect(all.body.data[1]).toMatchObject({ rank: 2, firstName: 'Sardor', xp: 10 });
    expect(all.body.data[2]).toMatchObject({ firstName: 'Bek', xp: 5 });
    expect(byCourse.body.data.map((row: { firstName: string }) => row.firstName)).toEqual(['Aziz', 'Bek']);
  });

  it('admin XP qoidasini o‘zgartiradi va yangi ball qo‘llanadi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    const rules = await request(app).get('/api/gamification/rules').set(bearer(adminToken));
    const presentRule = rules.body.data.find((rule: { key: string }) => rule.key === 'ATTENDANCE_PRESENT');
    const updated = await request(app)
      .put(`/api/gamification/rules/${presentRule.id}`)
      .set(bearer(adminToken))
      .send({ points: 25 });

    await markDay(token, group.id, '2026-09-08', [{ studentId: student.id, status: 'PRESENT' }]);
    const profile = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    expect(updated.body.data).toMatchObject({ key: 'ATTENDANCE_PRESENT', points: 25 });
    expect(profile.body.data.totalXp).toBe(25);
  });

  it('qoida o‘chirilsa XP berilmaydi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    const rules = await request(app).get('/api/gamification/rules').set(bearer(adminToken));
    const presentRule = rules.body.data.find((rule: { key: string }) => rule.key === 'ATTENDANCE_PRESENT');
    await request(app).put(`/api/gamification/rules/${presentRule.id}`).set(bearer(adminToken)).send({ isActive: false });

    await markDay(token, group.id, '2026-09-08', [{ studentId: student.id, status: 'PRESENT' }]);
    const profile = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    expect(profile.body.data.totalXp).toBe(0);
  });

  it('daraja chegarasi o‘zgarsa barcha profillar qayta hisoblanadi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    await markDay(token, group.id, '2026-09-08', [{ studentId: student.id, status: 'PRESENT' }]);

    const levels = await request(app).get('/api/gamification/levels').set(bearer(adminToken));
    const second = levels.body.data.find((level: { number: number }) => level.number === 2);
    const updated = await request(app).put(`/api/gamification/levels/${second.id}`).set(bearer(adminToken)).send({ minXp: 5 });
    const profile = await request(app).get(`/api/gamification/students/${student.id}`).set(bearer(adminToken));

    expect(updated.status).toBe(200);
    expect(profile.body.data.level.number).toBe(2);
    expect(await prisma.gamificationProfile.findFirstOrThrow({ where: { studentId: student.id } })).toMatchObject({
      levelNumber: 2,
    });
  });

  it('qo‘lda XP va nishon berish ishlaydi', async () => {
    const course = await createCourse();
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    const xp = await request(app)
      .post('/api/gamification/xp')
      .set(bearer(adminToken))
      .send({ studentId: student.id, points: 150, description: 'Olimpiadada g‘olib' });

    const badges = await request(app).get('/api/gamification/badges').set(bearer(adminToken));
    const manualBadge = badges.body.data.find((badge: { key: string }) => badge.key === 'TOP_STUDENT');
    const awarded = await request(app)
      .post('/api/gamification/badges/award')
      .set(bearer(adminToken))
      .send({ studentId: student.id, badgeId: manualBadge.id });
    const again = await request(app)
      .post('/api/gamification/badges/award')
      .set(bearer(adminToken))
      .send({ studentId: student.id, badgeId: manualBadge.id });

    // 150 (qo‘lda) + 0 (FAST_LEARNER avtomatik) + 25 (TOP_STUDENT mukofoti)
    expect(xp.body.data.totalXp).toBe(150);
    expect(xp.body.data.badges.map((badge: { key: string }) => badge.key)).toContain('FAST_LEARNER');
    expect(awarded.body.data.totalXp).toBe(175);
    expect(awarded.body.data.badges.map((badge: { key: string }) => badge.key)).toContain('TOP_STUDENT');
    expect(again.status).toBe(409);
  });

  it('ruxsatlarni tekshiradi: o‘qituvchi ko‘radi, o‘zgartira olmaydi', async () => {
    const course = await createCourse();
    const { token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
    const group = await createGroup({ courseId: course.id });
    const student = await enroll(course.id, group.id, 'Aziz');

    const teacherView = await request(app).get('/api/gamification/leaderboard').set(bearer(teacherToken));
    const rules = await request(app).get('/api/gamification/rules').set(bearer(adminToken));
    const teacherEdit = await request(app)
      .put(`/api/gamification/rules/${rules.body.data[0].id}`)
      .set(bearer(teacherToken))
      .send({ points: 99 });
    const accountantView = await request(app).get('/api/gamification/leaderboard').set(bearer(accountantToken));
    const teacherXp = await request(app)
      .post('/api/gamification/xp')
      .set(bearer(teacherToken))
      .send({ studentId: student.id, points: 10, description: 'Test' });

    expect(teacherView.status).toBe(200);
    expect(teacherEdit.status).toBe(403);
    expect(accountantView.status).toBe(403);
    expect(teacherXp.status).toBe(403);
  });
});
