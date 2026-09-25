import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function createStudent(courseId: string, groupId: string, name = 'O‘quvchi') {
  return prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Test',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-06-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

async function createExam(token: string, groupId: string, passScore?: number) {
  const response = await request(app)
    .post('/api/exams')
    .set(bearer(token))
    .send({ title: 'Yakuniy', groupId, date: '2026-10-15', maxScore: 100, ...(passScore ? { passScore } : {}) });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

/** Savoli biriktirilgan imtihon — vaqt va urinish chegaralarini sinash uchun */
async function createExamWithQuestions(
  token: string,
  courseId: string,
  groupId: string,
  options: { durationMinutes?: number; maxAttempts?: number } = {},
) {
  const created = await request(app)
    .post('/api/exams')
    .set(bearer(token))
    .send({ title: 'Chegarali imtihon', groupId, date: '2026-10-20', maxScore: 100, ...options });
  expect(created.status).toBe(201);
  const examId = created.body.data.id as string;

  const question = await createQuestion(token, courseId, { text: '2 + 2 = ?' });
  await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [question.id] });
  const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));
  const correctOption = question.options.find((option: { isCorrect: boolean }) => option.isCorrect).id as string;

  return {
    id: examId,
    /** Tayyor javob — testlarda faqat chegaralar tekshiriladi, baholash emas */
    answers: [{ examQuestionId: questions.body.data[0].examQuestionId as string, optionIds: [correctOption] }],
  };
}

async function createQuestion(
  token: string,
  courseId: string,
  payload: { text: string; type?: string; topicId?: string; points?: number; options?: Array<{ text: string; isCorrect?: boolean }> },
) {
  const response = await request(app)
    .post('/api/questions')
    .set(bearer(token))
    .send({
      courseId,
      text: payload.text,
      type: payload.type ?? 'SINGLE_CHOICE',
      points: payload.points ?? 1,
      ...(payload.topicId ? { topicId: payload.topicId } : {}),
      options: payload.options ?? [
        { text: 'To‘g‘ri', isCorrect: true },
        { text: 'Noto‘g‘ri' },
      ],
    });
  expect(response.status).toBe(201);
  return response.body.data;
}

async function buildTopics(token: string, courseId: string) {
  const module = await request(app).post(`/api/courses/${courseId}/modules`).set(bearer(token)).send({ title: 'HTML' });
  const first = await request(app)
    .post(`/api/curriculum/modules/${module.body.data.id}/topics`)
    .set(bearer(token))
    .send({ title: 'Teglar' });
  const second = await request(app)
    .post(`/api/curriculum/modules/${module.body.data.id}/topics`)
    .set(bearer(token))
    .send({ title: 'Formalar' });
  return { tegler: first.body.data.id as string, formalar: second.body.data.id as string };
}

describe.skipIf(!hasTestDatabase)('Imtihon dvigateli: savollar bazasi va urinishlar', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('savol validatsiyasi: variant soni va to‘g‘ri javob tekshiriladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();

    const noCorrect = await request(app)
      .post('/api/questions')
      .set(bearer(token))
      .send({ courseId: course.id, text: 'Savol matni', options: [{ text: 'A' }, { text: 'B' }] });
    const twoCorrect = await request(app)
      .post('/api/questions')
      .set(bearer(token))
      .send({
        courseId: course.id,
        text: 'Savol matni',
        type: 'SINGLE_CHOICE',
        options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }],
      });
    const textWithOptions = await request(app)
      .post('/api/questions')
      .set(bearer(token))
      .send({ courseId: course.id, text: 'Savol matni', type: 'TEXT', options: [{ text: 'A' }] });

    expect(noCorrect.status).toBe(422);
    expect(twoCorrect.status).toBe(422);
    expect(textWithOptions.status).toBe(422);
  });

  it('variantli savol avtomatik baholanadi va natija ExamResult ga yoziladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const examId = await createExam(token, group.id);
    const first = await createQuestion(token, course.id, { text: '2+2 nechchi?', points: 10 });
    const second = await createQuestion(token, course.id, { text: 'HTML nima?', points: 10 });

    await request(app)
      .post(`/api/exams/${examId}/questions`)
      .set(bearer(token))
      .send({ questionIds: [first.id, second.id] });
    const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));

    // Birinchisiga to'g'ri, ikkinchisiga noto'g'ri javob
    const correctOption = first.options.find((option: { isCorrect: boolean }) => option.isCorrect).id;
    const wrongOption = second.options.find((option: { isCorrect: boolean }) => !option.isCorrect).id;
    const submitted = await request(app)
      .post(`/api/exams/${examId}/attempts/${student.id}`)
      .set(bearer(token))
      .send({
        answers: [
          { examQuestionId: questions.body.data[0].examQuestionId, optionIds: [correctOption] },
          { examQuestionId: questions.body.data[1].examQuestionId, optionIds: [wrongOption] },
        ],
      });

    expect(submitted.status).toBe(201);
    expect(submitted.body.data).toMatchObject({ score: 10, maxScore: 20, percentage: 50, status: 'GRADED' });
    // O'quvchiga ko'rinadigan savollarda to'g'ri javob yo'q
    expect(JSON.stringify(questions.body.data)).not.toContain('isCorrect');
    // Yakuniy natija mavjud jadvalga yozildi — hisobotlar buzilmaydi
    const result = await prisma.examResult.findFirstOrThrow({ where: { examId, studentId: student.id } });
    // Imtihon shkalasida: 10/20 → 50/100
    expect(result).toMatchObject({ score: 50, percentage: 50, grade: '2' });
  });

  it('bir nechta javobli savolda to‘plam aynan mos kelishi kerak', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const examId = await createExam(token, group.id);
    const question = await createQuestion(token, course.id, {
      text: 'Qaysilari HTML teglari?',
      type: 'MULTIPLE_CHOICE',
      points: 10,
      options: [
        { text: 'div', isCorrect: true },
        { text: 'span', isCorrect: true },
        { text: 'margin' },
      ],
    });
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [question.id] });
    const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));
    const correct = question.options.filter((option: { isCorrect: boolean }) => option.isCorrect).map((option: { id: string }) => option.id);

    const partial = await request(app)
      .post(`/api/exams/${examId}/attempts/${student.id}`)
      .set(bearer(token))
      .send({ answers: [{ examQuestionId: questions.body.data[0].examQuestionId, optionIds: [correct[0]] }] });

    // Yarim javob — ball berilmaydi
    expect(partial.body.data.score).toBe(0);
    expect(partial.body.data.answers[0].isCorrect).toBe(false);
  });

  it('matnli savol qo‘lda baholanadi: avval NEEDS_REVIEW, keyin GRADED', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const examId = await createExam(token, group.id);
    const question = await createQuestion(token, course.id, { text: 'HTML nima ekanini tushuntiring', type: 'TEXT', points: 20, options: [] });
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [question.id] });
    const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));

    const submitted = await request(app)
      .post(`/api/exams/${examId}/attempts/${student.id}`)
      .set(bearer(token))
      .send({ answers: [{ examQuestionId: questions.body.data[0].examQuestionId, text: 'Gipermatn belgilash tili' }] });
    const answerId = submitted.body.data.answers[0].id;
    const tooHigh = await request(app)
      .post(`/api/exams/attempts/${submitted.body.data.id}/grade`)
      .set(bearer(token))
      .send({ grades: [{ answerId, score: 30 }] });
    const graded = await request(app)
      .post(`/api/exams/attempts/${submitted.body.data.id}/grade`)
      .set(bearer(token))
      .send({ grades: [{ answerId, score: 15, feedback: 'Yaxshi' }] });

    expect(submitted.body.data).toMatchObject({ status: 'NEEDS_REVIEW', score: 0 });
    expect(submitted.body.data.answers[0].needsReview).toBe(true);
    // Ball savol balidan oshmaydi
    expect(tooHigh.status).toBe(422);
    expect(graded.body.data).toMatchObject({ status: 'GRADED', score: 15, maxScore: 20, percentage: 75 });
    expect(await prisma.examResult.count({ where: { examId } })).toBe(1);
  });

  it('mavzular kesimi kuchli va zaif tomonlarni ko‘rsatadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const topics = await buildTopics(token, course.id);
    const examId = await createExam(token, group.id);
    const teglar = await createQuestion(token, course.id, { text: 'Teg nima?', topicId: topics.tegler, points: 10 });
    const formalar = await createQuestion(token, course.id, { text: 'Forma nima?', topicId: topics.formalar, points: 10 });
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [teglar.id, formalar.id] });
    const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));

    const submitted = await request(app)
      .post(`/api/exams/${examId}/attempts/${student.id}`)
      .set(bearer(token))
      .send({
        answers: [
          {
            examQuestionId: questions.body.data[0].examQuestionId,
            optionIds: [teglar.options.find((option: { isCorrect: boolean }) => option.isCorrect).id],
          },
          {
            examQuestionId: questions.body.data[1].examQuestionId,
            optionIds: [formalar.options.find((option: { isCorrect: boolean }) => !option.isCorrect).id],
          },
        ],
      });

    expect(submitted.body.data.strongTopics).toContain('Teglar');
    expect(submitted.body.data.weakTopics).toContain('Formalar');
    const byTopic = Object.fromEntries(
      submitted.body.data.topics.map((topic: { topicTitle: string; percent: number }) => [topic.topicTitle, topic.percent]),
    );
    expect(byTopic).toMatchObject({ Teglar: 100, Formalar: 0 });
  });

  it('tasodifiy tanlash: savollar yetmasa aniq xabar beradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const examId = await createExam(token, group.id);
    await createQuestion(token, course.id, { text: 'Birinchi savol' });
    await createQuestion(token, course.id, { text: 'Ikkinchi savol' });

    const tooMany = await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ random: { count: 5 } });
    const ok = await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ random: { count: 2 } });

    expect(tooMany.status).toBe(422);
    expect(tooMany.body.message).toContain('yetarli emas');
    expect(ok.body.data).toEqual({ attached: 2 });
  });

  it('imtihon boshlangandan keyin savollar tarkibi o‘zgarmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const examId = await createExam(token, group.id);
    const question = await createQuestion(token, course.id, { text: 'Savol matni' });
    const extra = await createQuestion(token, course.id, { text: 'Qo‘shimcha savol' });
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [question.id] });
    const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));
    await request(app)
      .post(`/api/exams/${examId}/attempts/${student.id}`)
      .set(bearer(token))
      .send({
        answers: [
          {
            examQuestionId: questions.body.data[0].examQuestionId,
            optionIds: [question.options.find((option: { isCorrect: boolean }) => option.isCorrect).id],
          },
        ],
      });

    const afterStart = await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [extra.id] });

    expect(afterStart.status).toBe(422);
  });

  it('o‘tish bali hisobga olinadi va ruxsatlar tekshiriladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    // O'tish bali imtihon shkalasida (60/100); savollar jami 20 ball — nisbat solishtiriladi
    const examId = await createExam(token, group.id, 60);
    const question = await createQuestion(token, course.id, { text: 'Savol matni', points: 10 });
    const second = await createQuestion(token, course.id, { text: 'Ikkinchi savol matni', points: 10 });
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [question.id, second.id] });
    const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));
    const byText = (text: string) => questions.body.data.find((row: { text: string }) => row.text === text).examQuestionId as string;

    const submitted = await request(app)
      .post(`/api/exams/${examId}/attempts/${student.id}`)
      .set(bearer(token))
      .send({
        answers: [
          { examQuestionId: byText('Savol matni'), optionIds: [question.options.find((option: { isCorrect: boolean }) => option.isCorrect).id] },
          { examQuestionId: byText('Ikkinchi savol matni'), optionIds: [second.options.find((option: { isCorrect: boolean }) => !option.isCorrect).id] },
        ],
      });
    const byManager = await request(app).get('/api/questions').set(bearer(sales));

    // 10/20 = 50% < 60% o'tish bali
    expect(submitted.body.data).toMatchObject({ score: 10, maxScore: 20, percentage: 50, passed: false });
    expect(byManager.status).toBe(403);
  });
});

describe.skipIf(!hasTestDatabase)('Imtihon urinishlari: o‘qituvchi doirasi (TZ 3.0 §6, §63)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  it('o‘qituvchi A begona guruh (B) imtihoni va urinishlariga kira olmaydi, o‘zinikiga — kiradi', async () => {
    const { user: teacherA, token: tokenA } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: teacherB, token: tokenB } = await createUserWithToken(app, { role: 'TEACHER' });
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Scope kursi');
    const groupA = await createGroup({ courseId: course.id, teacherId: teacherA.id });
    const groupB = await createGroup({ courseId: course.id, teacherId: teacherB.id });
    const studentB = await createStudent(course.id, groupB.id, 'B-o‘quvchi');

    // B o'z guruhida imtihon tuzadi va urinishni boshlaydi
    const examB = await createExamWithQuestions(tokenB, course.id, groupB.id);
    const started = await request(app).post(`/api/exams/${examB.id}/attempts/${studentB.id}/start`).set(bearer(tokenB));
    expect(started.status).toBe(200);
    const attemptId = started.body.data.attemptId as string;

    // A uchun B'ning imtihoni "yo'q" — mavjudligi ham oshkor bo'lmaydi
    const questionB = await createQuestion(tokenA, course.id, { text: 'A savoli' });
    const attach = await request(app).post(`/api/exams/${examB.id}/questions`).set(bearer(tokenA)).send({ questionIds: [questionB.id] });
    const questions = await request(app).get(`/api/exams/${examB.id}/questions`).set(bearer(tokenA));
    const start = await request(app).post(`/api/exams/${examB.id}/attempts/${studentB.id}/start`).set(bearer(tokenA));
    const submit = await request(app).post(`/api/exams/${examB.id}/attempts/${studentB.id}`).set(bearer(tokenA)).send({ answers: examB.answers });
    const attempts = await request(app).get(`/api/exams/${examB.id}/attempts`).set(bearer(tokenA));
    const attempt = await request(app).get(`/api/exams/attempts/${attemptId}`).set(bearer(tokenA));
    const grade = await request(app).post(`/api/exams/attempts/${attemptId}/grade`).set(bearer(tokenA)).send({ grades: [{ answerId: attemptId, score: 1 }] });

    expect([attach.status, questions.status, start.status, submit.status, attempts.status, attempt.status, grade.status]).toEqual([
      404, 404, 404, 404, 404, 404, 404,
    ]);

    // B o'zinikini, admin — hammasini ko'radi
    const ownAttempts = await request(app).get(`/api/exams/${examB.id}/attempts`).set(bearer(tokenB));
    const ownAttempt = await request(app).get(`/api/exams/attempts/${attemptId}`).set(bearer(tokenB));
    const adminAttempts = await request(app).get(`/api/exams/${examB.id}/attempts`).set(bearer(admin));
    expect(ownAttempts.status).toBe(200);
    expect(ownAttempts.body.data).toHaveLength(1);
    expect(ownAttempt.status).toBe(200);
    expect(adminAttempts.status).toBe(200);

    // A o'z guruhida bemalol ishlaydi
    const examA = await createExamWithQuestions(tokenA, course.id, groupA.id);
    const ownQuestions = await request(app).get(`/api/exams/${examA.id}/questions`).set(bearer(tokenA));
    expect(ownQuestions.status).toBe(200);
    expect(ownQuestions.body.data).toHaveLength(1);
  });
});

describe.skipIf(!hasTestDatabase)('Imtihon: vaqt va urinishlar chegarasi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  it('urinishlar chegarasi oshsa yangi urinish ochilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const exam = await createExamWithQuestions(token, course.id, group.id, { maxAttempts: 2 });

    // Ikki marta topshiramiz
    for (let index = 0; index < 2; index += 1) {
      const response = await request(app)
        .post(`/api/exams/${exam.id}/attempts/${student.id}`)
        .set(bearer(token))
        .send({ answers: exam.answers });
      expect(response.status).toBe(201);
    }

    const third = await request(app).post(`/api/exams/${exam.id}/attempts/${student.id}`).set(bearer(token)).send({ answers: exam.answers });
    expect(third.status).toBe(422);
    expect(third.body.message).toContain('Urinishlar tugadi');
  });

  it('boshlangan imtihonda muddat qaytariladi va vaqt tugasa javob qabul qilinmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Backend');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const exam = await createExamWithQuestions(token, course.id, group.id, { durationMinutes: 30 });

    const started = await request(app).post(`/api/exams/${exam.id}/attempts/${student.id}/start`).set(bearer(token)).send({});
    expect(started.status).toBe(200);
    expect(started.body.data.deadline).toBeTruthy();
    expect(started.body.data.attemptNo).toBe(1);

    // Qayta boshlash yangi urinish ochmaydi — o'sha urinish davom etadi
    const again = await request(app).post(`/api/exams/${exam.id}/attempts/${student.id}/start`).set(bearer(token)).send({});
    expect(again.body.data.attemptId).toBe(started.body.data.attemptId);

    // Vaqtni orqaga suramiz: urinish 31 daqiqa oldin boshlangan bo'lsin
    await prisma.examAttempt.update({
      where: { id: started.body.data.attemptId },
      data: { startedAt: new Date(Date.now() - 31 * 60_000) },
    });

    const late = await request(app).post(`/api/exams/${exam.id}/attempts/${student.id}`).set(bearer(token)).send({ answers: exam.answers });
    expect(late.status).toBe(422);
    expect(late.body.message).toContain('vaqti tugadi');

    const expired = await prisma.examAttempt.findUniqueOrThrow({ where: { id: started.body.data.attemptId } });
    expect(expired.status).toBe('EXPIRED');
  });

  it('vaqt tugagan urinish urinishlar hisobiga kirmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Dizayn');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const exam = await createExamWithQuestions(token, course.id, group.id, { durationMinutes: 10, maxAttempts: 1 });

    const started = await request(app).post(`/api/exams/${exam.id}/attempts/${student.id}/start`).set(bearer(token)).send({});
    await prisma.examAttempt.update({
      where: { id: started.body.data.attemptId },
      data: { startedAt: new Date(Date.now() - 20 * 60_000) },
    });
    await request(app).post(`/api/exams/${exam.id}/attempts/${student.id}`).set(bearer(token)).send({ answers: exam.answers }).expect(422);

    // Vaqti tugagani hisobga olinmaydi — qayta boshlash mumkin
    const retry = await request(app).post(`/api/exams/${exam.id}/attempts/${student.id}/start`).set(bearer(token)).send({});
    expect(retry.status).toBe(200);
    expect(retry.body.data.attemptNo).toBe(2);
  });
});
