import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { studentRiskService } from '../src/services/studentRisk.service.js';
import { businessDateString, dateColumn } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 10 — bildirishnoma hodisalari (TZ 3.0 §42): imtihon rejalashtirildi, past natija,
 * darsga kechikdi, xavf oshdi. Kanal: ilova ichida (kabinet hisobi) + Telegram navbati.
 */
const app = createApp();
const DAY = 86_400_000;
let phone = 0;

async function family(courseId: string, groupId: string, admin: string, name = 'Anvar') {
  phone += 1;
  const student = await prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99899${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date(Date.now() - 120 * DAY),
      debt: { create: { totalAmount: 1_000_000, paidAmount: 1_000_000, remainingAmount: 0 } },
    },
  });
  const parent = await prisma.parent.create({
    data: { firstName: 'Ota', lastName: name, phone: `+99898${String(1_000_000 + phone).slice(-7)}`, students: { create: [{ studentId: student.id, isPrimary: true }] } },
  });
  const studentAccount = await request(app).post(`/api/students/${student.id}/portal-account`).set(bearer(admin)).send({});
  const parentAccount = await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
  return {
    student,
    parent,
    studentUserId: (await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).userId!,
    parentUserId: (await prisma.parent.findUniqueOrThrow({ where: { id: parent.id } })).userId!,
    ok: studentAccount.status === 201 && parentAccount.status === 201,
  };
}

async function notificationsOf(userId: string, type: string) {
  return prisma.notification.findMany({ where: { userId, type: type as never }, select: { title: true, message: true } });
}

describe.skipIf(!hasTestDatabase)('Bildirishnoma hodisalari (PHASE 10)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('imtihon rejalashtirildi: kelgusi imtihon — o‘quvchi va ota-onaga; o‘tgan sana — yo‘q; sana o‘zgarsa qayta', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Frontend-7' });
    const { studentUserId, parentUserId, ok } = await family(course.id, group.id, admin);
    expect(ok).toBe(true);
    const future = businessDateString(new Date(Date.now() + 5 * DAY));

    const created = await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Oylik test', groupId: group.id, date: future, isOnline: true });
    expect(created.status).toBe(201);
    const forStudent = await notificationsOf(studentUserId, 'EXAM_SCHEDULED');
    expect(forStudent).toEqual([expect.objectContaining({ title: 'Imtihon rejalashtirildi' })]);
    expect(forStudent[0]!.message).toContain('Frontend-7: «Oylik test»');
    expect(forStudent[0]!.message).toContain('Kabinetdan onlayn topshiriladi');
    expect(await notificationsOf(parentUserId, 'EXAM_SCHEDULED')).toHaveLength(1);

    // Sarlavha o'zgardi — takror xabar yo'q; sana o'zgardi — yangi xabar
    await request(app).put(`/api/exams/${created.body.data.id}`).set(bearer(token)).send({ title: 'Oylik test (yangilangan)' });
    expect(await notificationsOf(studentUserId, 'EXAM_SCHEDULED')).toHaveLength(1);
    await request(app).put(`/api/exams/${created.body.data.id}`).set(bearer(token)).send({ date: businessDateString(new Date(Date.now() + 7 * DAY)) });
    expect(await notificationsOf(studentUserId, 'EXAM_SCHEDULED')).toHaveLength(2);

    await request(app).post('/api/exams').set(bearer(token)).send({ title: 'O‘tgan imtihon', groupId: group.id, date: '2026-01-10' });
    expect(await notificationsOf(studentUserId, 'EXAM_SCHEDULED')).toHaveLength(2);
  });

  it('past natija: faqat ota-onaga, yumshoq; yaxshi natijada yo‘q (imtihon va vazifa)', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const low = await family(course.id, group.id, admin, 'Past');
    const high = await family(course.id, group.id, admin, 'Yuqori');

    const exam = await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Oraliq', groupId: group.id, date: '2026-09-10', maxScore: 100, passScore: 60 });
    const saved = await request(app)
      .put(`/api/exams/${exam.body.data.id}/results`)
      .set(bearer(token))
      .send({ records: [{ studentId: low.student.id, score: 45 }, { studentId: high.student.id, score: 90 }] });
    expect(saved.status).toBe(200);
    const parentLow = await notificationsOf(low.parentUserId, 'LOW_SCORE');
    expect(parentLow).toHaveLength(1);
    expect(parentLow[0]!.message).toContain('«Oraliq» imtihonida 45% natija');
    expect(parentLow[0]!.message).toContain('foydali bo‘ladi');
    expect(parentLow[0]!.message).not.toMatch(/yomon|dangasa|xavf/i);
    expect(await notificationsOf(low.studentUserId, 'LOW_SCORE')).toHaveLength(0);
    expect(await notificationsOf(high.parentUserId, 'LOW_SCORE')).toHaveLength(0);

    const homework = await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Formalar', groupId: group.id, deadline: new Date(Date.now() + DAY).toISOString(), maxPoints: 100 });
    await request(app).patch(`/api/homework/${homework.body.data.id}/submissions/${low.student.id}`).set(bearer(token)).send({ status: 'GRADED', score: 30 });
    await request(app).patch(`/api/homework/${homework.body.data.id}/submissions/${high.student.id}`).set(bearer(token)).send({ status: 'GRADED', score: 80 });
    expect((await notificationsOf(low.parentUserId, 'LOW_SCORE')).map((row) => row.message).join(' ')).toContain('«Formalar» vazifasida 30% natija');
    expect(await notificationsOf(high.parentUserId, 'LOW_SCORE')).toHaveLength(0);
  });

  it('darsga kechikdi: ota-onaga xabar, o‘quvchiga emas; keldi — xabar yo‘q', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Python-3' });
    const late = await family(course.id, group.id, admin, 'Kechikdi');
    const onTime = await family(course.id, group.id, admin, 'Vaqtida');
    const marked = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-21', records: [{ studentId: late.student.id, status: 'LATE' }, { studentId: onTime.student.id, status: 'PRESENT' }] });
    expect(marked.status).toBe(200);
    expect(await notificationsOf(late.parentUserId, 'ATTENDANCE_LATE')).toEqual([{ title: 'Darsga kechikib keldi', message: 'Python-3 guruhidagi 21.09.2026 kungi darsga kechikib keldi.' }]);
    expect(await notificationsOf(late.studentUserId, 'ATTENDANCE_LATE')).toHaveLength(0);
    expect(await notificationsOf(onTime.parentUserId, 'ATTENDANCE_LATE')).toHaveLength(0);
    // Qayta saqlash — takror xabar yo'q
    await request(app).post(`/api/groups/${group.id}/attendance`).set(bearer(token)).send({ date: '2026-09-21', records: [{ studentId: late.student.id, status: 'LATE' }] });
    expect(await notificationsOf(late.parentUserId, 'ATTENDANCE_LATE')).toHaveLength(1);
  });

  it('xavf oshdi: guruh o‘qituvchisiga sabablar bilan; birinchi hisobda va takror yurishda — yo‘q', async () => {
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id, name: 'Web-1' });
    const student = await prisma.student.create({
      data: {
        firstName: 'Sardor',
        lastName: 'Test',
        phone: '+998977770001',
        courseId: course.id,
        groupId: group.id,
        contractPrice: 1_000_000,
        startDate: new Date(Date.now() - 120 * DAY),
        debt: { create: { totalAmount: 1_000_000, paidAmount: 1_000_000, remainingAmount: 0 } },
      },
    });
    const mark = async (offset: number, status: 'PRESENT' | 'ABSENT') => {
      const date = dateColumn(new Date(Date.now() - offset * DAY));
      await prisma.attendanceSession.upsert({ where: { groupId_date: { groupId: group.id, date } }, update: {}, create: { groupId: group.id, date, status: 'HELD' } });
      await prisma.attendance.create({ data: { studentId: student.id, groupId: group.id, date, status } });
    };
    for (const offset of [20, 17, 14, 11]) await mark(offset, 'PRESENT');

    // Birinchi hisob — oldingi daraja yo'q, xabar ketmaydi
    await studentRiskService.recalculateAll();
    expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).riskLevel).toBe('HEALTHY');
    for (const offset of [8, 6, 4, 2]) await mark(offset, 'ABSENT');
    const result = await studentRiskService.recalculateAll();
    expect(result.increased).toBe(1);
    const sent = await notificationsOf(teacher.id, 'RISK_INCREASED');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.message).toMatch(/^Sardor Test \(Web-1\): barqaror → (xavf ostida|kritik)\. Sabablar: /);
    expect(sent[0]!.message).toContain('Ketma-ket kelmaslik');

    await studentRiskService.recalculateAll();
    expect(await notificationsOf(teacher.id, 'RISK_INCREASED')).toHaveLength(1);
  });
});
