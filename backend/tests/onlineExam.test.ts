import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { backfillExamResultScale } from '../prisma/examResultScaleBackfill.js';
import { examTakingService } from '../src/services/examTaking.service.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 6 — o'quvchi imtihonni kabinetdan o'zi topshiradi (TZ 3.0 §21–25):
 * variant (blueprint), snapshot, vaqt oynasi, urinish chegarasi, avtomatik/qo'lda baholash,
 * muddat tugaganda avtomatik topshirish va egalik.
 */
const app = createApp();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 3)]);
const HOUR = 3_600_000;
let phone = 0;

async function createStudent(courseId: string, groupId: string | null, name: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+99893${String(1_000_000 + phone).slice(-7)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function setup() {
  const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
  const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
  const course = await createCourse();
  const group = await createGroup({ courseId: course.id, teacherId: teacher.id });
  const student = await createStudent(course.id, group.id, 'Anvar');
  return { admin, token, course, group, student };
}

async function portalToken(admin: string, studentId: string) {
  const created = await request(app).post(`/api/students/${studentId}/portal-account`).set(bearer(admin)).send({});
  expect(created.status).toBe(201);
  return loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);
}

async function createQuestion(token: string, courseId: string, payload: Record<string, unknown>) {
  const response = await request(app)
    .post('/api/questions')
    .set(bearer(token))
    .send({ courseId, type: 'SINGLE_CHOICE', points: 1, ...payload });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; options: Array<{ id: string; text: string; isCorrect: boolean }> };
}

async function createOnlineExam(token: string, groupId: string, extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/exams')
    .set(bearer(token))
    .send({ title: 'Onlayn test', groupId, date: '2026-10-01', maxScore: 100, isOnline: true, type: 'WEEKLY_TEST', ...extra });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function attach(token: string, examId: string, questionIds: string[]) {
  const response = await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds });
  expect(response.status).toBe(200);
}

async function buildTopics(token: string, courseId: string) {
  const module = await request(app).post(`/api/courses/${courseId}/modules`).set(bearer(token)).send({ title: 'JS' });
  const first = await request(app).post(`/api/curriculum/modules/${module.body.data.id}/topics`).set(bearer(token)).send({ title: 'Massivlar' });
  const second = await request(app).post(`/api/curriculum/modules/${module.body.data.id}/topics`).set(bearer(token)).send({ title: 'Funksiyalar' });
  return { arrays: first.body.data.id as string, functions: second.body.data.id as string };
}

type ViewQuestion = { id: string; text: string; type: string; options: Array<{ id: string; text: string }> };

describe.skipIf(!hasTestDatabase)('Onlayn imtihon (PHASE 6)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘tish bali imtihon shkalasida: 4 ballik test 100 ballik imtihonda (passScore 60) — nisbat bo‘yicha', async () => {
    const { admin, token, course, group, student } = await setup();
    const questions = [];
    for (const index of [1, 2, 3, 4]) {
      questions.push(await createQuestion(token, course.id, { text: `Savol raqami ${index}`, options: [{ text: 'Ha', isCorrect: true }, { text: 'Yo‘q' }] }));
    }
    const examId = await createOnlineExam(token, group.id, { passScore: 60 });
    await attach(token, examId, questions.map((question) => question.id));
    const studentToken = await portalToken(admin, student.id);

    const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
    // 4 tadan 2 tasi to'g'ri → 50% < 60% → o'tmadi; natija jadvalida 50/100
    for (const [index, question] of (view.questions as ViewQuestion[]).entries()) {
      const option = question.options.find((row) => row.text === (index < 2 ? 'Ha' : 'Yo‘q'))!;
      await request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${question.id}`).set(bearer(studentToken)).send({ optionIds: [option.id] });
    }
    const failed = await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(studentToken));
    expect(failed.body.data.summary).toMatchObject({ score: 2, maxScore: 4, percentage: 50, passed: false });
    expect(await prisma.examResult.findFirst({ where: { examId, studentId: student.id }, select: { score: true, percentage: true } })).toEqual({ score: 50, percentage: 50 });

    // Hammasi to'g'ri → 4/4 (100%) o'tdi — xom ball (4) o'tish bali (60) bilan solishtirilmaydi
    const second = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
    for (const question of second.questions as ViewQuestion[]) {
      await request(app).put(`/api/portal/attempts/${second.attemptId}/answers/${question.id}`).set(bearer(studentToken)).send({ optionIds: [question.options.find((row) => row.text === 'Ha')!.id] });
    }
    const passed = await request(app).post(`/api/portal/attempts/${second.attemptId}/submit`).set(bearer(studentToken));
    expect(passed.body.data.summary).toMatchObject({ score: 4, maxScore: 4, percentage: 100, passed: true });
    expect(await prisma.examResult.findFirst({ where: { examId, studentId: student.id }, select: { score: true, percentage: true } })).toEqual({ score: 100, percentage: 100 });

    // Eski (tuzatishdan oldingi) yozuv: xom ball — backfill imtihon shkalasiga o'tkazadi, takror ishga tushirish xavfsiz
    await prisma.examResult.updateMany({ where: { examId, studentId: student.id }, data: { score: 4 } });
    expect(await backfillExamResultScale(prisma, false)).toEqual({ checked: 1, changed: 1 });
    expect((await prisma.examResult.findFirstOrThrow({ where: { examId, studentId: student.id } })).score).toBe(4);
    expect(await backfillExamResultScale(prisma, true)).toEqual({ checked: 1, changed: 1 });
    expect((await prisma.examResult.findFirstOrThrow({ where: { examId, studentId: student.id } })).score).toBe(100);
    expect(await backfillExamResultScale(prisma, true)).toEqual({ checked: 1, changed: 0 });
  });

  it('to‘liq oqim: boshlash → kalitsiz savollar → avtosaqlash → topshirish → natija va tushuntirish', async () => {
    const { admin, token, course, group, student } = await setup();
    const single = await createQuestion(token, course.id, {
      text: 'JavaScript’da massiv uzunligi?',
      explanation: 'length xossasi elementlar sonini beradi',
      options: [{ text: 'length', isCorrect: true }, { text: 'size' }, { text: 'count' }],
    });
    const trueFalse = await createQuestion(token, course.id, {
      text: 'const o‘zgaruvchini qayta tayinlab bo‘lmaydi',
      type: 'TRUE_FALSE',
      options: [{ text: 'To‘g‘ri', isCorrect: true }, { text: 'Noto‘g‘ri' }],
    });
    const short = await createQuestion(token, course.id, { text: 'Massivga oxiridan element qo‘shuvchi metod?', type: 'SHORT_TEXT', acceptedAnswers: ['push', 'push()'], points: 2 });
    const examId = await createOnlineExam(token, group.id, { shuffleOptions: true });
    await attach(token, examId, [single.id, trueFalse.id, short.id]);
    const studentToken = await portalToken(admin, student.id);

    const available = await request(app).get('/api/portal/exams/available').set(bearer(studentToken));
    expect(available.status).toBe(200);
    expect(available.body.data).toEqual([expect.objectContaining({ examId, canStart: true, attemptsUsed: 0, questionCount: 3, type: 'WEEKLY_TEST' })]);

    const started = await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken));
    expect(started.status).toBe(200);
    const view = started.body.data;
    expect(view.status).toBe('IN_PROGRESS');
    expect(view.questions).toHaveLength(3);
    // Javob kaliti, tushuntirish va to'g'ri variant belgisi o'quvchiga yuborilmaydi
    const raw = JSON.stringify(view);
    expect(raw).not.toContain('isCorrect');
    expect(raw).not.toContain('length xossasi');
    expect(raw).not.toContain('push()');
    // To'g'ri/noto'g'ri variant tartibi aralashtirilmaydi
    const tf = view.questions.find((question: ViewQuestion) => question.type === 'TRUE_FALSE');
    expect(tf.options.map((option: { text: string }) => option.text)).toEqual(['To‘g‘ri', 'Noto‘g‘ri']);

    // Qayta "boshlash" — o'sha ochiq urinish davom etadi
    const resumed = await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken));
    expect(resumed.body.data.attemptId).toBe(view.attemptId);

    const byType = (type: string) => view.questions.find((question: ViewQuestion) => question.type === type) as ViewQuestion;
    const correctSingle = single.options.find((option) => option.isCorrect)!.id;
    const put = (questionId: string, body: object) => request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${questionId}`).set(bearer(studentToken)).send(body);
    expect((await put(byType('SINGLE_CHOICE').id, { optionIds: [correctSingle] })).status).toBe(200);
    expect((await put(tf.id, { optionIds: [trueFalse.options.find((option) => option.isCorrect)!.id] })).status).toBe(200);
    expect((await put(byType('SHORT_TEXT').id, { text: '  PUSH ' })).status).toBe(200);
    // Avtosaqlangan javob sahifa qayta ochilganda qaytadi
    const reopened = await request(app).get(`/api/portal/attempts/${view.attemptId}`).set(bearer(studentToken));
    expect(reopened.body.data.questions.find((question: ViewQuestion) => question.type === 'SHORT_TEXT').answer.text).toBe('  PUSH ');

    const submitted = await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(studentToken));
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ status: 'GRADED', summary: { score: 4, maxScore: 4, percentage: 100, passed: true } });
    const graded = submitted.body.data.questions.find((question: ViewQuestion) => question.type === 'SINGLE_CHOICE');
    expect(graded.result).toMatchObject({ isCorrect: true, correctOptionIds: [correctSingle], explanation: 'length xossasi elementlar sonini beradi' });

    // Natija mavjud hisobotlar jadvaliga **imtihon shkalasida** tushadi (4/4 → 100/100)
    const result = await prisma.examResult.findUnique({ where: { examId_studentId: { examId, studentId: student.id } } });
    expect(result).toMatchObject({ score: 100, percentage: 100, grade: '5' });
    expect((await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(studentToken))).status).toBe(422);
    const audit = await prisma.auditLog.findMany({ where: { entityId: examId, action: { in: ['exam.attempt_started', 'exam.attempt_submitted'] } } });
    expect(audit).toHaveLength(2);
  });

  it('snapshot: boshlangandan keyin savol va kalit o‘zgarsa ham urinish eski holat bo‘yicha baholanadi', async () => {
    const { admin, token, course, group, student } = await setup();
    const question = await createQuestion(token, course.id, { text: 'Eng katta son qaysi?', options: [{ text: '10', isCorrect: true }, { text: '5' }] });
    const examId = await createOnlineExam(token, group.id);
    await attach(token, examId, [question.id]);
    const studentToken = await portalToken(admin, student.id);
    const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
    const oldCorrect = question.options.find((option) => option.isCorrect)!.id;

    // O'qituvchi savolni tahrirlaydi — endi boshqa variant to'g'ri
    const edited = await request(app)
      .put(`/api/questions/${question.id}`)
      .set(bearer(token))
      .send({ text: 'Eng kichik son qaysi?', type: 'SINGLE_CHOICE', points: 5, options: [{ text: '10' }, { text: '5', isCorrect: true }] });
    expect(edited.status).toBe(200);

    const reopened = (await request(app).get(`/api/portal/attempts/${view.attemptId}`).set(bearer(studentToken))).body.data;
    expect(reopened.questions[0]).toMatchObject({ text: 'Eng katta son qaysi?', points: 1 });
    expect(reopened.questions[0].options.map((option: { id: string }) => option.id)).toContain(oldCorrect);
    await request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${reopened.questions[0].id}`).set(bearer(studentToken)).send({ optionIds: [oldCorrect] });
    const submitted = (await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(studentToken))).body.data;
    expect(submitted.summary).toMatchObject({ score: 1, maxScore: 1, percentage: 100 });

    // Xodim ham boshlangandagi savol matnini ko'radi
    const staff = await request(app).get(`/api/exams/attempts/${view.attemptId}`).set(bearer(token));
    expect(staff.body.data.answers[0]).toMatchObject({ questionText: 'Eng katta son qaysi?', points: 1, isCorrect: true });
  });

  it('qo‘lda baholanadigan turlar: uzun javob va fayl → NEEDS_REVIEW → o‘qituvchi faylni ko‘radi va baholaydi', async () => {
    const { admin, token, course, group, student } = await setup();
    const essay = await createQuestion(token, course.id, { text: 'Closure nima? Misol bilan tushuntiring', type: 'LONG_TEXT', points: 5 });
    const upload = await createQuestion(token, course.id, { text: 'Sxemani chizib rasmini yuklang', type: 'FILE_UPLOAD', points: 5 });
    const code = await createQuestion(token, course.id, { text: 'Massivni teskari aylantiruvchi funksiya yozing', type: 'CODE', points: 5 });
    const examId = await createOnlineExam(token, group.id);
    await attach(token, examId, [essay.id, upload.id, code.id]);
    const studentToken = await portalToken(admin, student.id);
    const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
    const byType = (type: string) => view.questions.find((question: ViewQuestion) => question.type === type) as ViewQuestion;

    await request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${byType('LONG_TEXT').id}`).set(bearer(studentToken)).send({ text: 'Ichki funksiya tashqi o‘zgaruvchini eslab qoladi' });
    // Fayl faqat FILE_UPLOAD savoliga va faqat ruxsat etilgan tur
    expect((await request(app).post(`/api/portal/attempts/${view.attemptId}/answers/${byType('LONG_TEXT').id}/file`).set(bearer(studentToken)).set('Content-Type', 'application/octet-stream').send(PNG)).status).toBe(422);
    expect((await request(app).post(`/api/portal/attempts/${view.attemptId}/answers/${byType('FILE_UPLOAD').id}/file`).set(bearer(studentToken)).set('Content-Type', 'application/octet-stream').send(Buffer.from('oddiy matn'))).status).toBe(422);
    const uploaded = await request(app).post(`/api/portal/attempts/${view.attemptId}/answers/${byType('FILE_UPLOAD').id}/file`).set(bearer(studentToken)).set('Content-Type', 'application/octet-stream').send(PNG);
    expect(uploaded.status).toBe(200);
    // CODE savoli javobsiz qoldi → 0 ball, tekshiruv talab qilinmaydi

    const submitted = (await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(studentToken))).body.data;
    expect(submitted.status).toBe('NEEDS_REVIEW');
    expect(submitted.questions.find((question: ViewQuestion) => question.type === 'FILE_UPLOAD').answer.hasFile).toBe(true);
    // Baholanmaguncha natija jadvaliga yozilmaydi
    expect(await prisma.examResult.count({ where: { examId } })).toBe(0);

    const staff = (await request(app).get(`/api/exams/attempts/${view.attemptId}`).set(bearer(token))).body.data;
    const review = staff.answers.filter((answer: { needsReview: boolean }) => answer.needsReview);
    expect(review.map((answer: { questionType: string }) => answer.questionType).sort()).toEqual(['FILE_UPLOAD', 'LONG_TEXT']);
    const codeAnswer = staff.answers.find((answer: { questionType: string }) => answer.questionType === 'CODE');
    expect(codeAnswer).toMatchObject({ score: 0, isCorrect: false, needsReview: false });

    const fileAnswer = staff.answers.find((answer: { questionType: string }) => answer.questionType === 'FILE_UPLOAD');
    const file = await request(app).get(`/api/exams/attempts/${view.attemptId}/answers/${fileAnswer.id}/file`).set(bearer(token));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    // Boshqa o'qituvchi begona urinish faylini ko'rmaydi
    const { token: stranger } = await createUserWithToken(app, { role: 'TEACHER' });
    expect((await request(app).get(`/api/exams/attempts/${view.attemptId}/answers/${fileAnswer.id}/file`).set(bearer(stranger))).status).toBe(404);

    const grade = await request(app)
      .post(`/api/exams/attempts/${view.attemptId}/grade`)
      .set(bearer(token))
      .send({ grades: review.map((answer: { id: string }) => ({ answerId: answer.id, score: 4, feedback: 'Yaxshi' })) });
    expect(grade.status).toBe(200);
    expect(grade.body.data).toMatchObject({ status: 'GRADED', score: 8, maxScore: 15 });

    const finalView = (await request(app).get(`/api/portal/attempts/${view.attemptId}`).set(bearer(studentToken))).body.data;
    expect(finalView.summary).toMatchObject({ score: 8, percentage: 53, passed: false });
    expect(finalView.questions.find((question: ViewQuestion) => question.type === 'LONG_TEXT').result.feedback).toBe('Yaxshi');
  });

  it('blueprint: har o‘quvchiga mavzu ulushiga mos alohida variant; oldindan ko‘rish va yetmasa 422', async () => {
    const { admin, token, course, group } = await setup();
    const topics = await buildTopics(admin, course.id);
    for (let index = 0; index < 5; index += 1) {
      await createQuestion(token, course.id, { text: `Massiv savoli ${index + 1}`, topicId: topics.arrays, options: [{ text: 'A', isCorrect: true }, { text: 'B' }] });
      await createQuestion(token, course.id, { text: `Funksiya savoli ${index + 1}`, topicId: topics.functions, options: [{ text: 'A', isCorrect: true }, { text: 'B' }] });
    }
    const blueprint = { total: 4, topics: [{ topicId: topics.arrays, percent: 50 }, { topicId: topics.functions, percent: 50 }] };

    const preview = await request(app).post('/api/exams/blueprint/preview').set(bearer(token)).send({ groupId: group.id, blueprint });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ poolSize: 10, feasible: true });
    expect(preview.body.data.cells.map((cell: { topicTitle: string; target: number; available: number }) => [cell.topicTitle, cell.target, cell.available])).toEqual([
      ['Massivlar', 2, 5],
      ['Funksiyalar', 2, 5],
    ]);
    const tooMany = await request(app).post('/api/exams/blueprint/preview').set(bearer(token)).send({ groupId: group.id, blueprint: { ...blueprint, total: 20 } });
    expect(tooMany.body.data).toMatchObject({ feasible: false });
    expect(tooMany.body.data.message).toContain('10 ta bor, 20 ta kerak');

    const examId = await createOnlineExam(token, group.id, { blueprint });
    const variants: string[] = [];
    for (const name of ['Bek', 'Dilnoza', 'Jasur', 'Laylo', 'Nodir']) {
      const student = await createStudent(course.id, group.id, name);
      const studentToken = await portalToken(admin, student.id);
      const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
      const texts = view.questions.map((question: ViewQuestion) => question.text) as string[];
      expect(texts).toHaveLength(4);
      expect(texts.filter((text) => text.startsWith('Massiv'))).toHaveLength(2);
      expect(texts.filter((text) => text.startsWith('Funksiya'))).toHaveLength(2);
      variants.push([...texts].sort().join('|'));
    }
    expect(new Set(variants).size).toBeGreaterThan(1);

    // Bank kamaysa — boshlab bo'lmaydi, aniq sabab bilan
    const shortExam = await createOnlineExam(token, group.id, { blueprint: { total: 30 } });
    const student = await createStudent(course.id, group.id, 'Oxirgi');
    const studentToken = await portalToken(admin, student.id);
    const failed = await request(app).post(`/api/portal/exams/${shortExam}/start`).set(bearer(studentToken));
    expect(failed.status).toBe(422);
    expect(failed.body.message).toContain('Savollar yetarli emas');
  });

  it('oyna, urinish chegarasi va onlayn bo‘lmagan imtihon', async () => {
    const { admin, token, course, group, student } = await setup();
    const question = await createQuestion(token, course.id, { text: 'Oddiy savol matni', options: [{ text: 'A', isCorrect: true }, { text: 'B' }] });
    const studentToken = await portalToken(admin, student.id);

    const later = await createOnlineExam(token, group.id, { startAt: new Date(Date.now() + 2 * HOUR).toISOString(), endAt: new Date(Date.now() + 4 * HOUR).toISOString() });
    await attach(token, later, [question.id]);
    const closed = await createOnlineExam(token, group.id, { startAt: new Date(Date.now() - 4 * HOUR).toISOString(), endAt: new Date(Date.now() - 2 * HOUR).toISOString() });
    await attach(token, closed, [question.id]);
    const once = await createOnlineExam(token, group.id, { maxAttempts: 1 });
    await attach(token, once, [question.id]);
    const offline = (await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Qog‘ozda', groupId: group.id, date: '2026-10-01', maxScore: 100 })).body.data.id as string;
    const empty = await createOnlineExam(token, group.id);

    // Oyna teskari bo'lsa — saqlanmaydi
    const badWindow = await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Teskari', groupId: group.id, date: '2026-10-01', isOnline: true, startAt: new Date(Date.now() + HOUR).toISOString(), endAt: new Date(Date.now() - HOUR).toISOString() });
    expect(badWindow.status).toBe(422);

    const list = (await request(app).get('/api/portal/exams/available').set(bearer(studentToken))).body.data as Array<{ examId: string; canStart: boolean; reason: string | null }>;
    const reasonOf = (id: string) => list.find((row) => row.examId === id);
    expect(reasonOf(later)).toMatchObject({ canStart: false, reason: 'Imtihon hali boshlanmagan' });
    expect(reasonOf(closed)).toMatchObject({ canStart: false, reason: 'Imtihon vaqti tugagan' });
    expect(reasonOf(empty)).toMatchObject({ canStart: false, reason: 'Imtihonga savollar biriktirilmagan' });
    expect(reasonOf(offline)).toBeUndefined();

    expect((await request(app).post(`/api/portal/exams/${later}/start`).set(bearer(studentToken))).status).toBe(422);
    expect((await request(app).post(`/api/portal/exams/${closed}/start`).set(bearer(studentToken))).status).toBe(422);
    expect((await request(app).post(`/api/portal/exams/${offline}/start`).set(bearer(studentToken))).status).toBe(404);

    const first = (await request(app).post(`/api/portal/exams/${once}/start`).set(bearer(studentToken))).body.data;
    await request(app).post(`/api/portal/attempts/${first.attemptId}/submit`).set(bearer(studentToken));
    const again = await request(app).post(`/api/portal/exams/${once}/start`).set(bearer(studentToken));
    expect(again.status).toBe(422);
    expect(again.body.message).toContain('Urinishlar tugadi');
    const after = (await request(app).get('/api/portal/exams/available').set(bearer(studentToken))).body.data as Array<{ examId: string; reason: string; lastResult: unknown }>;
    expect(after.find((row) => row.examId === once)).toMatchObject({ reason: 'Urinishlar tugagan', lastResult: { percentage: 0, status: 'GRADED' } });
  });

  it('vaqt tugasa saqlangan javoblar bilan avtomatik topshiriladi (ochilganda ham, fon vazifasida ham)', async () => {
    const { admin, token, course, group, student } = await setup();
    const question = await createQuestion(token, course.id, { text: 'Vaqtli savol matni', options: [{ text: 'A', isCorrect: true }, { text: 'B' }] });
    const examId = await createOnlineExam(token, group.id, { durationMinutes: 10 });
    await attach(token, examId, [question.id]);
    const studentToken = await portalToken(admin, student.id);
    const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
    expect(new Date(view.deadline).getTime() - new Date(view.startedAt).getTime()).toBe(10 * 60_000);
    await request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${view.questions[0].id}`).set(bearer(studentToken)).send({ optionIds: [question.options[0]!.id] });

    // Fon vazifasi: muddat hali tugamagan — tegmaydi
    expect(await examTakingService.finalizeExpired()).toBe(0);
    await prisma.examAttempt.update({ where: { id: view.attemptId }, data: { startedAt: new Date(Date.now() - 11 * 60_000) } });
    const late = await request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${view.questions[0].id}`).set(bearer(studentToken)).send({ optionIds: [question.options[1]!.id] });
    expect(late.status).toBe(422);
    const attempt = await prisma.examAttempt.findUniqueOrThrow({ where: { id: view.attemptId } });
    // Kech yuborilgan javob hisobga olinmadi — muddatdagi (to'g'ri) javob bilan baholandi
    expect(attempt).toMatchObject({ status: 'GRADED', score: 1, percentage: 100 });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'exam.attempt_submitted', entityId: examId } });
    expect(audit?.metadata).toMatchObject({ reason: 'timeout' });

    // Tashlab ketilgan urinish — fon vazifasi yopadi
    const other = await createStudent(course.id, group.id, 'Tashlagan');
    const otherToken = await portalToken(admin, other.id);
    const abandoned = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(otherToken))).body.data;
    await prisma.examAttempt.update({ where: { id: abandoned.attemptId }, data: { startedAt: new Date(Date.now() - 20 * 60_000) } });
    expect(await examTakingService.finalizeExpired()).toBe(1);
    expect(await prisma.examAttempt.findUniqueOrThrow({ where: { id: abandoned.attemptId } })).toMatchObject({ status: 'GRADED', score: 0 });
  });

  it('egalik va javob validatsiyasi: begona o‘quvchi, ota-ona, noto‘g‘ri variant', async () => {
    const { admin, token, course, group, student } = await setup();
    const question = await createQuestion(token, course.id, { text: 'Bitta javobli savol', options: [{ text: 'A', isCorrect: true }, { text: 'B' }, { text: 'C' }] });
    const other = await createQuestion(token, course.id, { text: 'Boshqa savol matni', options: [{ text: 'X', isCorrect: true }, { text: 'Y' }] });
    const examId = await createOnlineExam(token, group.id);
    await attach(token, examId, [question.id]);
    const studentToken = await portalToken(admin, student.id);
    const view = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
    const put = (tokenValue: string, body: object) => request(app).put(`/api/portal/attempts/${view.attemptId}/answers/${view.questions[0].id}`).set(bearer(tokenValue)).send(body);

    expect((await put(studentToken, { optionIds: [other.options[0]!.id] })).status).toBe(422);
    expect((await put(studentToken, { optionIds: [question.options[0]!.id, question.options[1]!.id] })).status).toBe(422);

    // Boshqa guruh o'quvchisi — imtihonni ham, urinishni ham ko'rmaydi
    const otherGroup = await createGroup({ courseId: course.id });
    const stranger = await createStudent(course.id, otherGroup.id, 'Begona');
    const strangerToken = await portalToken(admin, stranger.id);
    expect((await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(strangerToken))).status).toBe(404);
    expect((await request(app).get(`/api/portal/attempts/${view.attemptId}`).set(bearer(strangerToken))).status).toBe(404);
    expect((await put(strangerToken, { optionIds: [question.options[0]!.id] })).status).toBe(404);
    expect((await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(strangerToken))).status).toBe(404);

    // Ota-ona farzandi o'rniga topshira olmaydi, tugallanmagan urinishni ko'rmaydi
    const parent = await prisma.parent.create({ data: { firstName: 'Ota', lastName: 'Ona', phone: '+998901112233', students: { create: [{ studentId: student.id, isPrimary: true }] } } });
    const created = await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
    const parentToken = await loginWithTemporaryPassword(app, created.body.data.login, created.body.data.temporaryPassword);
    expect((await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(parentToken))).status).toBe(403);
    expect((await put(parentToken, { optionIds: [question.options[0]!.id] })).status).toBe(403);
    expect((await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(parentToken))).status).toBe(403);
    expect((await request(app).get(`/api/portal/attempts/${view.attemptId}`).set(bearer(parentToken))).status).toBe(403);
    expect((await request(app).get('/api/portal/exams/available').set(bearer(parentToken))).status).toBe(200);

    await request(app).post(`/api/portal/attempts/${view.attemptId}/submit`).set(bearer(studentToken));
    const parentView = await request(app).get(`/api/portal/attempts/${view.attemptId}`).set(bearer(parentToken));
    expect(parentView.status).toBe(200);
    expect(parentView.body.data.status).toBe('GRADED');

    // Xodim kabinet imtihonini tugallanmagan holda baholay olmaydi
    const pending = (await request(app).post(`/api/portal/exams/${examId}/start`).set(bearer(studentToken))).body.data;
    const staff = await request(app).get(`/api/exams/attempts/${pending.attemptId}`).set(bearer(token));
    expect(staff.body.data.status).toBe('IN_PROGRESS');
    expect((await request(app).post(`/api/exams/attempts/${pending.attemptId}/grade`).set(bearer(token)).send({ grades: [] })).status).toBe(422);
  });
});
