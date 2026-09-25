import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/** TZ 3.1 GAP-05 — Assessment 2.0 yakuniy tekshiruvi (variant, snapshot, tartib, egalik) */
const app = createApp();
let phone = 0;

async function createStudent(courseId: string, groupId: string, name: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99895${String(3_000_000 + phone)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function portalToken(admin: string, studentId: string) {
  const created = await request(app).post(`/api/students/${studentId}/portal-account`).set(bearer(admin)).send({});
  expect(created.status).toBe(201);
  return loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);
}

async function question(token: string, courseId: string, text: string, optionCount = 2) {
  const response = await request(app)
    .post('/api/questions')
    .set(bearer(token))
    .send({ courseId, type: 'SINGLE_CHOICE', points: 1, text, options: Array.from({ length: optionCount }, (_, index) => ({ text: `${text} — ${index + 1}`, isCorrect: index === 0 })) });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; options: Array<{ id: string; text: string; isCorrect: boolean }> };
}

async function onlineExam(token: string, groupId: string, extra: Record<string, unknown> = {}) {
  const response = await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Yakuniy', groupId, date: '2026-10-01', maxScore: 100, isOnline: true, ...extra });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

type View = { attemptId: string; questions: Array<{ id: string; text: string; options: Array<{ id: string; text: string }> }> };

describe.skipIf(!hasTestDatabase)('Assessment 2.0 — yakuniy tekshiruv (GAP-05)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bir guruhdagi B o‘quvchi A urinishini ko‘ra olmaydi, javob bera olmaydi, fayl yuklay olmaydi, topshira olmaydi — 404', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const alice = await createStudent(course.id, group.id, 'Alisa');
    const bob = await createStudent(course.id, group.id, 'Bobur');
    const bank = await question(token, course.id, 'Birinchi savol');
    const examId = await onlineExam(token, group.id);
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [bank.id] }).expect(200);

    const aliceToken = await portalToken(admin, alice.id);
    const bobToken = await portalToken(admin, bob.id);
    const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(aliceToken))).body.data as View;
    const questionId = view.questions[0]!.id;

    const attacks = [
      request(app).get(`/api/portal/attempts/${view.attemptId}`).set(bearer(bobToken)),
      request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${questionId}`).set(bearer(bobToken)).send({ optionIds: [view.questions[0]!.options[0]!.id] }),
      request(app).post(`/api/portal/attempts/${view.attemptId}/answers/${questionId}/file`).set(bearer(bobToken)).set('Content-Type', 'application/octet-stream').send(Buffer.from('%PDF-1.4\n')),
      request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(bobToken)),
    ];
    for (const response of await Promise.all(attacks)) expect(response.status).toBe(404);

    // A ning urinishi o'zgarmagan: javob yo'q, holati ochiq
    expect(await prisma.examAnswer.count({ where: { attemptId: view.attemptId } })).toBe(0);
    expect((await prisma.examAttempt.findUniqueOrThrow({ where: { id: view.attemptId } })).status).toBe('IN_PROGRESS');
    // B o'zinikini alohida boshlaydi
    const bobView = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(bobToken))).body.data as View;
    expect(bobView.attemptId).not.toBe(view.attemptId);
  });

  it('savol va variant tartibi har o‘quvchiga alohida aralashtiriladi (shuffleQuestions, shuffleOptions); to‘plam bir xil', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const bank = [];
    for (let index = 1; index <= 8; index += 1) bank.push(await question(token, course.id, `Savol ${index}`, 5));
    const examId = await onlineExam(token, group.id, { shuffleQuestions: true, shuffleOptions: true });
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: bank.map((row) => row.id) }).expect(200);

    const views: View[] = [];
    for (const name of ['A', 'B', 'C', 'D']) {
      const student = await createStudent(course.id, group.id, `Oquvchi${name}`);
      views.push((await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(await portalToken(admin, student.id)))).body.data as View);
    }
    const bankOrder = bank.map((_, index) => `Savol ${index + 1}`);
    const orders = views.map((view) => view.questions.map((row) => row.text));
    // Har o'quvchida aynan shu 8 savol
    for (const order of orders) expect([...order].sort()).toEqual([...bankOrder].sort());
    // 4 o'quvchining hammasi bank tartibida bo'lish ehtimoli (1/8!)^4 — amalda nol
    expect(orders.some((order) => order.join('|') !== bankOrder.join('|'))).toBe(true);
    expect(new Set(orders.map((order) => order.join('|'))).size).toBeGreaterThan(1);
    // Variantlar tartibi ham aralashgan (5 variantli 8 savol × 4 o'quvchi)
    const optionOrders = views.flatMap((view) => view.questions.map((row) => row.options.map((option) => option.text).join('|')));
    const sorted = views.flatMap((view) => view.questions.map((row) => row.options.map((option) => option.text).sort().join('|')));
    expect(optionOrders.some((order, index) => order !== sorted[index])).toBe(true);
  });

  it('xodim kiritgan natija snapshot bilan muzlatiladi: savol keyin tahrirlansa ball va matn o‘zgarmaydi', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await createStudent(course.id, group.id, 'Qogoz');
    const bank = await question(token, course.id, 'Asl savol matni');
    const examId = (await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Qog‘ozda', groupId: group.id, date: '2026-10-01', maxScore: 100 })).body.data.id as string;
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [bank.id] }).expect(200);
    const examQuestionId = (await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token))).body.data[0].examQuestionId as string;
    const correct = bank.options.find((option) => option.isCorrect)!.id;

    const submitted = await request(app).post(`/api/exams/${examId}/attempts/${student.id}`).set(bearer(token)).send({ answers: [{ examQuestionId, optionIds: [correct] }] });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data).toMatchObject({ score: 1, maxScore: 1, percentage: 100 });
    expect(await prisma.attemptQuestion.count({ where: { attemptId: submitted.body.data.id } })).toBe(1);

    // Bank tahrirlanadi: matn va to'g'ri javob boshqa
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const edited = await request(app)
      .put(`/api/questions/${bank.id}`)
      .set(bearer(admin))
      .send({ type: 'SINGLE_CHOICE', points: 1, text: 'Tahrirlangan matn', options: [{ text: 'Yangi A' }, { text: 'Yangi B', isCorrect: true }] });
    expect(edited.status).toBe(200);

    const reread = await request(app).get(`/api/exams/attempts/${submitted.body.data.id}`).set(bearer(token));
    expect(reread.body.data).toMatchObject({ score: 1, percentage: 100 });
    expect(reread.body.data.answers[0]).toMatchObject({ questionText: 'Asl savol matni', isCorrect: true, points: 1 });
  });

  it('kabinetda ochilgan urinishni xodim yopsa — o‘sha variant va kalit bilan baholanadi; variantda yo‘q savol — 422', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const student = await createStudent(course.id, group.id, 'Aralash');
    const first = await question(token, course.id, 'Birinchi');
    const examId = await onlineExam(token, group.id);
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [first.id] }).expect(200);
    const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(await portalToken(admin, student.id)))).body.data as View;
    expect(view.questions).toHaveLength(1);

    // Boshlangandan keyin imtihonga yangi savol qo'shildi va birinchisining kaliti o'zgardi
    const late = await question(token, course.id, 'Kechikkan savol');
    await prisma.examQuestion.create({ data: { examId, questionId: late.id, points: 1, sortOrder: 5 } });
    const questions = (await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token))).body.data as Array<{ examQuestionId: string; text: string }>;
    const firstExamQuestion = questions.find((row) => row.text === 'Birinchi')!.examQuestionId;
    const lateExamQuestion = questions.find((row) => row.text === 'Kechikkan savol')!.examQuestionId;
    await request(app)
      .put(`/api/questions/${first.id}`)
      .set(bearer(admin))
      .send({ type: 'SINGLE_CHOICE', points: 1, text: 'Birinchi', options: [{ text: 'X' }, { text: 'Y', isCorrect: true }] })
      .expect(200);

    const outside = await request(app).post(`/api/exams/${examId}/attempts/${student.id}`).set(bearer(token)).send({ answers: [{ examQuestionId: lateExamQuestion, optionIds: [late.options[0]!.id] }] });
    expect(outside.status).toBe(422);

    // Boshlash paytidagi to'g'ri javob — asl variant id si
    const originalCorrect = first.options.find((option) => option.isCorrect)!.id;
    const closed = await request(app).post(`/api/exams/${examId}/attempts/${student.id}`).set(bearer(token)).send({ answers: [{ examQuestionId: firstExamQuestion, optionIds: [originalCorrect] }] });
    expect(closed.status).toBe(201);
    expect(closed.body.data).toMatchObject({ id: view.attemptId, score: 1, maxScore: 1, percentage: 100, status: 'GRADED' });
  });
});
