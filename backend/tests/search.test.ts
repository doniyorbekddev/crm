import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

let phoneCounter = 0;

async function enroll(options: { courseId: string; groupId?: string; firstName: string; phone?: string }) {
  phoneCounter += 1;
  return prisma.student.create({
    data: {
      firstName: options.firstName,
      lastName: 'Valiyev',
      phone: options.phone ?? `+99890${String(5_000_000 + phoneCounter)}`,
      courseId: options.courseId,
      groupId: options.groupId ?? null,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

function groupOf(body: { data: { groups: Array<{ key: string; hits: unknown[] }> } }, key: string) {
  return body.data.groups.find((group) => group.key === key);
}

describe.skipIf(!hasTestDatabase)('Search API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ism bo‘yicha bir nechta bo‘limdan topadi', async () => {
    const source = await createSource();
    const course = await createCourse('Frontend');
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    await createLead({ sourceId: source.id, firstName: 'Nodira', lastName: 'Karimova' });
    await enroll({ courseId: course.id, firstName: 'Nodira' });

    const response = await request(app).get('/api/search?q=Nodira').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(2);
    expect(groupOf(response.body, 'leads')?.hits).toHaveLength(1);
    expect(groupOf(response.body, 'students')?.hits).toHaveLength(1);
    expect(groupOf(response.body, 'leads')?.hits[0]).toMatchObject({ title: 'Nodira Karimova' });
    expect((groupOf(response.body, 'leads')?.hits[0] as { code: string }).code).toMatch(/^L-\d{6}$/);
    expect((groupOf(response.body, 'students')?.hits[0] as { url: string }).url).toMatch(/^\/students\/\w+$/);
  });

  it('L- va ST- raqamlari hamda telefon bo‘yicha topadi', async () => {
    const source = await createSource();
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const lead = await createLead({ sourceId: source.id, phone: '+998901112233' });
    const student = await enroll({ courseId: course.id, firstName: 'Ali', phone: '+998935556677' });

    const byLeadNumber = await request(app).get(`/api/search?q=L-${String(lead.number).padStart(6, '0')}`).set(bearer(token));
    const byStudentNumber = await request(app).get(`/api/search?q=st${student.number}`).set(bearer(token));
    const byPhone = await request(app).get('/api/search?q=935556677').set(bearer(token));

    expect(groupOf(byLeadNumber.body, 'leads')?.hits).toHaveLength(1);
    expect(groupOf(byStudentNumber.body, 'students')?.hits).toHaveLength(1);
    // "ST-000045" kodi telefon raqami sifatida qidirilmaydi — noto‘g‘ri natija bermasin
    expect(groupOf(byStudentNumber.body, 'users')).toBeUndefined();
    expect(groupOf(byPhone.body, 'students')?.hits).toHaveLength(1);
    expect(groupOf(byPhone.body, 'leads')).toBeUndefined();
  });

  it('kurs, guruh va xodimlarni topadi', async () => {
    const course = await createCourse('Grafik dizayn');
    await createGroup({ courseId: course.id, name: 'DZ-01' });
    const { token } = await createUserWithToken(app, { role: 'ADMIN', firstName: 'Jamshid' });

    const byCourse = await request(app).get('/api/search?q=dizayn').set(bearer(token));
    const byGroup = await request(app).get('/api/search?q=DZ-01').set(bearer(token));
    const byUser = await request(app).get('/api/search?q=Jamshid').set(bearer(token));

    expect(groupOf(byCourse.body, 'courses')?.hits).toHaveLength(1);
    expect(groupOf(byGroup.body, 'groups')?.hits[0]).toMatchObject({ title: 'DZ-01', url: '/groups' });
    expect(groupOf(byUser.body, 'users')?.hits).toHaveLength(1);
  });

  it('natijalar ruxsatga qarab filtrlanadi', async () => {
    const source = await createSource();
    const course = await createCourse('Backend');
    const { user: owner, token: ownerToken } = await createUserWithToken(app, { role: 'SALES_MANAGER', firstName: 'Dilshod' });
    const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const { token: accountantToken } = await createUserWithToken(app, { role: 'ACCOUNTANT' });

    await createLead({ sourceId: source.id, firstName: 'Aziz', assignedToId: owner.id });
    await createLead({ sourceId: source.id, firstName: 'Aziz', assignedToId: other.id });
    await enroll({ courseId: course.id, firstName: 'Aziz' });

    const managerView = await request(app).get('/api/search?q=Aziz').set(bearer(ownerToken));
    const accountantView = await request(app).get('/api/search?q=Aziz').set(bearer(accountantToken));

    // Manager faqat o‘ziga biriktirilgan leadni ko‘radi
    expect(groupOf(managerView.body, 'leads')?.hits).toHaveLength(1);
    expect(groupOf(managerView.body, 'users')).toBeUndefined();
    // Buxgalterda lead.view yo‘q, lekin student.view bor
    expect(groupOf(accountantView.body, 'leads')).toBeUndefined();
    expect(groupOf(accountantView.body, 'students')?.hits).toHaveLength(1);
  });

  it('o‘qituvchi faqat o‘z guruhidagi o‘quvchini topadi', async () => {
    const course = await createCourse();
    const { user: teacher, token } = await createUserWithToken(app, { role: 'TEACHER' });
    const ownGroup = await createGroup({ courseId: course.id, teacherId: teacher.id });
    const otherGroup = await createGroup({ courseId: course.id });
    await enroll({ courseId: course.id, groupId: ownGroup.id, firstName: 'Sardor' });
    await enroll({ courseId: course.id, groupId: otherGroup.id, firstName: 'Sardor' });

    const response = await request(app).get('/api/search?q=Sardor').set(bearer(token));

    expect(groupOf(response.body, 'students')?.hits).toHaveLength(1);
  });

  it('kvitansiya raqami bo‘yicha to‘lovni topadi', async () => {
    const course = await createCourse();
    const { token } = await createUserWithToken(app, { role: 'ACCOUNTANT' });
    const student = await enroll({ courseId: course.id, firstName: 'Bek' });
    const payment = await request(app)
      .post('/api/payments')
      .set(bearer(token))
      .send({ studentId: student.id, amount: 200_000, method: 'CASH' });

    const response = await request(app).get(`/api/search?q=${payment.body.data.code}`).set(bearer(token));

    expect(groupOf(response.body, 'payments')?.hits[0]).toMatchObject({ title: 'Bek Valiyev', code: payment.body.data.code });
  });

  it('qisqa so‘rov va bo‘sh natijani to‘g‘ri qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });

    const tooShort = await request(app).get('/api/search?q=a').set(bearer(token));
    const missing = await request(app).get('/api/search').set(bearer(token));
    const empty = await request(app).get('/api/search?q=topilmaydi').set(bearer(token));
    const anonymous = await request(app).get('/api/search?q=test');

    expect(tooShort.status).toBe(422);
    expect(missing.status).toBe(422);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({ total: 0, groups: [] });
    expect(anonymous.status).toBe(401);
  });
  it('o‘qituvchi, ota-ona va tranzaksiyalarni topadi, ruxsatga qarab', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const { user: teacherUser, token: teacherToken } = await createUserWithToken(app, { role: 'TEACHER' });
    await prisma.teacherProfile.create({ data: { userId: teacherUser.id, specialization: 'Robototexnika' } });
    await prisma.parent.create({ data: { firstName: 'Gulchehra', lastName: 'Onayeva', phone: '+998901112233' } });
    const transaction = await prisma.transaction.create({
      data: { type: 'EXPENSE', amount: 350_000, description: 'Ofis ijarasi sentabr', categoryName: 'Ijara' },
    });

    const teachers = await request(app).get('/api/search?q=Robototexnika').set(bearer(token));
    expect(groupOf(teachers.body, 'teachers')?.hits[0]).toMatchObject({ subtitle: expect.stringContaining('Robototexnika'), url: '/teachers' });

    const parents = await request(app).get('/api/search?q=Gulchehra').set(bearer(token));
    expect(groupOf(parents.body, 'parents')?.hits[0]).toMatchObject({ title: 'Gulchehra Onayeva', url: '/parents' });

    const byText = await request(app).get('/api/search?q=ijarasi').set(bearer(token));
    expect(groupOf(byText.body, 'transactions')?.hits[0]).toMatchObject({ code: `№${transaction.number}`, url: '/finance' });
    const byNumber = await request(app).get('/api/search').query({ q: `TX-${transaction.number}` }).set(bearer(token));
    expect(groupOf(byNumber.body, 'transactions')?.hits).toHaveLength(1);

    // O'qituvchida moliya ruxsati yo'q — tranzaksiya ko'rinmaydi
    const asTeacher = await request(app).get('/api/search?q=ijarasi').set(bearer(teacherToken));
    expect(groupOf(asTeacher.body, 'transactions')).toBeUndefined();
  });
});
