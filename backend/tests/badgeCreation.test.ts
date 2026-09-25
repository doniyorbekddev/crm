import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { referralService } from '../src/services/referral.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createLead, createSource } from './helpers/fixtures.js';

/** TZ 3.1 GAP-02 — admin yangi nishon yaratadi */
const app = createApp();
let phone = 0;

async function student(courseId: string, groupId: string | null, firstName: string) {
  phone += 1;
  return prisma.student.create({
    data: {
      firstName,
      lastName: 'Test',
      phone: `+99891${String(2_000_000 + phone)}`,
      courseId,
      groupId,
      contractPrice: 1_000_000,
      startDate: new Date('2026-09-01'),
      debt: { create: { totalAmount: 1_000_000, remainingAmount: 1_000_000 } },
    },
  });
}

const base = { name: 'Do‘stlar ko‘prigi', description: '1 ta do‘sti o‘quvchi bo‘ldi', icon: '🤝', category: 'SOCIAL', rule: 'REFERRAL', threshold: 1, xpReward: 30 };

describe.skipIf(!hasTestDatabase)('Nishon yaratish (GAP-02)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await prisma.level.create({ data: { number: 1, name: 'Yangi boshlovchi', minXp: 0 } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('faqat gamification.manage: o‘qituvchi va buxgalter — 403; yaratilgan nishon ro‘yxatda, kalit avtomatik, audit', async () => {
    for (const role of ['TEACHER', 'ACCOUNTANT', 'SALES_MANAGER'] as const) {
      const { token } = await createUserWithToken(app, { role });
      expect((await request(app).post('/api/gamification/badges').set(bearer(token)).send(base)).status, role).toBe(403);
    }
    const { user, token } = await createUserWithToken(app, { role: 'OWNER' });
    const created = await request(app).post('/api/gamification/badges').set(bearer(token)).send(base);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ key: 'CUSTOM_DOSTLAR_KOPRIGI', name: 'Do‘stlar ko‘prigi', category: 'SOCIAL', rule: 'REFERRAL', threshold: 1, xpReward: 30, isActive: true, awarded: 0 });

    const list = await request(app).get('/api/gamification/badges').set(bearer(token));
    expect(list.body.data.map((badge: { key: string }) => badge.key)).toContain('CUSTOM_DOSTLAR_KOPRIGI');
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'gamification.badge_created' } });
    expect(audit).toMatchObject({ userId: user.id, entityType: 'badge', entityId: created.body.data.id });
    expect(audit.after).toMatchObject({ key: 'CUSTOM_DOSTLAR_KOPRIGI', rule: 'REFERRAL', threshold: 1 });
  });

  it('dublikat: bir xil nom (katta-kichik harf farqsiz) va bir xil talab — 400; kalit to‘qnashuvi suffiks bilan', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    expect((await request(app).post('/api/gamification/badges').set(bearer(token)).send(base)).status).toBe(201);

    const sameName = await request(app).post('/api/gamification/badges').set(bearer(token)).send({ ...base, name: '  DO‘STLAR KO‘PRIGI ', threshold: 3 });
    expect(sameName.status).toBe(400);
    expect(sameName.body.errors[0]).toMatchObject({ field: 'name' });

    const sameRequirement = await request(app).post('/api/gamification/badges').set(bearer(token)).send({ ...base, name: 'Boshqa nom' });
    expect(sameRequirement.status).toBe(400);
    expect(sameRequirement.body.errors[0]).toMatchObject({ field: 'threshold' });

    // Tutuq belgisi boshqacha — nom boshqa, lekin kalit bir xil bo'lardi → _2
    const apostrophe = await request(app).post('/api/gamification/badges').set(bearer(token)).send({ ...base, name: "Do'stlar ko'prigi", threshold: 5 });
    expect(apostrophe.status).toBe(201);
    expect(apostrophe.body.data.key).toBe('CUSTOM_DOSTLAR_KOPRIGI_2');

    // Qo'lda beriladigan nishonlar talab bo'yicha takrorlanishi mumkin
    const manualA = await request(app).post('/api/gamification/badges').set(bearer(token)).send({ ...base, name: 'Oy faoli', rule: 'MANUAL', threshold: undefined, category: 'SPECIAL' });
    const manualB = await request(app).post('/api/gamification/badges').set(bearer(token)).send({ ...base, name: 'Hafta faoli', rule: 'MANUAL', threshold: undefined, category: 'SPECIAL' });
    expect([manualA.status, manualB.status]).toEqual([201, 201]);
    expect(await prisma.badge.count()).toBe(4);
  });

  it('validatsiya: talab turiga mos chegara, toifa, noma’lum maydon — 422', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const invalid = [
      { ...base, threshold: undefined },
      { ...base, rule: 'XP_TOTAL', threshold: 0 },
      { ...base, rule: 'ATTENDANCE_RATE', threshold: 150 },
      { ...base, rule: 'EXAM_SCORE', threshold: 101 },
      { ...base, rule: 'MANUAL', threshold: 5 },
      { ...base, rule: 'COURSE_COMPLETED', threshold: 1 },
      { ...base, rule: 'SUPERPOWER' },
      { ...base, category: 'FUN' },
      { ...base, name: 'A' },
      { ...base, icon: '' },
      { ...base, xpReward: -5 },
      { ...base, key: 'HACK' },
    ];
    for (const body of invalid) {
      expect((await request(app).post('/api/gamification/badges').set(bearer(token)).send(body)).status, JSON.stringify(body)).toBe(422);
    }
    expect(await prisma.badge.count()).toBe(0);
  });

  it('REFERRAL: taklif qilingan do‘st o‘quvchi bo‘lganda nishon va XP darhol beriladi (bir marta)', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const created = await request(app).post('/api/gamification/badges').set(bearer(token)).send(base);
    const course = await createCourse();
    const group = await createGroup({ courseId: course.id });
    const referrer = await student(course.id, group.id, 'Taklifchi');
    const friend = await student(course.id, group.id, 'Dost');
    const source = await createSource();

    for (const friendId of [friend.id]) {
      const lead = await createLead({ sourceId: source.id });
      await prisma.referral.create({ data: { referrerStudentId: referrer.id, leadId: lead.id, status: 'PENDING' } });
      await prisma.$transaction((tx) => referralService.onLeadConverted(tx, lead.id, friendId));
    }
    const owned = await prisma.studentBadge.findMany({ where: { studentId: referrer.id } });
    expect(owned.map((row) => row.badgeId)).toEqual([created.body.data.id]);
    const xp = await prisma.xpTransaction.aggregate({ where: { studentId: referrer.id, source: 'BADGE' }, _sum: { points: true } });
    expect(xp._sum.points).toBe(30);
    // Do'stning o'zi nishon olmaydi
    expect(await prisma.studentBadge.count({ where: { studentId: friend.id } })).toBe(0);
  });

  it('COURSE_COMPLETED: holat "tugatdi" bo‘lganda darhol beriladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const created = await request(app)
      .post('/api/gamification/badges')
      .set(bearer(token))
      .send({ ...base, name: 'Bitiruvchi', rule: 'COURSE_COMPLETED', threshold: undefined, category: 'ACADEMIC', xpReward: 100 });
    expect(created.status).toBe(201);
    const course = await createCourse();
    const learner = await student(course.id, null, 'Bitiruvchi');

    const changed = await request(app).patch(`/api/students/${learner.id}/status`).set(bearer(token)).send({ status: 'COMPLETED', reason: 'Kursni tugatdi' });
    expect(changed.status).toBe(200);
    expect(await prisma.studentBadge.count({ where: { studentId: learner.id, badgeId: created.body.data.id } })).toBe(1);
  });

  it('tahrirlash: toifa o‘zgaradi; chegara qoida oralig‘idan tashqari — 422; band nom — 400', async () => {
    const { token } = await createUserWithToken(app, { role: 'OWNER' });
    const first = await request(app).post('/api/gamification/badges').set(bearer(token)).send(base);
    await request(app).post('/api/gamification/badges').set(bearer(token)).send({ ...base, name: 'Ikkinchi', rule: 'EXAM_SCORE', threshold: 90, category: 'ACADEMIC' });
    const id = first.body.data.id as string;

    const moved = await request(app).put(`/api/gamification/badges/${id}`).set(bearer(token)).send({ category: 'ACTIVITY' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.find((badge: { id: string }) => badge.id === id).category).toBe('ACTIVITY');
    expect((await request(app).put(`/api/gamification/badges/${id}`).set(bearer(token)).send({ threshold: 500 })).status).toBe(422);
    expect((await request(app).put(`/api/gamification/badges/${id}`).set(bearer(token)).send({ name: 'ikkinchi' })).status).toBe(400);
    // O'z nomini qayta saqlash — mumkin
    expect((await request(app).put(`/api/gamification/badges/${id}`).set(bearer(token)).send({ name: 'Do‘stlar ko‘prigi' })).status).toBe(200);
  });
});
