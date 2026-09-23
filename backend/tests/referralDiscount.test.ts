import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup, createSource } from './helpers/fixtures.js';

const app = createApp();

/** Baza tozalangandan keyin chegirma qoidalari ham o'chadi — har testda kerakli qoida yaratiladi */
async function createRule(overrides: Partial<{ key: string; name: string; type: string; valueType: string; value: number; stackable: boolean }> = {}) {
  return prisma.discountRule.create({
    data: {
      key: overrides.key ?? 'family',
      name: overrides.name ?? 'Oila chegirmasi',
      type: (overrides.type ?? 'FAMILY') as 'FAMILY',
      valueType: (overrides.valueType ?? 'PERCENT') as 'PERCENT',
      value: overrides.value ?? 10,
      stackable: overrides.stackable ?? true,
    },
  });
}

async function createStudent(courseId: string, groupId: string | null, name = 'Aziz', price = 1_000_000) {
  const student = await prisma.student.create({
    data: {
      firstName: name,
      lastName: 'Karimov',
      phone: `+9989${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
      courseId,
      groupId,
      contractPrice: price,
      startDate: new Date('2026-03-01'),
      debt: { create: { totalAmount: price, remainingAmount: price } },
    },
  });
  // Kod raqamdan hosil bo'ladi — raqam esa yozuvdan keyin ma'lum bo'ladi
  return prisma.student.update({
    where: { id: student.id },
    data: { referralCode: `R${String(student.number).padStart(5, '0')}` },
  });
}

describe.skipIf(!hasTestDatabase)('Chegirma dvigateli va referal tizimi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('qoida bo‘yicha chegirma shartnoma narxini va qarzdorlikni kamaytiradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Frontend');
    const group = await createGroup({ courseId: course.id });
    const student = await createStudent(course.id, group.id);
    await createRule({ value: 10 });

    const response = await request(app).post(`/api/discounts/students/${student.id}`).set(bearer(token)).send({ ruleKey: 'family' });

    expect(response.status).toBe(200);
    expect(response.body.data.basePrice).toBe(1_000_000);
    expect(response.body.data.discountTotal).toBe(100_000);
    expect(response.body.data.contractPrice).toBe(900_000);

    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt.totalAmount.toNumber()).toBe(900_000);
    expect(debt.remainingAmount.toNumber()).toBe(900_000);

    // Chegirma qiymatlari nusxa sifatida saqlanadi
    const saved = await prisma.studentDiscount.findFirstOrThrow({ where: { studentId: student.id } });
    expect(saved.value.toNumber()).toBe(10);
    expect(saved.amount.toNumber()).toBe(100_000);
  });

  it('umumiy chegirma sozlamadagi chegaradan oshmaydi', async () => {
    const { token, user } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Backend');
    const student = await createStudent(course.id, null);
    await prisma.setting.create({
      data: { key: 'discount.settings', value: { maxPercent: 15, allowStacking: true }, updatedById: user.id },
    });
    await createRule({ key: 'big', name: 'Katta chegirma', value: 20 });

    const response = await request(app).post(`/api/discounts/students/${student.id}`).set(bearer(token)).send({ ruleKey: 'big' });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain('15%');
    // Narx o'zgarmagan
    const after = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(after.contractPrice.toNumber()).toBe(1_000_000);
  });

  it('birga qo‘llanmaydigan qoida mavjud chegirma ustiga berilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Dizayn');
    const student = await createStudent(course.id, null);
    await createRule({ key: 'family', value: 10 });
    await createRule({ key: 'prepay_6', name: '6 oylik to‘lov', type: 'PREPAY_6', value: 10, stackable: false });

    await request(app).post(`/api/discounts/students/${student.id}`).set(bearer(token)).send({ ruleKey: 'family' }).expect(200);
    const second = await request(app).post(`/api/discounts/students/${student.id}`).set(bearer(token)).send({ ruleKey: 'prepay_6' });

    expect(second.status).toBe(422);
    expect(second.body.message).toContain('birga qo‘llanmaydi');
  });

  it('bekor qilingan chegirma summani shartnomaga qaytaradi, yozuv esa qoladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Matematika');
    const student = await createStudent(course.id, null);
    await createRule({ value: 10 });

    await request(app).post(`/api/discounts/students/${student.id}`).set(bearer(token)).send({ ruleKey: 'family' }).expect(200);
    const discount = await prisma.studentDiscount.findFirstOrThrow({ where: { studentId: student.id } });

    const response = await request(app)
      .post(`/api/discounts/${discount.id}/revoke`)
      .set(bearer(token))
      .send({ reason: 'Xato berilgan' });

    expect(response.status).toBe(200);
    expect(response.body.data.contractPrice).toBe(1_000_000);
    expect(response.body.data.discountTotal).toBe(0);
    // Yozuv o'chirilmaydi — tarix saqlanadi
    const stored = await prisma.studentDiscount.findUniqueOrThrow({ where: { id: discount.id } });
    expect(stored.revokedAt).not.toBeNull();
    expect(stored.revokeReason).toBe('Xato berilgan');
    const debt = await prisma.debt.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(debt.totalAmount.toNumber()).toBe(1_000_000);
  });

  it('promo kod ishlatilish chegarasiga yetganda qabul qilinmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Ingliz tili');
    const first = await createStudent(course.id, null, 'Ali');
    const second = await createStudent(course.id, null, 'Vali');
    await createRule({ key: 'promo', name: 'Kuzgi aksiya', type: 'PROMO_CODE', value: 10 });
    await request(app)
      .post('/api/discounts/promo-codes')
      .set(bearer(token))
      .send({ code: 'kuz2026', ruleKey: 'promo', usageLimit: 1 })
      .expect(201);

    // Kod katta harfda saqlanadi va kichik harf bilan ham ishlaydi
    await request(app).post(`/api/discounts/students/${first.id}`).set(bearer(token)).send({ promoCode: 'kuz2026' }).expect(200);
    const blocked = await request(app).post(`/api/discounts/students/${second.id}`).set(bearer(token)).send({ promoCode: 'KUZ2026' });

    expect(blocked.status).toBe(422);
    expect(blocked.body.message).toContain('chegarasiga');
  });

  it('qo‘lda chegirma sababsiz berilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Robototexnika');
    const student = await createStudent(course.id, null);

    const noReason = await request(app)
      .post(`/api/discounts/students/${student.id}`)
      .set(bearer(token))
      .send({ valueType: 'AMOUNT', value: 50_000 });
    expect(noReason.status).toBe(422);

    const withReason = await request(app)
      .post(`/api/discounts/students/${student.id}`)
      .set(bearer(token))
      .send({ valueType: 'AMOUNT', value: 50_000, note: 'Direktor ruxsati bilan' });
    expect(withReason.status).toBe(200);
    expect(withReason.body.data.contractPrice).toBe(950_000);
  });

  it('chegirma berish huquqi yo‘q xodim rad etiladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const course = await createCourse('Chizmachilik');
    const student = await createStudent(course.id, null);
    await createRule({ value: 10 });

    await request(app).post(`/api/discounts/students/${student.id}`).set(bearer(token)).send({ ruleKey: 'family' }).expect(403);
    // Ko'rish huquqi bor
    await request(app).get(`/api/discounts/students/${student.id}`).set(bearer(token)).expect(200);
  });

  it('taklif kodi bilan kelgan lead o‘quvchiga aylanganda taklif CONVERTED bo‘ladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Grafik dizayn');
    const source = await createSource();
    const referrer = await createStudent(course.id, null, 'Doston');

    const lead = await request(app)
      .post('/api/leads')
      .set(bearer(token))
      .send({ firstName: 'Yangi', lastName: 'Mijoz', phone: '+998901112233', sourceId: source.id, referralCode: referrer.referralCode });
    expect(lead.status).toBe(201);

    const pending = await prisma.referral.findFirstOrThrow({ where: { referrerStudentId: referrer.id } });
    expect(pending.status).toBe('PENDING');

    const converted = await request(app)
      .post(`/api/leads/${lead.body.data.id}/convert`)
      .set(bearer(token))
      .send({ courseId: course.id, contractPrice: 1_000_000 });
    expect(converted.status).toBe(201);

    const after = await prisma.referral.findUniqueOrThrow({ where: { id: pending.id } });
    expect(after.status).toBe('CONVERTED');
    expect(after.referredStudentId).toBe(converted.body.data.id);
  });

  it('bonus faqat aylangandan keyin va bir marta beriladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Kompyuter savodxonligi');
    const referrer = await createStudent(course.id, null, 'Sardor');
    const referred = await createStudent(course.id, null, 'Jasur');
    await createRule({ key: 'referral', name: 'Do‘st bonusi', type: 'REFERRAL', value: 5 });

    const pending = await prisma.referral.create({ data: { referrerStudentId: referrer.id, status: 'PENDING' } });
    const tooEarly = await request(app).post(`/api/referrals/${pending.id}/reward`).set(bearer(token)).send({});
    expect(tooEarly.status).toBe(422);

    await prisma.referral.update({ where: { id: pending.id }, data: { status: 'CONVERTED', referredStudentId: referred.id } });
    const rewarded = await request(app).post(`/api/referrals/${pending.id}/reward`).set(bearer(token)).send({});
    expect(rewarded.status).toBe(200);
    expect(rewarded.body.data.status).toBe('REWARDED');
    expect(rewarded.body.data.bonusAmount).toBe(50_000);

    // Bonus taklif qilgan o'quvchiga chegirma sifatida tushdi
    const updated = await prisma.student.findUniqueOrThrow({ where: { id: referrer.id } });
    expect(updated.contractPrice.toNumber()).toBe(950_000);
    expect(updated.discountTotal.toNumber()).toBe(50_000);

    const again = await request(app).post(`/api/referrals/${pending.id}/reward`).set(bearer(token)).send({});
    expect(again.status).toBe(409);
  });

  it('o‘zini o‘zi taklif qilgan yozuv bekor qilinadi, bonus berilmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse('Shaxmat');
    const source = await createSource();
    const student = await createStudent(course.id, null, 'Kamola');

    // Lead o'z kodini kiritdi va o'zi o'quvchiga aylantirildi
    const lead = await prisma.lead.create({
      data: { firstName: 'Kamola', phone: '+998907776655', sourceId: source.id },
    });
    await prisma.referral.create({ data: { referrerStudentId: student.id, leadId: lead.id, status: 'PENDING' } });
    await prisma.student.update({ where: { id: student.id }, data: { leadId: lead.id } });

    const { referralService } = await import('../src/services/referral.service.js');
    await prisma.$transaction(async (tx) => {
      await referralService.onLeadConverted(tx, lead.id, student.id);
    });

    const referral = await prisma.referral.findFirstOrThrow({ where: { referrerStudentId: student.id } });
    expect(referral.status).toBe('CANCELLED');

    const rewarded = await request(app).post(`/api/referrals/${referral.id}/reward`).set(bearer(token)).send({});
    expect(rewarded.status).toBe(422);
  });

  it('referal hisoboti taklif, aylanish va bonusni ko‘rsatadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const course = await createCourse('Fizika');
    const referrer = await createStudent(course.id, null, 'Malika');
    const referred = await createStudent(course.id, null, 'Nodir');
    await prisma.referral.create({ data: { referrerStudentId: referrer.id, status: 'PENDING' } });
    await prisma.referral.create({
      data: { referrerStudentId: referrer.id, referredStudentId: referred.id, status: 'REWARDED', bonusAmount: 50_000 },
    });
    await prisma.payment.create({
      data: { studentId: referred.id, courseId: course.id, amount: 300_000, method: 'CASH' },
    });

    const response = await request(app).get('/api/referrals/stats').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(2);
    expect(response.body.data.converted).toBe(1);
    expect(response.body.data.bonusTotal).toBe(50_000);
    expect(response.body.data.referralRevenue).toBe(300_000);
    expect(response.body.data.top[0]).toMatchObject({ name: 'Malika Karimov', total: 2, converted: 1 });
  });

  it('kod bo‘yicha qidirish taklif qiluvchini topadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
    const course = await createCourse('Kimyo');
    const student = await createStudent(course.id, null, 'Ulug‘bek');

    const found = await request(app).get('/api/referrals/lookup').query({ code: student.referralCode }).set(bearer(token));
    expect(found.status).toBe(200);
    expect(found.body.data.name).toBe('Ulug‘bek Karimov');

    const missing = await request(app).get('/api/referrals/lookup').query({ code: 'R99999' }).set(bearer(token));
    expect(missing.body.data).toBeNull();
  });
});
