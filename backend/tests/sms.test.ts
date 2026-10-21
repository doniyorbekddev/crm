import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/database.js';
import { eskizService, normalizeSmsPhone, toSmsText } from '../src/services/eskiz.service.js';
import { notificationDeliveryService } from '../src/services/notificationDelivery.service.js';
import { smsSettingsService } from '../src/services/smsSettings.service.js';
import { addDays, startOfBusinessDay } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * SMS zaxira kanali (Eskiz.uz): faqat Telegram ulanmaganlarga, faqat yoqilgan turlar, kunlik limit, tungi vaqt,
 * soxta "yuborildi" yo'q. Eskiz API — `fetch` orqali soxtalashtirilgan (tarmoqqa chiqilmaydi).
 */
const app = createApp();
const mutableEnv = env as { -readonly [K in keyof typeof env]: (typeof env)[K] };
const saved = { email: env.ESKIZ_EMAIL, password: env.ESKIZ_PASSWORD };
const SECRET = 'eskiz-test-password-do-not-leak';
/** Ertangi kun boshi (Toshkent) — navbat yozuvlari hozirgi vaqt bilan yaratiladi, shuning uchun sinov soati kelajakda */
const TOMORROW = startOfBusinessDay(addDays(new Date(), 1));
const HOUR = 3_600_000;
/** Toshkent 12:00 — kunduzi */
const NOON = new Date(TOMORROW.getTime() + 12 * HOUR);
let counter = 0;

describe('SMS matni va raqam', () => {
  it('tutuq belgilari ASCII ga, uzun matn qisqartiriladi; raqam 998XXXXXXXXX', () => {
    expect(toSmsText('Ali — FE-1 guruhidagi «Oraliq» darsga kelmadi… o‘g‘il')).toBe(`Ali - FE-1 guruhidagi "Oraliq" darsga kelmadi... o'g'il`);
    expect(toSmsText('a'.repeat(400))).toHaveLength(320);
    expect(normalizeSmsPhone('+998 90 123-45-67')).toBe('998901234567');
    expect(normalizeSmsPhone('901234567')).toBe('998901234567');
    expect(normalizeSmsPhone('+7 912 123 45 67')).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)('SMS zaxira kanali (integratsion)', () => {
  let owner: string;
  let teacherToken: string;
  let groupId: string;
  let courseId: string;
  let fetchMock: MockInstance<typeof fetch>;
  let sendReply: () => Response;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    smsSettingsService.resetCache();
    eskizService.resetForTests();
    Object.assign(mutableEnv, { ESKIZ_EMAIL: 'markaz@example.uz', ESKIZ_PASSWORD: SECRET });
    ({ token: owner } = await createUserWithToken(app, { role: 'OWNER' }));
    const teacher = await createUserWithToken(app, { role: 'TEACHER' });
    teacherToken = teacher.token;
    courseId = (await createCourse()).id;
    groupId = (await createGroup({ courseId, teacherId: teacher.user.id, name: 'FE-1', startDate: '2026-09-01' })).id;
    sendReply = () => new Response(JSON.stringify({ id: 'eskiz-1', message: 'Waiting for SMS provider', status: 'waiting' }), { status: 200 });
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ data: { token: 'tok-1' } }), { status: 200 });
      if (url.endsWith('/message/sms/send')) return sendReply();
      if (url.endsWith('/user/get-limit')) return new Response(JSON.stringify({ data: { balance: 15000 } }), { status: 200 });
      return new Response('{}', { status: 404 });
    });
  });
  afterEach(() => {
    Object.assign(mutableEnv, { ESKIZ_EMAIL: saved.email, ESKIZ_PASSWORD: saved.password });
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function studentWithParent(parentPhone = '+998 93 555-00-01') {
    counter += 1;
    const student = await prisma.student.create({
      data: { firstName: `Ali${counter}`, lastName: 'Valiyev', phone: `+99890${String(8_000_000 + counter)}`, courseId, groupId, contractPrice: 0, startDate: new Date('2026-09-01') },
    });
    const parent = await prisma.parent.create({ data: { firstName: 'Vali', lastName: 'Valiyev', phone: parentPhone } });
    await prisma.studentParent.create({ data: { studentId: student.id, parentId: parent.id, isPrimary: true } });
    return { student, parent };
  }
  const enable = (over: Record<string, unknown> = {}) =>
    request(app).put('/api/settings/sms').set(bearer(owner)).send({ enabled: true, types: ['CHILD_ABSENT'], recipients: 'PARENTS', dailyLimit: 200, ...over });
  const markAbsent = (studentIds: string[], date = '2026-09-14') =>
    request(app)
      .post(`/api/groups/${groupId}/attendance`)
      .set(bearer(teacherToken))
      .send({ date, records: studentIds.map((studentId) => ({ studentId, status: 'ABSENT' })) })
      .expect(200);
  const smsRows = () => prisma.notificationDelivery.findMany({ where: { channel: 'SMS' }, orderBy: { createdAt: 'asc' } });

  it('kalitlar yo‘q: yoqib bo‘lmaydi (422), kelmadi xabari SMS bo‘lib navbatga tushmaydi', async () => {
    Object.assign(mutableEnv, { ESKIZ_EMAIL: undefined, ESKIZ_PASSWORD: undefined });
    expect((await enable()).status).toBe(422);
    const { student } = await studentWithParent();
    await markAbsent([student.id]);
    expect(await smsRows()).toHaveLength(0);
    const status = (await request(app).get('/api/settings/sms').set(bearer(owner)).expect(200)).body.data;
    expect(status).toMatchObject({ configured: false, enabled: false });
  });

  it('yoqilgan: Telegramsiz ota-onaga SMS; Telegrami bor yoki "ovozsiz" qilgan ota-onaga SMS yo‘q; o‘quvchiga yo‘q (faqat ota-ona)', async () => {
    await enable().expect(200);
    const plain = await studentWithParent('+998 93 555-00-01');
    const telegram = await studentWithParent('+998 93 555-00-02');
    await prisma.telegramLink.create({ data: { parentId: telegram.parent.id, chatId: '501', linkCode: 'sms-1', verifiedAt: new Date() } });
    const muted = await studentWithParent('+998 93 555-00-03');
    await prisma.telegramLink.create({ data: { parentId: muted.parent.id, chatId: '502', linkCode: 'sms-2', verifiedAt: new Date(), muted: true } });

    await markAbsent([plain.student.id, telegram.student.id, muted.student.id]);
    const rows = await smsRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: '998935550001', status: 'PENDING' });
    expect(await prisma.notificationDelivery.count({ where: { channel: 'TELEGRAM' } })).toBe(1);

    // Qayta belgilash takroriy SMS yaratmaydi
    await markAbsent([plain.student.id]);
    expect(await smsRows()).toHaveLength(1);
  });

  it('navbat: kunduzi Eskiz orqali yuboriladi (login → token → send), id saqlanadi; parol javobda yo‘q', async () => {
    await enable().expect(200);
    const { student } = await studentWithParent();
    await markAbsent([student.id]);
    const result = await notificationDeliveryService.processQueue(NOON);
    expect(result.sent).toBe(1);
    const [row] = await smsRows();
    expect(row).toMatchObject({ status: 'SENT', providerMessageId: 'eskiz-1', attempts: 1 });

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls).toEqual([`${env.ESKIZ_BASE_URL}/auth/login`, `${env.ESKIZ_BASE_URL}/message/sms/send`]);
    const sendInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    const form = sendInit.body as FormData;
    expect(form.get('mobile_phone')).toBe('998935550001');
    expect(String(form.get('message'))).toMatch(/darsga kelmadi\.$/);
    expect(String(form.get('message'))).not.toMatch(/[‘’—]/);

    const status = await request(app).get('/api/settings/sms').set(bearer(owner)).expect(200);
    expect(status.body.data).toMatchObject({ configured: true, enabled: true, today: { sent: 1 } });
    expect(JSON.stringify(status.body)).not.toContain(SECRET);
  });

  it('tunda (22:00) yuborilmaydi — ertalab 08:00 ga suriladi', async () => {
    await enable().expect(200);
    const { student } = await studentWithParent();
    await markAbsent([student.id]);
    await notificationDeliveryService.processQueue(new Date(TOMORROW.getTime() + 22 * HOUR));
    const [row] = await smsRows();
    expect(row).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(row!.nextAttemptAt.toISOString()).toBe(new Date(TOMORROW.getTime() + 32 * HOUR).toISOString());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kunlik limit: 1 tadan keyin qolganlari SKIPPED; o‘chirilgan sozlama — SKIPPED', async () => {
    await enable({ dailyLimit: 1 }).expect(200);
    const first = await studentWithParent('+998 93 555-00-01');
    const second = await studentWithParent('+998 93 555-00-02');
    await markAbsent([first.student.id, second.student.id]);
    const result = await notificationDeliveryService.processQueue(NOON);
    expect(result).toMatchObject({ sent: 1, skipped: 1 });
    expect((await smsRows()).map((row) => row.status).sort()).toEqual(['SENT', 'SKIPPED']);

    const third = await studentWithParent('+998 93 555-00-03');
    await markAbsent([third.student.id], '2026-09-16');
    await enable({ enabled: false }).expect(200);
    await notificationDeliveryService.processQueue(NOON);
    const last = (await smsRows()).at(-1)!;
    expect(last).toMatchObject({ status: 'SKIPPED', lastError: 'SMS o‘chirilgan (Sozlamalar)' });
  });

  it('Eskiz rad etdi (shablon moderatsiyadan o‘tmagan) — FAILED, qayta urinilmaydi; 401 — qayta kirib yuboradi', async () => {
    await enable().expect(200);
    const { student } = await studentWithParent();
    sendReply = () => new Response(JSON.stringify({ message: 'Этот смс текст еще не прошел модерацию' }), { status: 400 });
    await markAbsent([student.id]);
    expect((await notificationDeliveryService.processQueue(NOON)).failed).toBe(1);
    expect((await smsRows())[0]).toMatchObject({ status: 'FAILED', lastError: expect.stringContaining('модерацию') });

    // Token eskirgan: birinchi send 401 → login qayta → send muvaffaqiyatli
    const other = await studentWithParent('+998 93 555-00-09');
    let sends = 0;
    sendReply = () => {
      sends += 1;
      return sends === 1 ? new Response('{"message":"Expired"}', { status: 401 }) : new Response('{"id":"eskiz-2","status":"waiting"}', { status: 200 });
    };
    await markAbsent([other.student.id], '2026-09-16');
    expect((await notificationDeliveryService.processQueue(NOON)).sent).toBe(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'))).toHaveLength(2);
  });

  it('sinov SMS va balans; o‘qituvchiga yopiq', async () => {
    const sent = await request(app).post('/api/settings/sms/test').set(bearer(owner)).send({ phone: '+998 90 111 22 33' });
    expect(sent.status).toBe(200);
    expect(sent.body.data.providerMessageId).toBe('eskiz-1');
    expect((await request(app).post('/api/settings/sms/test').set(bearer(owner)).send({ phone: '12345' })).status).toBe(422);
    expect((await request(app).get('/api/settings/sms/balance').set(bearer(owner))).body.data.balance).toBe(15000);
    expect((await request(app).get('/api/settings/sms').set(bearer(teacherToken))).status).toBe(403);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'sms.test_sent' } });
    expect(JSON.stringify(audit?.metadata)).not.toContain('901112233');
  });
});
