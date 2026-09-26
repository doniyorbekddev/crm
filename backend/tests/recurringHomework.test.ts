import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { businessMoment, occursOn, recurringHomeworkService } from '../src/services/recurringHomework.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * TZ 3.1 GAP-18 / §40: Schedule created → Scheduler runs → Homework generated → Second run → No duplicate.
 * Sanalar kelajakda (2030-10-07 — dushanba, 2030-10-12 — shanba, UTC+5) — yaratilganda "bugungi" takrorlanish
 * real soat bilan chalkashmasin.
 */
const app = createApp();
const MONDAY = '2030-10-07';
const SATURDAY = '2030-10-12';
let phone = 0;

async function classroom() {
  const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: `Frontend ${phone}` });
  const students = [];
  for (const name of ['Ali', 'Vali']) {
    phone += 1;
    students.push(
      await prisma.student.create({
        data: { firstName: name, lastName: 'Takror', phone: `+99884${String(1_000_000 + phone).slice(-7)}`, courseId: course.id, groupId: group.id, contractPrice: 1, startDate: new Date('2026-01-01') },
      }),
    );
  }
  return { teacher, token, group, students };
}

const schedule = (groupId: string, extra: object = {}) => ({
  groupId,
  title: 'JavaScript Practice',
  frequency: 'WEEKDAYS',
  weekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  startDate: '2030-10-01',
  endDate: '2030-10-31',
  publishTime: '08:00',
  deadlineTime: '23:59',
  ...extra,
});

describe('jadval hisobi', () => {
  it('occursOn: kunlik, haftalik, tanlangan kunlar, oraliq chegaralari', () => {
    const base = { startDate: '2030-10-01', endDate: '2030-10-31' };
    expect(occursOn({ ...base, frequency: 'DAILY', weekdays: [] }, SATURDAY)).toBe(true);
    expect(occursOn({ ...base, frequency: 'WEEKDAYS', weekdays: ['MONDAY', 'FRIDAY'] }, MONDAY)).toBe(true);
    expect(occursOn({ ...base, frequency: 'WEEKDAYS', weekdays: ['MONDAY', 'FRIDAY'] }, SATURDAY)).toBe(false);
    expect(occursOn({ ...base, frequency: 'WEEKLY', weekdays: ['SATURDAY'] }, SATURDAY)).toBe(true);
    expect(occursOn({ ...base, frequency: 'DAILY', weekdays: [] }, '2030-09-30')).toBe(false);
    expect(occursOn({ ...base, frequency: 'DAILY', weekdays: [] }, '2030-11-01')).toBe(false);
  });

  it('businessMoment: o‘quv markaz vaqti (UTC+5) va kun siljishi', () => {
    expect(businessMoment(MONDAY, '23:59').toISOString()).toBe('2030-10-07T18:59:00.000Z');
    expect(businessMoment(MONDAY, '10:00', 2).toISOString()).toBe('2030-10-09T05:00:00.000Z');
  });
});

describe.skipIf(!hasTestDatabase)('Takrorlanuvchi uy vazifasi (GAP-18, §40)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('§40: jadval → generator → vazifa (o‘quvchilar, bildirishnoma) → ikkinchi yurish — dublikat yo‘q', async () => {
    const { token, group, students } = await classroom();
    await prisma.telegramLink.create({ data: { studentId: students[0]!.id, linkCode: 'rh-link', chatId: '88001', verifiedAt: new Date() } });
    const created = await request(app).post('/api/homework/recurring').set(bearer(token)).send(schedule(group.id)).expect(201);
    expect(created.body.data).toMatchObject({ frequency: 'WEEKDAYS', isActive: true, generated: 0 });

    // E'lon vaqtidan oldin — hali yo'q
    expect(await recurringHomeworkService.generate(businessMoment(MONDAY, '07:30'))).toEqual({ created: 0, skipped: 0 });
    expect(await prisma.homework.count()).toBe(0);

    const first = await recurringHomeworkService.generate(businessMoment(MONDAY, '08:05'));
    expect(first.created).toBe(1);
    const homework = await prisma.homework.findFirstOrThrow({ include: { submissions: true } });
    expect(homework).toMatchObject({ title: 'JavaScript Practice', groupId: group.id, status: 'PUBLISHED', recurringHomeworkId: created.body.data.id });
    expect(homework.deadline.toISOString()).toBe('2030-10-07T18:59:00.000Z');
    expect(homework.occurrenceDate?.toISOString().slice(0, 10)).toBe(MONDAY);
    expect(homework.submissions).toHaveLength(2);
    expect(await prisma.notificationDelivery.count({ where: { title: 'Yangi uy vazifasi', telegramLink: { studentId: students[0]!.id } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'homework.created', userId: null } })).toBe(1);

    // Ikkinchi va parallel yurishlar — dublikat yo'q
    expect((await recurringHomeworkService.generate(businessMoment(MONDAY, '12:00'))).created).toBe(0);
    await Promise.all([1, 2, 3].map(() => recurringHomeworkService.generate(businessMoment(MONDAY, '13:00'))));
    expect(await prisma.homework.count()).toBe(1);
    expect(await prisma.homeworkSubmission.count()).toBe(2);

    // Ertasi kuni — yangisi
    expect((await recurringHomeworkService.generate(businessMoment('2030-10-08', '09:00'))).created).toBe(1);
    const list = (await request(app).get('/api/homework/recurring').set(bearer(token)).expect(200)).body.data;
    expect(list[0]).toMatchObject({ generated: 2 });

    // Yangi kun, uchta parallel yurish — unikal indeks bittasini qoldiradi
    const results = await Promise.all([1, 2, 3].map(() => recurringHomeworkService.generate(businessMoment('2030-10-09', '09:00'))));
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1);
    expect(await prisma.homework.count({ where: { occurrenceDate: new Date('2030-10-09T00:00:00Z') } })).toBe(1);
  });

  it('yaratilmaydi: dam olish kuni, boshlanishdan oldin, tugagandan keyin, to‘xtatilgan, guruh faol emas, muddat o‘tib ketgan', async () => {
    const { token, group } = await classroom();
    const id = (await request(app).post('/api/homework/recurring').set(bearer(token)).send(schedule(group.id)).expect(201)).body.data.id as string;
    expect((await recurringHomeworkService.generate(businessMoment(SATURDAY, '09:00'))).created).toBe(0);
    expect((await recurringHomeworkService.generate(businessMoment('2030-09-30', '09:00'))).created).toBe(0);
    expect((await recurringHomeworkService.generate(businessMoment('2030-11-04', '09:00'))).created).toBe(0);
    // Server kechikib ishga tushdi — muddat o'tib ketgan kun uchun vazifa berilmaydi
    expect(await recurringHomeworkService.generate(new Date(businessMoment(MONDAY, '23:59').getTime() + 30_000))).toEqual({ created: 0, skipped: 1 });

    await request(app).patch(`/api/homework/recurring/${id}`).set(bearer(token)).send({ isActive: false }).expect(200);
    expect((await recurringHomeworkService.generate(businessMoment('2030-10-08', '09:00'))).created).toBe(0);
    await request(app).patch(`/api/homework/recurring/${id}`).set(bearer(token)).send({ isActive: true }).expect(200);
    await prisma.group.update({ where: { id: group.id }, data: { status: 'COMPLETED' } });
    expect((await recurringHomeworkService.generate(businessMoment('2030-10-08', '09:00'))).created).toBe(0);
    expect(await prisma.homework.count()).toBe(0);
  });

  it('haftalik va muddat siljishi; jadval o‘chirilsa yaratilgan vazifa qoladi', async () => {
    const { token, group } = await classroom();
    const id = (
      await request(app)
        .post('/api/homework/recurring')
        .set(bearer(token))
        .send(schedule(group.id, { frequency: 'WEEKLY', weekdays: ['SATURDAY'], deadlineOffsetDays: 2, deadlineTime: '10:00', endDate: null }))
        .expect(201)
    ).body.data.id as string;
    expect((await recurringHomeworkService.generate(businessMoment(MONDAY, '09:00'))).created).toBe(0);
    expect((await recurringHomeworkService.generate(businessMoment(SATURDAY, '09:00'))).created).toBe(1);
    expect((await prisma.homework.findFirstOrThrow()).deadline.toISOString()).toBe(businessMoment(SATURDAY, '10:00', 2).toISOString());

    await request(app).delete(`/api/homework/recurring/${id}`).set(bearer(token)).expect(200);
    expect(await prisma.recurringHomework.count()).toBe(0);
    expect(await prisma.homework.findFirstOrThrow()).toMatchObject({ recurringHomeworkId: null });
    expect(await prisma.auditLog.count({ where: { action: { in: ['homework.recurring_created', 'homework.recurring_deleted'] } } })).toBe(2);
  });

  it('bugun takrorlanish kuni va e’lon vaqti o‘tgan bo‘lsa — yaratilganda darhol beriladi (dublikatsiz)', async () => {
    const { token, group } = await classroom();
    const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    const created = await request(app)
      .post('/api/homework/recurring')
      .set(bearer(token))
      .send(schedule(group.id, { frequency: 'DAILY', weekdays: [], startDate: today, endDate: null, publishTime: '00:00', deadlineTime: '23:59', deadlineOffsetDays: 1 }))
      .expect(201);
    expect(created.body.data.generated).toBe(1);
    expect((await recurringHomeworkService.generate(new Date())).created).toBe(0);
    expect(await prisma.homework.count({ where: { recurringHomeworkId: created.body.data.id } })).toBe(1);
  });

  it('validatsiya — 422: haftalikda 2 kun, muddat e’londan oldin, tugash boshlanishdan oldin, noma’lum maydon, noto‘g‘ri vaqt', async () => {
    const { token, group } = await classroom();
    const post = (extra: object) => request(app).post('/api/homework/recurring').set(bearer(token)).send(schedule(group.id, extra));
    expect((await post({ frequency: 'WEEKLY', weekdays: ['MONDAY', 'FRIDAY'] })).status).toBe(422);
    expect((await post({ frequency: 'WEEKDAYS', weekdays: [] })).status).toBe(422);
    expect((await post({ publishTime: '20:00', deadlineTime: '09:00' })).status).toBe(422);
    expect((await post({ startDate: '2030-10-12', endDate: '2030-10-01' })).status).toBe(422);
    expect((await post({ extra: true })).status).toBe(422);
    expect((await post({ deadlineTime: '25:00' })).status).toBe(422);
    const created = await post({});
    const patch = await request(app).patch(`/api/homework/recurring/${created.body.data.id}`).set(bearer(token)).send({ deadlineTime: '07:00' });
    expect(patch.status).toBe(422);
    expect(await prisma.recurringHomework.count()).toBe(1);
  });

  it('ruxsat va doira: begona guruh — rad, boshqa o‘qituvchi ko‘rmaydi/o‘zgartirmaydi, buxgalter — 403', async () => {
    const { token, group } = await classroom();
    const other = await classroom();
    expect((await request(app).post('/api/homework/recurring').set(bearer(token)).send(schedule(other.group.id))).status).toBe(422);
    const id = (await request(app).post('/api/homework/recurring').set(bearer(token)).send(schedule(group.id)).expect(201)).body.data.id as string;

    expect((await request(app).get('/api/homework/recurring').set(bearer(other.token)).expect(200)).body.data).toEqual([]);
    expect((await request(app).patch(`/api/homework/recurring/${id}`).set(bearer(other.token)).send({ isActive: false })).status).toBe(404);
    expect((await request(app).delete(`/api/homework/recurring/${id}`).set(bearer(other.token))).status).toBe(404);

    const { token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    expect((await request(app).post('/api/homework/recurring').set(bearer(accountant)).send(schedule(group.id))).status).toBe(403);
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    expect((await request(app).get('/api/homework/recurring').set(bearer(admin)).expect(200)).body.data).toHaveLength(1);
  });
});
