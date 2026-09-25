import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken, loginWithTemporaryPassword } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * PHASE 12 — qidiruv (TZ 3.0 §45): o'qituvchi — o'quvchi, vazifa, imtihon (o'z guruhlari);
 * kabinet — o'z vazifalari, imtihonlari, darslari, sertifikatlari; ota-ona — farzandlari ham.
 */
const app = createApp();
let phone = 0;

async function createStudent(courseId: string, groupId: string, name: string) {
  phone += 1;
  return prisma.student.create({
    data: { firstName: name, lastName: 'Qidiruv', phone: `+99888${String(1_000_000 + phone).slice(-7)}`, courseId, groupId, contractPrice: 1_000_000, startDate: new Date('2026-06-01') },
  });
}

type Group = { key: string; hits: Array<{ title: string; url: string }> };
const titlesOf = (groups: Group[], key: string) => groups.find((group) => group.key === key)?.hits.map((hit) => hit.title) ?? [];

describe.skipIf(!hasTestDatabase)('Qidiruv (PHASE 12)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('o‘qituvchi o‘z guruhi vazifa va imtihonlarini topadi, begona guruhnikini — yo‘q', async () => {
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const { user: other, token: otherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const mine = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const foreign = await createGroup({ courseId: course.id, teacherId: other.id });
    await request(app).post('/api/homework').set(bearer(token)).send({ title: 'Flexbox mashqi', groupId: mine.id, deadline: new Date(Date.now() + 86_400_000).toISOString() });
    await request(app).post('/api/homework').set(bearer(otherToken)).send({ title: 'Flexbox begona', groupId: foreign.id, deadline: new Date(Date.now() + 86_400_000).toISOString() });
    await request(app).post('/api/exams').set(bearer(token)).send({ title: 'Flexbox testi', groupId: mine.id, date: '2026-10-01' });

    const result = (await request(app).get('/api/search').query({ q: 'flexbox' }).set(bearer(token))).body.data;
    expect(titlesOf(result.groups, 'homework')).toEqual(['Flexbox mashqi']);
    expect(titlesOf(result.groups, 'exams')).toEqual(['Flexbox testi']);
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const all = (await request(app).get('/api/search').query({ q: 'flexbox' }).set(bearer(admin))).body.data;
    expect(titlesOf(all.groups, 'homework').sort()).toEqual(['Flexbox begona', 'Flexbox mashqi']);
  });

  it('kabinet: o‘z vazifasi, imtihoni, darsi va sertifikati; boshqa o‘quvchinikini ko‘rmaydi; ota-ona farzandini topadi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Dizayn');
    const group = await createGroup({ courseId: course.id });
    const otherGroup = await createGroup({ courseId: course.id });
    const anvar = await createStudent(course.id, group.id, 'Anvar');
    const begona = await createStudent(course.id, otherGroup.id, 'Begona');
    await request(app).post('/api/homework').set(bearer(admin)).send({ title: 'Figma maketi', groupId: group.id, deadline: new Date(Date.now() + 86_400_000).toISOString() });
    await request(app).post('/api/homework').set(bearer(admin)).send({ title: 'Figma begona', groupId: otherGroup.id, deadline: new Date(Date.now() + 86_400_000).toISOString() });
    await request(app).post('/api/exams').set(bearer(admin)).send({ title: 'Figma imtihoni', groupId: group.id, date: '2026-10-01' });
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: 'UI' } });
    const topic = await prisma.courseTopic.create({ data: { moduleId: module.id, title: 'Figma' } });
    await prisma.lesson.create({ data: { topicId: topic.id, title: 'Figma asoslari', status: 'PUBLISHED', publishedAt: new Date() } });
    await prisma.lesson.create({ data: { topicId: topic.id, title: 'Figma qoralama', status: 'DRAFT' } });

    const account = await request(app).post(`/api/students/${anvar.id}/portal-account`).set(bearer(admin)).send({});
    const studentToken = await loginWithTemporaryPassword(app, account.body.data.login, account.body.data.temporaryPassword);
    const found = (await request(app).get('/api/portal/search').query({ q: 'figma' }).set(bearer(studentToken))).body.data;
    expect(titlesOf(found.groups, 'homework')).toEqual(['Figma maketi']);
    expect(titlesOf(found.groups, 'exams')).toEqual(['Figma imtihoni']);
    expect(titlesOf(found.groups, 'lessons')).toEqual(['Figma asoslari']);
    expect(found.groups.find((row: Group) => row.key === 'homework').hits[0].url).toMatch(/^\/portal\/homework\//);
    expect((await request(app).get('/api/portal/search').query({ q: 'figma', studentId: begona.id }).set(bearer(studentToken))).status).toBe(403);

    const parent = await prisma.parent.create({ data: { firstName: 'Ota', lastName: 'Qidiruv', phone: '+998887770011', students: { create: [{ studentId: anvar.id, isPrimary: true }] } } });
    const parentAccount = await request(app).post(`/api/parents/${parent.id}/portal-account`).set(bearer(admin)).send({});
    const parentToken = await loginWithTemporaryPassword(app, parentAccount.body.data.login, parentAccount.body.data.temporaryPassword);
    const children = (await request(app).get('/api/portal/search').query({ q: 'anvar' }).set(bearer(parentToken))).body.data;
    expect(titlesOf(children.groups, 'children')).toEqual(['Anvar Qidiruv']);
  });
});
