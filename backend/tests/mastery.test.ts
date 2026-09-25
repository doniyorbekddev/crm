import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { runNightlyProgress } from '../src/jobs/progress.job.js';
import { currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 7 — mavzu bo'yicha o'zlashtirish (TZ 3.0 §26–27): imtihon mavzu kesimi, mavzuli vazifa,
 * davomat va darslar → 0–100 baho va holat; sozlanadigan chegaralar; guruh matritsasi; kabinet;
 * tungi qayta hisob va oylik snapshot.
 */
const app = createApp();
let phone = 0;

async function createStudent(courseId: string, groupId: string, name: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99895${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 400_000 } },
    },
  });
}

async function setup() {
  const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
  const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse('JavaScript');
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
  const module = await request(app).post(`/api/courses/${course.id}/modules`).set(bearer(admin)).send({ title: 'Asoslar' });
  const topic = async (title: string) =>
    (await request(app).post(`/api/curriculum/modules/${module.body.data.id}/topics`).set(bearer(admin)).send({ title })).body.data.id as string;
  const topics = { arrays: await topic('Massivlar'), functions: await topic('Funksiyalar'), dom: await topic('DOM'), async: await topic('Async') };
  const anvar = await createStudent(course.id, group.id, 'Anvar');
  const barno = await createStudent(course.id, group.id, 'Barno');
  return { admin, token, course, group, topics, anvar, barno };
}

async function question(token: string, courseId: string, topicId: string, text: string) {
  const response = await request(app)
    .post('/api/questions')
    .set(bearer(token))
    .send({ courseId, topicId, text, options: [{ text: 'Ha', isCorrect: true }, { text: 'Yo‘q' }] });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; options: Array<{ id: string; isCorrect: boolean }> };
}

/** 2 ta "Massivlar" + 2 ta "Funksiyalar" savolli imtihon; xodim javoblarni kiritadi */
async function examWithAnswers(token: string, courseId: string, groupId: string, topics: { arrays: string; functions: string }) {
  const questions = [
    await question(token, courseId, topics.arrays, 'Massiv savoli bir'),
    await question(token, courseId, topics.arrays, 'Massiv savoli ikki'),
    await question(token, courseId, topics.functions, 'Funksiya savoli bir'),
    await question(token, courseId, topics.functions, 'Funksiya savoli ikki'),
  ];
  const exam = await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Oylik', groupId, date: '2026-09-20', maxScore: 100 });
  const examId = exam.body.data.id as string;
  await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: questions.map((row) => row.id) });
  const attached = (await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token))).body.data as Array<{ examQuestionId: string; text: string }>;
  const texts = ['Massiv savoli bir', 'Massiv savoli ikki', 'Funksiya savoli bir', 'Funksiya savoli ikki'];
  const answerFor = (correct: boolean[]) =>
    questions.map((row, index) => ({
      examQuestionId: attached.find((item) => item.text === texts[index])!.examQuestionId,
      optionIds: [row.options.find((option) => option.isCorrect === correct[index])!.id],
    }));
  return { examId, answerFor };
}

type TopicRow = { topicId: string; title: string; score: number | null; status: string; level: string | null; sources: Record<string, number | null> };
const topicOf = (body: { modules: Array<{ topics: TopicRow[] }> }, topicId: string) => body.modules.flatMap((module) => module.topics).find((topic) => topic.topicId === topicId)!;

describe.skipIf(!hasTestDatabase)('Mavzu o‘zlashtirish (PHASE 7)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('imtihon mavzu kesimi + mavzuli vazifa → baho, holat va daraja; dalilsiz mavzu NOT_STARTED', async () => {
    const { token, course, group, topics, anvar } = await setup();
    const { examId, answerFor } = await examWithAnswers(token, course.id, group.id, topics);
    const submitted = await request(app).post(`/api/exams/${examId}/attempts/${anvar.id}`).set(bearer(token)).send({ answers: answerFor([true, true, true, false]) });
    expect(submitted.status).toBe(201);

    let body = (await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(token))).body.data;
    expect(topicOf(body, topics.arrays)).toMatchObject({ score: 100, status: 'MASTERED', level: 'MASTERED', sources: { exam: 100, homework: null } });
    expect(topicOf(body, topics.functions)).toMatchObject({ score: 50, status: 'LEARNING', level: 'DEVELOPING' });
    expect(topicOf(body, topics.dom)).toMatchObject({ score: null, status: 'NOT_STARTED', level: null });
    expect(body.overall).toMatchObject({ score: 75, mastered: 1, learning: 1, notStarted: 2, topics: 4 });

    // Mavzuli vazifa 70/100 → Funksiyalar: (50·50 + 70·30) / 80 = 58
    const homework = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Funksiyalar mashqi', groupId: group.id, deadline: new Date(Date.now() + 86_400_000).toISOString(), topicId: topics.functions, status: 'PUBLISHED' });
    expect(homework.status).toBe(201);
    const graded = await request(app).patch(`/api/homework/${homework.body.data.id}/submissions/${anvar.id}`).set(bearer(token)).send({ status: 'GRADED', score: 70 });
    expect(graded.status).toBe(200);
    body = (await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(token))).body.data;
    expect(topicOf(body, topics.functions)).toMatchObject({ score: 58, status: 'LEARNING', sources: { exam: 50, homework: 70 } });

    // Qayta topshirish: har imtihondan faqat oxirgi baholangan urinish hisoblanadi
    await request(app).post(`/api/exams/${examId}/attempts/${anvar.id}`).set(bearer(token)).send({ answers: answerFor([true, false, true, true]) });
    body = (await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(token))).body.data;
    expect(topicOf(body, topics.arrays)).toMatchObject({ score: 50, sources: { exam: 50 } });
    expect(topicOf(body, topics.functions).sources.exam).toBe(100);

    // Imtihon bekor qilinsa — mavzu kesimi hisobdan chiqadi
    await request(app).put(`/api/exams/${examId}`).set(bearer(token)).send({ status: 'CANCELLED' });
    body = (await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(token))).body.data;
    expect(topicOf(body, topics.arrays)).toMatchObject({ score: null, status: 'NOT_STARTED' });
    expect(topicOf(body, topics.functions)).toMatchObject({ score: 70, sources: { exam: null, homework: 70 } });
  });

  it('faqat davomat: mavzu LEARNING, lekin bahosi yo‘q (darsga kelish o‘zlashtirish emas)', async () => {
    const { token, group, topics, anvar, barno } = await setup();
    const marked = await request(app)
      .post(`/api/groups/${group.id}/attendance`)
      .set(bearer(token))
      .send({ date: '2026-09-21', topicId: topics.dom, records: [{ studentId: anvar.id, status: 'PRESENT' }, { studentId: barno.id, status: 'ABSENT' }] });
    expect(marked.status).toBe(200);
    const anvarDom = topicOf((await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(token))).body.data, topics.dom);
    expect(anvarDom).toMatchObject({ score: null, status: 'LEARNING', sources: { attendance: 100 } });
    const barnoDom = topicOf((await request(app).get(`/api/students/${barno.id}/mastery`).set(bearer(token))).body.data, topics.dom);
    expect(barnoDom).toMatchObject({ score: null, status: 'LEARNING', sources: { attendance: 0 } });
  });

  it('sozlamalar: chegara o‘zgarsa holatlar darhol qayta yoziladi; noto‘g‘ri chegara 422; o‘qituvchi o‘zgartira olmaydi', async () => {
    const { admin: academicAdmin, token, course, group, topics, anvar } = await setup();
    // Chegaralar — boshqa ogohlantirish chegaralari kabi faqat Owner / Super Admin
    const { token: admin } = await createUserWithToken(app, { role: 'OWNER' });
    const { examId, answerFor } = await examWithAnswers(token, course.id, group.id, topics);
    await request(app).post(`/api/exams/${examId}/attempts/${anvar.id}`).set(bearer(token)).send({ answers: answerFor([true, true, true, false]) });

    const defaults = await request(app).get('/api/mastery/settings').set(bearer(token));
    expect(defaults.body.data).toEqual({ thresholds: { developing: 40, good: 60, mastered: 80 }, weights: { exam: 50, homework: 30, attendance: 10, lessons: 10 } });
    const next = { thresholds: { developing: 30, good: 50, mastered: 90 }, weights: defaults.body.data.weights };
    expect((await request(app).put('/api/mastery/settings').set(bearer(token)).send(next)).status).toBe(403);
    expect((await request(app).put('/api/mastery/settings').set(bearer(academicAdmin)).send(next)).status).toBe(403);
    expect((await request(app).put('/api/mastery/settings').set(bearer(admin)).send({ ...next, thresholds: { developing: 60, good: 50, mastered: 90 } })).status).toBe(422);
    expect((await request(app).put('/api/mastery/settings').set(bearer(admin)).send({ ...next, weights: { exam: 0, homework: 0, attendance: 50, lessons: 50 } })).status).toBe(422);

    const saved = await request(app).put('/api/mastery/settings').set(bearer(admin)).send(next);
    expect(saved.status).toBe(200);
    const body = (await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(token))).body.data;
    // 100 < 90? yo'q → MASTERED; 50 ≥ 50 → PRACTICING
    expect(topicOf(body, topics.arrays).status).toBe('MASTERED');
    expect(topicOf(body, topics.functions)).toMatchObject({ status: 'PRACTICING', level: 'GOOD' });
    expect(await prisma.auditLog.count({ where: { action: 'mastery.settings_updated' } })).toBe(1);
  });

  it('guruh matritsasi: o‘z guruhi o‘qituvchisi ko‘radi, begona — 404; kabinet o‘z o‘zlashtirishini ko‘radi', async () => {
    const { admin, token, course, group, topics, anvar, barno } = await setup();
    const { examId, answerFor } = await examWithAnswers(token, course.id, group.id, topics);
    await request(app).post(`/api/exams/${examId}/attempts/${anvar.id}`).set(bearer(token)).send({ answers: answerFor([true, true, false, false]) });
    await request(app).post(`/api/exams/${examId}/attempts/${barno.id}`).set(bearer(token)).send({ answers: answerFor([true, false, true, true]) });

    const matrix = await request(app).get(`/api/groups/${group.id}/mastery`).set(bearer(token));
    expect(matrix.status).toBe(200);
    expect(matrix.body.data.topics.map((topic: { title: string; average: number | null; mastered: number }) => [topic.title, topic.average, topic.mastered])).toEqual([
      ['Massivlar', 75, 1],
      ['Funksiyalar', 50, 1],
      ['DOM', null, 0],
      ['Async', null, 0],
    ]);
    const anvarRow = matrix.body.data.students.find((row: { id: string }) => row.id === anvar.id);
    expect(anvarRow).toMatchObject({ fullName: 'Test Anvar', overall: 50 });
    expect(anvarRow.cells[topics.arrays]).toEqual({ score: 100, status: 'MASTERED' });

    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).get(`/api/groups/${group.id}/mastery`).set(bearer(stranger))).status).toBe(404);
    expect((await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(stranger))).status).toBe(404);

    const created = await request(app).post(`/api/students/${anvar.id}/portal-account`).set(bearer(admin)).send({});
    const studentToken = await loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);
    const own = await request(app).get('/api/portal/mastery').set(bearer(studentToken));
    expect(own.status).toBe(200);
    expect(own.body.data.overall).toMatchObject({ score: 50, mastered: 1 });
    expect(own.body.data.history).toEqual([]);
    expect((await request(app).get('/api/portal/mastery').query({ studentId: barno.id }).set(bearer(studentToken))).status).toBe(403);
  });

  it('tungi job: to‘liq qayta hisob (MISSED vazifa → 0) va oylik snapshot', async () => {
    const { token, course, group, topics, anvar, barno } = await setup();
    const { examId, answerFor } = await examWithAnswers(token, course.id, group.id, topics);
    await request(app).post(`/api/exams/${examId}/attempts/${anvar.id}`).set(bearer(token)).send({ answers: answerFor([true, true, true, true]) });
    const homework = await request(app)
      .post('/api/homework')
      .set(bearer(token))
      .send({ title: 'Massiv mashqi', groupId: group.id, deadline: new Date(Date.now() + 86_400_000).toISOString(), topicId: topics.arrays, status: 'PUBLISHED' });
    // Vazifa muddati o'tdi va topshirilmadi (job MISSED qiladi — hook yo'q, tungi hisob tuzatadi)
    await prisma.homeworkSubmission.updateMany({ where: { homeworkId: homework.body.data.id, studentId: anvar.id }, data: { status: 'MISSED' } });

    const result = await runNightlyProgress();
    expect(result.students).toBe(2);
    const body = (await request(app).get(`/api/students/${anvar.id}/mastery`).set(bearer(token))).body.data;
    // (100·50 + 0·30) / 80 = 62.5 → 63
    expect(topicOf(body, topics.arrays)).toMatchObject({ score: 63, status: 'PRACTICING', sources: { exam: 100, homework: 0 } });

    const { year, month } = currentBusinessMonth();
    const snapshots = await prisma.studentProgressSnapshot.findMany({ where: { year, month }, orderBy: { studentId: 'asc' } });
    expect(snapshots).toHaveLength(2);
    const anvarSnapshot = snapshots.find((row) => row.studentId === anvar.id)!;
    expect(anvarSnapshot).toMatchObject({ masteryScore: 82, topicsMastered: 1 });
    expect(anvarSnapshot.debtRemaining.toNumber()).toBe(400_000);
    expect(snapshots.find((row) => row.studentId === barno.id)).toMatchObject({ masteryScore: null, topicsMastered: 0 });
    // O'tgan oy ham bir marta yakunlanadi; qayta yurish takrorlamaydi
    const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    expect(await prisma.studentProgressSnapshot.count({ where: previous })).toBe(2);
    await runNightlyProgress();
    expect(await prisma.studentProgressSnapshot.count()).toBe(4);

    const history = await request(app).get(`/api/students/${anvar.id}/progress-history`).set(bearer(token));
    expect(history.body.data.map((row: { month: string }) => row.month)).toEqual([
      `${previous.year}-${String(previous.month).padStart(2, '0')}`,
      `${year}-${String(month).padStart(2, '0')}`,
    ]);
  });
});
