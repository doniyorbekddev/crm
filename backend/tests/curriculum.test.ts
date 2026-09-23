import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

const app = createApp();

async function buildCurriculum(token: string, courseId: string) {
  const html = await request(app).post(`/api/courses/${courseId}/modules`).set(bearer(token)).send({ title: 'HTML', sortOrder: 0 });
  const css = await request(app).post(`/api/courses/${courseId}/modules`).set(bearer(token)).send({ title: 'CSS', sortOrder: 1 });
  const topics: Record<string, string[]> = { html: [], css: [] };
  for (const title of ['Teglar', 'Formalar']) {
    const created = await request(app)
      .post(`/api/curriculum/modules/${html.body.data.id}/topics`)
      .set(bearer(token))
      .send({ title });
    topics.html!.push(created.body.data.id);
  }
  for (const title of ['Selektorlar', 'Flexbox']) {
    const created = await request(app)
      .post(`/api/curriculum/modules/${css.body.data.id}/topics`)
      .set(bearer(token))
      .send({ title });
    topics.css!.push(created.body.data.id);
  }
  return { htmlModuleId: html.body.data.id as string, cssModuleId: css.body.data.id as string, topics };
}

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

describe.skipIf(!hasTestDatabase)('Kurrikulum va o‘quvchi progressi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('modul va mavzu qo‘shish faqat course.manage bilan', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();

    const byAdmin = await request(app).post(`/api/courses/${course.id}/modules`).set(bearer(admin)).send({ title: 'HTML' });
    const byTeacher = await request(app).post(`/api/courses/${course.id}/modules`).set(bearer(teacher)).send({ title: 'CSS' });
    const view = await request(app).get(`/api/courses/${course.id}/curriculum`).set(bearer(teacher));

    expect(byAdmin.status).toBe(201);
    expect(byTeacher.status).toBe(403);
    // Ko'rish o'qituvchiga ochiq
    expect(view.status).toBe(200);
    expect(view.body.data.modules).toHaveLength(1);
  });

  it('kurrikulum modul va mavzular bilan tartibda qaytadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    await buildCurriculum(token, course.id);

    const response = await request(app).get(`/api/courses/${course.id}/curriculum`).set(bearer(token));

    expect(response.body.data).toMatchObject({ courseName: course.name, totalTopics: 4, totalLessons: 4 });
    expect(response.body.data.modules.map((module: { title: string }) => module.title)).toEqual(['HTML', 'CSS']);
    expect(response.body.data.modules[0].topics.map((topic: { title: string }) => topic.title)).toEqual(['Teglar', 'Formalar']);
  });

  it('guruh bo‘yicha mavzu belgilanadi va progress foizga aylanadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const first = await createStudent(course.id, group.id, 'Birinchi');
    const second = await createStudent(course.id, group.id, 'Ikkinchi');
    const { topics } = await buildCurriculum(token, course.id);

    const marked = await request(app)
      .post(`/api/curriculum/topics/${topics.html![0]}/mark`)
      .set(bearer(token))
      .send({ groupId: group.id, status: 'COMPLETED' });
    const progress = await request(app).get(`/api/students/${first.id}/curriculum`).set(bearer(token));

    expect(marked.body.data).toEqual({ updated: 2 });
    // 4 mavzudan 1 tasi = 25%
    expect(progress.body.data).toMatchObject({ percent: 25, completed: 1, total: 4 });
    expect(progress.body.data.modules[0]).toMatchObject({ title: 'HTML', percent: 50, completed: 1, total: 2 });
    expect(progress.body.data.modules[1]).toMatchObject({ title: 'CSS', percent: 0, completed: 0 });
    // Ikkinchi o'quvchiga ham belgilandi
    const secondProgress = await request(app).get(`/api/students/${second.id}/curriculum`).set(bearer(token));
    expect(secondProgress.body.data.completed).toBe(1);
  });

  it('belgilanmagan mavzu NOT_STARTED, takroriy belgilash holatni yangilaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const { topics } = await buildCurriculum(token, course.id);

    const before = await request(app).get(`/api/students/${student.id}/curriculum`).set(bearer(token));
    await request(app).post(`/api/curriculum/topics/${topics.html![0]}/mark`).set(bearer(token)).send({ groupId: group.id });
    await request(app)
      .post(`/api/curriculum/topics/${topics.html![0]}/mark`)
      .set(bearer(token))
      .send({ groupId: group.id, status: 'IN_PROGRESS' });
    const after = await request(app).get(`/api/students/${student.id}/curriculum`).set(bearer(token));

    expect(before.body.data.modules[0].topics[0].status).toBe('NOT_STARTED');
    // Qayta belgilash yangi yozuv yaratmaydi, holatni yangilaydi
    expect(await prisma.studentTopicProgress.count()).toBe(1);
    expect(after.body.data.modules[0].topics[0].status).toBe('IN_PROGRESS');
    expect(after.body.data.completed).toBe(0);
  });

  it('o‘qituvchi faqat o‘z guruhiga mavzu belgilay oladi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: teacher, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const ownGroup = await createGroup({ courseId: course.id, name: 'O‘z guruhi', teacherId: teacher.id });
    const otherGroup = await createGroup({ courseId: course.id, name: 'Begona guruh' });
    await createStudent(course.id, ownGroup.id, 'Meniki');
    await createStudent(course.id, otherGroup.id, 'Begona');
    const { topics } = await buildCurriculum(admin, course.id);

    const own = await request(app)
      .post(`/api/curriculum/topics/${topics.html![0]}/mark`)
      .set(bearer(teacherToken))
      .send({ groupId: ownGroup.id });
    const foreign = await request(app)
      .post(`/api/curriculum/topics/${topics.html![0]}/mark`)
      .set(bearer(teacherToken))
      .send({ groupId: otherGroup.id });

    expect(own.status).toBe(200);
    expect(foreign.status).toBe(403);
  });

  it('faol bo‘lmagan mavzu progress hisobiga kirmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    const { topics } = await buildCurriculum(token, course.id);

    await request(app).put(`/api/curriculum/topics/${topics.css![1]}`).set(bearer(token)).send({ isActive: false });
    await request(app).post(`/api/curriculum/topics/${topics.html![0]}/mark`).set(bearer(token)).send({ groupId: group.id });
    const progress = await request(app).get(`/api/students/${student.id}/curriculum`).set(bearer(token));

    // 4 mavzudan bittasi o'chirildi → maxraj 3
    expect(progress.body.data).toMatchObject({ total: 3, completed: 1, percent: 33 });
  });

  it('kurrikulumsiz kursda progress `null` qaytadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);

    const progress = await request(app).get(`/api/students/${student.id}/curriculum`).set(bearer(token));

    expect(progress.status).toBe(200);
    expect(progress.body.data).toBeNull();
  });
});
