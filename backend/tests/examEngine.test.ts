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
    expect(result).toMatchObject({ score: 10, percentage: 50, grade: '2' });
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
    const examId = await createExam(token, group.id, 15);
    const question = await createQuestion(token, course.id, { text: 'Savol matni', points: 10 });
    await request(app).post(`/api/exams/${examId}/questions`).set(bearer(token)).send({ questionIds: [question.id] });
    const questions = await request(app).get(`/api/exams/${examId}/questions`).set(bearer(token));

    const submitted = await request(app)
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
    const byManager = await request(app).get('/api/questions').set(bearer(sales));

    // 10 ball < 15 o'tish bali
    expect(submitted.body.data).toMatchObject({ score: 10, passed: false });
    expect(byManager.status).toBe(403);
  });
});
