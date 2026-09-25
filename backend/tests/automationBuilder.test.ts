import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { automationService } from '../src/services/automation.service.js';
import { computeNextRun } from '../src/services/automationBuilder.js';
import { dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 13 — avtomatlashtirish quruvchisi (TZ 3.0 §50–51): trigger → shart → amal → kanal →
 * jadval; dry-run; amallar (bildirishnoma, ish, ogohlantirish, vazifa qoralamasi, quiz tavsiyasi);
 * takrorlanmaslik; tizim qoidalari himoyasi; ishlar (tasks).
 */
const app = createApp();
const DAY = 86_400_000;
let phone = 0;

async function student(courseId: string, groupId: string, name: string) {
  phone += 1;
  return prisma.student.create({ data: { firstName: name, lastName: 'Avto', phone: `+99886${String(1_000_000 + phone).slice(-7)}`, courseId, groupId, contractPrice: 1, startDate: new Date('2026-01-01') } });
}

async function setup() {
  const { user: owner, token } = await createUserWithToken(app, { role: 'OWNER' });
  const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse('Backend');
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Back-1' });
  const absent = await student(course.id, group.id, 'Kelmagan');
  const regular = await student(course.id, group.id, 'Muntazam');
  for (const [index, days] of [9, 6, 3].entries()) {
    const date = dateColumn(new Date(Date.now() - days * DAY));
    await prisma.attendance.create({ data: { studentId: absent.id, groupId: group.id, date, status: 'ABSENT' } });
    await prisma.attendance.create({ data: { studentId: regular.id, groupId: group.id, date, status: index === 1 ? 'ABSENT' : 'PRESENT' } });
  }
  return { owner, token, teacher, teacherToken, course, group, absent, regular };
}

const ABSENT_RULE = {
  name: '3 darsga kelmadi',
  trigger: 'STUDENT_ABSENT_STREAK',
  conditions: { threshold: 3 },
  actions: [
    { type: 'NOTIFY', audience: 'TEACHER', channel: 'IN_APP' },
    { type: 'NOTIFY', audience: 'MANAGER', channel: 'BOTH' },
    { type: 'CREATE_ALERT', severity: 'WARNING' },
    { type: 'CREATE_TASK', assignee: 'TEACHER', dueDays: 1 },
  ],
  schedule: 'DAILY',
  scheduleHour: 9,
};

describe.skipIf(!hasTestDatabase)('Avtomatlashtirish quruvchisi (PHASE 13)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('jadval: har soat, har kuni belgilangan soatda, haftaning kunida (o‘quv markaz vaqti)', () => {
    const now = new Date('2026-09-26T05:00:00.000Z'); // Toshkent 10:00, shanba
    expect(computeNextRun('HOURLY', 9, 1, now).toISOString()).toBe('2026-09-26T06:00:00.000Z');
    expect(computeNextRun('DAILY', 9, 1, now).toISOString()).toBe('2026-09-27T04:00:00.000Z');
    expect(computeNextRun('DAILY', 18, 1, now).toISOString()).toBe('2026-09-26T13:00:00.000Z');
    expect(computeNextRun('WEEKLY', 9, 1, now).toISOString()).toBe('2026-09-28T04:00:00.000Z'); // dushanba 09:00
  });

  it('qoida yaratish, sinov (dry-run), bajarish: bildirishnoma, ogohlantirish, ish — takrorlanmaydi', async () => {
    const { token, teacher, absent } = await setup();

    const dry = await request(app).post('/api/automation/test').set(bearer(token)).send({ trigger: 'STUDENT_ABSENT_STREAK', conditions: { threshold: 3 } });
    expect(dry.status).toBe(200);
    expect(dry.body.data).toMatchObject({ matched: 1, sample: [{ name: 'Kelmagan Avto', group: 'Back-1', detail: 'ketma-ket 3 darsga kelmadi' }] });
    // Sinov hech narsa yubormaydi
    expect(await prisma.notification.count()).toBe(0);

    const created = await request(app).post('/api/automation').set(bearer(token)).send(ABSENT_RULE);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ isCustom: true, trigger: 'STUDENT_ABSENT_STREAK', schedule: 'DAILY', actions: expect.arrayContaining([expect.objectContaining({ type: 'CREATE_TASK' })]) });
    // Jadval bo'yicha keyingi yurish — hozir emas; majburan ishga tushiramiz
    await prisma.automationRule.update({ where: { key: created.body.data.key }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await automationService.runAll();

    const teacherNotes = await prisma.notification.findMany({ where: { userId: teacher.id, type: 'SYSTEM' } });
    expect(teacherNotes).toHaveLength(1);
    expect(teacherNotes[0]!.message).toBe('Kelmagan Avto (Back-1): ketma-ket 3 darsga kelmadi.');
    // Kanal IN_APP — o'qituvchi uchun Telegram navbati yo'q
    expect(await prisma.notificationDelivery.count({ where: { dedupeKey: { contains: ':TEACHER:' } } })).toBe(0);
    expect(await prisma.alert.findMany({ where: { type: 'ACADEMIC_RISK' }, select: { entityId: true, severity: true } })).toEqual([{ entityId: absent.id, severity: 'WARNING' }]);
    const tasks = await prisma.task.findMany({ select: { assigneeId: true, title: true, link: true, status: true } });
    expect(tasks).toEqual([{ assigneeId: teacher.id, title: '3 darsga kelmadi: Kelmagan Avto', link: `/students/${absent.id}`, status: 'OPEN' }]);
    const run = await prisma.automationRun.findFirstOrThrow({ where: { rule: { key: created.body.data.key } } });
    expect(run).toMatchObject({ matched: 1, actionsDone: 2 });
    const rule = await prisma.automationRule.findUniqueOrThrow({ where: { key: created.body.data.key } });
    expect(rule.nextRunAt!.getTime()).toBeGreaterThan(Date.now());

    // Shu kuni qayta yurish — takror yo'q
    await prisma.automationRule.update({ where: { key: created.body.data.key }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await automationService.runAll();
    expect(await prisma.notification.count({ where: { userId: teacher.id } })).toBe(1);
    expect(await prisma.task.count()).toBe(1);
    expect(await prisma.alert.count({ where: { type: 'ACADEMIC_RISK' } })).toBe(1);
  });

  it('past natija → vazifa qoralamasi va quiz tavsiyasi (o‘qituvchi tasdiqlaydi); o‘zlashtirish past', async () => {
    const { token, teacher, group, course, regular } = await setup();
    const exam = await prisma.exam.create({ data: { title: 'Nazorat', groupId: group.id, date: dateColumn(new Date(Date.now() - DAY)), maxScore: 100, status: 'GRADED' } });
    await prisma.examResult.create({ data: { examId: exam.id, studentId: regular.id, score: 35, percentage: 35 } });
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: 'API' } });
    const topic = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'REST' } });
    await prisma.topicMastery.create({ data: { studentId: regular.id, topicId: topic.id, score: 25, status: 'LEARNING', calculatedAt: new Date() } });

    const examRule = await request(app).post('/api/automation').set(bearer(token)).send({ name: 'Past imtihon', trigger: 'EXAM_SCORE_LOW', conditions: { threshold: 60 }, actions: [{ type: 'ASSIGN_HOMEWORK', dueDays: 4 }], schedule: 'HOURLY' });
    const masteryRule = await request(app).post('/api/automation').set(bearer(token)).send({ name: 'Zaif mavzu', trigger: 'MASTERY_LOW', conditions: { threshold: 40 }, actions: [{ type: 'RECOMMEND_QUIZ' }], schedule: 'WEEKLY', scheduleWeekday: 1 });
    expect([examRule.status, masteryRule.status]).toEqual([201, 201]);
    await prisma.automationRule.updateMany({ where: { isCustom: true }, data: { nextRunAt: null } });
    await automationService.runAll();

    const draft = await prisma.homework.findFirstOrThrow({ where: { groupId: group.id }, select: { status: true, targetType: true, submissions: { select: { studentId: true } } } });
    expect(draft).toEqual({ status: 'DRAFT', targetType: 'INDIVIDUAL', submissions: [{ studentId: regular.id }] });
    const tasks = await prisma.task.findMany({ where: { assigneeId: teacher.id }, orderBy: { title: 'asc' }, select: { title: true, link: true } });
    expect(tasks).toEqual([
      { title: 'Qoralama vazifani ko‘rib chiqing: Muntazam Avto', link: '/homework' },
      { title: 'Quiz tavsiya: REST', link: `/teaching/groups/${group.id}` },
    ]);
  });

  it('validatsiya va himoya: noma’lum amal/trigger 422, tizim qoidasi o‘chirilmaydi, o‘qituvchi yarata olmaydi', async () => {
    const { token, teacherToken, course } = await setup();
    const bad = await Promise.all([
      request(app).post('/api/automation').set(bearer(token)).send({ ...ABSENT_RULE, actions: [{ type: 'RUN_SQL', query: 'DROP TABLE' }] }),
      request(app).post('/api/automation').set(bearer(token)).send({ ...ABSENT_RULE, trigger: 'PAYMENT_OVERDUE' }),
      request(app).post('/api/automation').set(bearer(token)).send({ ...ABSENT_RULE, actions: [] }),
      request(app).post('/api/automation').set(bearer(token)).send({ ...ABSENT_RULE, conditions: { threshold: 3, hack: 1 } }),
      request(app).post('/api/automation').set(bearer(token)).send({ ...ABSENT_RULE, conditions: { groupId: 'yoq-guruh' } }),
    ]);
    expect(bad.map((response) => response.status)).toEqual([422, 422, 422, 422, 422]);
    expect((await request(app).post('/api/automation').set(bearer(teacherToken)).send(ABSENT_RULE)).status).toBe(403);

    const system = await prisma.automationRule.create({ data: { key: 'sys_test', name: 'Tizim', trigger: 'PAYMENT_OVERDUE', audience: 'STAFF' } });
    expect((await request(app).delete(`/api/automation/${system.key}`).set(bearer(token))).status).toBe(422);
    expect((await request(app).put(`/api/automation/custom/${system.key}`).set(bearer(token)).send(ABSENT_RULE)).status).toBe(422);

    const custom = (await request(app).post('/api/automation').set(bearer(token)).send({ ...ABSENT_RULE, conditions: { threshold: 3, courseId: course.id } })).body.data;
    const edited = await request(app).put(`/api/automation/custom/${custom.key}`).set(bearer(token)).send({ ...ABSENT_RULE, name: 'Yangi nom', isActive: false });
    expect(edited.body.data).toMatchObject({ name: 'Yangi nom', isActive: false });
    expect((await request(app).delete(`/api/automation/${custom.key}`).set(bearer(token))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ['automation.rule_created', 'automation.rule_updated', 'automation.rule_deleted'] } } })).toBe(3);
  });

  it('ishlar: o‘qituvchi o‘zinikini ko‘radi va bajaradi; begona ishni o‘zgartira olmaydi; kabinetga yopiq', async () => {
    const { token, teacher, teacherToken } = await setup();
    const { user: other, token: otherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const mine = await prisma.task.create({ data: { title: 'Mening ishim', assigneeId: teacher.id, dueAt: new Date(Date.now() - DAY) } });
    await prisma.task.create({ data: { title: 'Begona ish', assigneeId: other.id } });

    const list = (await request(app).get('/api/tasks').set(bearer(teacherToken))).body.data;
    expect(list).toMatchObject({ openCount: 1, items: [{ title: 'Mening ishim', overdue: true }] });
    expect((await request(app).patch(`/api/tasks/${mine.id}`).set(bearer(otherToken)).send({ status: 'DONE' })).status).toBe(404);
    const done = await request(app).patch(`/api/tasks/${mine.id}`).set(bearer(teacherToken)).send({ status: 'DONE' });
    expect(done.body.data).toMatchObject({ status: 'DONE', overdue: false });

    const all = (await request(app).get('/api/tasks').query({ scope: 'all' }).set(bearer(token))).body.data;
    expect(all.items).toHaveLength(2);
    // O'qituvchi scope=all so'rasa ham faqat o'zinikini ko'radi
    expect((await request(app).get('/api/tasks').query({ scope: 'all' }).set(bearer(teacherToken))).body.data.items).toHaveLength(1);
  });
});
