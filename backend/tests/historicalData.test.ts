import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MAIN_BRANCH_ID } from '../src/config/branch.js';
import { prisma } from '../src/config/database.js';
import { activeStudentsAt, droppedBetween } from '../src/services/history.service.js';
import { debtForMonth, ensurePreviousMonthSnapshot, generateMonthSnapshots } from '../src/services/monthSnapshot.service.js';
import { loadWorkload } from '../src/services/salary.service.js';
import { addDays, businessDateString, businessMonthRange, currentBusinessMonth } from '../src/utils/dates.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createGroup } from './helpers/fixtures.js';

/**
 * Tarixiy ma'lumot va oylik hisobot (spetsifikatsiyaning 17 test holati): o'tgan oy hisobotlari keyingi to'lov,
 * holat yoki guruh o'zgarishidan ta'sirlanmaydi; yopilgan oy davomati faqat ruxsat va sabab bilan o'zgaradi.
 *
 * Sanalar bugungi kunga nisbatan: PREV — o'tgan oy, OLDER — undan oldingi oy.
 */

const app = createApp();

const shift = (period: { year: number; month: number }, months: number) => {
  const index = period.year * 12 + (period.month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};
const CURRENT = currentBusinessMonth();
const PREV = shift(CURRENT, -1);
const OLDER = shift(CURRENT, -2);
const prevRange = businessMonthRange(PREV.year, PREV.month);
const olderRange = businessMonthRange(OLDER.year, OLDER.month);
const monthKey = (period: { year: number; month: number }) => `${period.year}-${String(period.month).padStart(2, '0')}`;
/** O'tgan oyning 10-sanasi (o'quv markaz kuni) — davomat va to'lov uchun */
const prevDay = `${monthKey(PREV)}-10`;
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);

async function student(options: { groupId: string; courseId: string; createdAt: Date; name: string; total?: number; branchId?: string }) {
  return prisma.student.create({
    data: {
      firstName: options.name,
      lastName: 'Tarix',
      phone: '+998901112233',
      courseId: options.courseId,
      groupId: options.groupId,
      contractPrice: options.total ?? 1_000_000,
      startDate: new Date(`${businessDateString(options.createdAt)}T00:00:00Z`),
      createdAt: options.createdAt,
      ...(options.branchId ? { branchId: options.branchId } : {}),
      debt: { create: { totalAmount: options.total ?? 1_000_000, remainingAmount: options.total ?? 1_000_000 } },
    },
  });
}

/** Holat o'zgarishi — xuddi `student.service.setStatus` kabi tarix yoziladi */
async function changeStatus(studentId: string, from: 'ACTIVE' | 'DROPPED', to: 'ACTIVE' | 'DROPPED', changedAt: Date) {
  await prisma.student.update({ where: { id: studentId }, data: { status: to, statusChangedAt: changedAt } });
  await prisma.studentStatusChange.create({ data: { studentId, fromStatus: from, toStatus: to, changedAt } });
}

async function moveGroup(studentId: string, fromGroupId: string, toGroupId: string, changedAt: Date) {
  await prisma.student.update({ where: { id: studentId }, data: { groupId: toGroupId } });
  await prisma.studentGroupChange.create({ data: { studentId, fromGroupId, toGroupId, changedAt } });
}

describe.skipIf(!hasTestDatabase)('Tarixiy ma’lumot va oylik hisobot', () => {
  let owner: string;
  let admin: string;
  let teacherId: string;
  let courseId: string;
  let groupA: string;
  let groupB: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    ({ token: owner } = await createUserWithToken(app, { role: 'OWNER', email: 'owner@test.uz' }));
    ({ token: admin } = await createUserWithToken(app, { role: 'ADMIN', email: 'admin@test.uz' }));
    const teacher = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    teacherId = teacher.user.id;
    courseId = (await createCourse()).id;
    const startDate = businessDateString(olderRange.start);
    groupA = (await createGroup({ courseId, teacherId, name: 'A guruh', startDate, scheduleDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] })).id;
    groupB = (await createGroup({ courseId, name: 'B guruh', startDate })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** To'lov haqiqiy API orqali — kassa yozuvi va qarz qayta hisobi bilan */
  const pay = async (studentId: string, _courseId: string, amount: number, paidAt: Date) => {
    const response = await request(app).post('/api/payments').set(bearer(owner)).send({ studentId, amount, method: 'CASH', paidAt: paidAt.toISOString() });
    expect(response.status).toBe(201);
  };

  const executive = (token: string, period?: { year: number; month: number }) =>
    request(app).get('/api/dashboard/executive').query(period ?? {}).set(bearer(token));

  it('1, 4: standart — joriy oy, qarz hozirgi holatdan', async () => {
    const response = await executive(owner);
    expect(response.status).toBe(200);
    expect(response.body.data.period.kind).toBe('current-month');
    expect(response.body.data.month).toMatchObject({ year: CURRENT.year, month: CURRENT.month, debtSource: 'LIVE' });
  });

  it('2, 3, 11, 17: o‘tgan oy oy oxiridagi holatni ko‘rsatadi — keyin ketgan va keyin qo‘shilgan o‘quvchi ta’sir qilmaydi', async () => {
    const stayed = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Qolgan' });
    const leftLater = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Keyin ketgan' });
    // PREV oyida emas, joriy oyda ketdi — PREV oxirida faol edi
    await changeStatus(leftLater.id, 'ACTIVE', 'DROPPED', at(prevRange.end, 120));
    // Joriy oyda qo'shilgan — o'tgan oy hisobotiga kirmaydi
    await student({ groupId: groupA, courseId, createdAt: at(prevRange.end, 30), name: 'Yangi' });

    const prev = await executive(owner, PREV);
    expect(prev.status).toBe(200);
    expect(prev.body.data.month).toMatchObject({ activeStudents: 2, droppedStudents: 0, newStudents: 0 });

    const current = await executive(owner);
    expect(current.body.data.month).toMatchObject({ activeStudents: 2, droppedStudents: 1, newStudents: 1 });
    expect(await activeStudentsAt(prevRange.end, { branchId: null })).toBe(2);
    expect(stayed.status).toBe('ACTIVE');
  });

  it('9: snapshoti yo‘q oy qarzi tarixdan taxminiy tiklanadi — keyingi to‘lov o‘tgan oy qarzini kamaytirmaydi', async () => {
    const debtor = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Qarzdor' });
    await pay(debtor.id, courseId, 400_000, at(prevRange.start, 60 * 24 * 9));
    await pay(debtor.id, courseId, 300_000, at(prevRange.end, 60));

    const prev = await executive(owner, PREV);
    expect(prev.body.data.month).toMatchObject({ totalDebt: 600_000, debtSource: 'ESTIMATED' });
    const current = await executive(owner);
    expect(current.body.data.month).toMatchObject({ totalDebt: 300_000, debtSource: 'LIVE' });
  });

  it('3, 13: oy oxiri snapshoti aniq, idempotent va qayta yozilmaydi', async () => {
    const debtor = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Snapshot' });
    await pay(debtor.id, courseId, 250_000, at(prevRange.start, 60));

    const first = await generateMonthSnapshots(PREV.year, PREV.month, { now: at(prevRange.end, 30) });
    expect(first).toMatchObject({ created: 1, existing: 0, estimated: false });
    // Keyingi to'lov va qayta ishga tushirish — mavjud snapshot o'zgarmaydi, dublikat yo'q
    await pay(debtor.id, courseId, 500_000, at(prevRange.end, 60));
    const again = await generateMonthSnapshots(PREV.year, PREV.month);
    expect(again).toMatchObject({ created: 0, existing: 1 });
    const rows = await prisma.studentMonthSnapshot.findMany({ where: { year: PREV.year, month: PREV.month } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ACTIVE', groupId: groupA, estimated: false });
    expect(rows[0]!.debtAmount.toNumber()).toBe(750_000);

    const prev = await executive(owner, PREV);
    expect(prev.body.data.month).toMatchObject({ totalDebt: 750_000, debtSource: 'SNAPSHOT' });
    // Fon vazifasi borini qayta olmaydi
    expect(await ensurePreviousMonthSnapshot()).toBeNull();
    // Tugamagan oy uchun snapshot olinmaydi
    await expect(generateMonthSnapshots(CURRENT.year, CURRENT.month)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('4: fon vazifasi o‘tgan oy snapshotini kechikib olsa — taxminiy belgilanadi', async () => {
    await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Kechikkan' });
    const result = await ensurePreviousMonthSnapshot(at(prevRange.end, 60 * 48));
    expect(result).toMatchObject({ year: PREV.year, month: PREV.month, created: 1, estimated: true });
    const debt = await debtForMonth(PREV.year, PREV.month, prevRange.end, { branchId: null });
    expect(debt).toMatchObject({ total: 1_000_000, source: 'ESTIMATED' });
  });

  it('5, 6, 7: guruh o‘zgarsa o‘tgan oy jurnali va hisobotlari o‘sha paytdagi guruh bo‘yicha', async () => {
    const mover = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Ko‘chgan' });
    await prisma.attendance.create({ data: { studentId: mover.id, groupId: groupA, date: new Date(`${prevDay}T00:00:00Z`), status: 'PRESENT' } });
    await moveGroup(mover.id, groupA, groupB, at(prevRange.end, 60));
    // Joriy oyda A ga qo'shilgan — A ning o'tgan oy jurnalida ko'rinmaydi
    const later = await student({ groupId: groupA, courseId, createdAt: at(prevRange.end, 90), name: 'Keyingi' });

    const journalA = await request(app).get(`/api/groups/${groupA}/attendance/month`).query({ month: monthKey(PREV) }).set(bearer(owner));
    expect(journalA.status).toBe(200);
    const rowsA = journalA.body.data.students as Array<{ id: string; former: boolean; cells: Record<string, string> }>;
    expect(rowsA.find((row) => row.id === mover.id)).toMatchObject({ former: false, cells: { [prevDay]: 'PRESENT' } });
    expect(rowsA.some((row) => row.id === later.id)).toBe(false);

    const journalB = await request(app).get(`/api/groups/${groupB}/attendance/month`).query({ month: monthKey(PREV) }).set(bearer(owner));
    expect((journalB.body.data.students as Array<{ id: string }>).some((row) => row.id === mover.id)).toBe(false);

    const range = { from: `${monthKey(PREV)}-01`, to: businessDateString(addDays(prevRange.end, -1)) };
    const groups = await request(app).get('/api/reports/groups').query(range).set(bearer(owner));
    expect(groups.status).toBe(200);
    const groupRows = groups.body.data.rows as Array<{ group: string; students: number }>;
    expect(groupRows.find((row) => row.group === 'A guruh')?.students).toBe(1);
    expect(groupRows.find((row) => row.group === 'B guruh')?.students).toBe(0);
  });

  it('7: o‘tgan kun belgisi tarixda qoladi, guruhdan keyin chiqqan o‘quvchi qayta belgilanmaydi', async () => {
    const mover = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Sobiq' });
    await prisma.attendance.create({ data: { studentId: mover.id, groupId: groupA, date: new Date(`${prevDay}T00:00:00Z`), status: 'PRESENT' } });
    await moveGroup(mover.id, groupA, groupB, at(prevRange.end, 60));
    const response = await request(app)
      .post(`/api/groups/${groupA}/attendance`)
      .set(bearer(owner))
      .send({ date: prevDay, records: [{ studentId: mover.id, status: 'ABSENT' }] });
    expect(response.status).toBe(422);
    expect(await prisma.attendance.count({ where: { studentId: mover.id, groupId: groupA, status: 'PRESENT' } })).toBe(1);
  });

  it('8: o‘tgan oy tushumi keyingi to‘lovdan o‘zgarmaydi', async () => {
    const payer = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'To‘lovchi' });
    await pay(payer.id, courseId, 200_000, at(prevRange.start, 60 * 24 * 3));
    const before = (await executive(owner, PREV)).body.data.month.revenue as number;
    await pay(payer.id, courseId, 300_000, at(prevRange.end, 60));
    const after = (await executive(owner, PREV)).body.data.month.revenue as number;
    expect(before).toBe(200_000);
    expect(after).toBe(before);
  });

  it('10: tasdiqlanmagan o‘tgan oy maoshi — o‘quvchilar soni o‘sha oy oxiridagi holatdan', async () => {
    const dropped = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Ketgan' });
    await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Faol' });
    await changeStatus(dropped.id, 'ACTIVE', 'DROPPED', at(prevRange.end, 120));

    const prev = await prisma.$transaction((tx) => loadWorkload(tx, teacherId, PREV.year, PREV.month));
    const current = await prisma.$transaction((tx) => loadWorkload(tx, teacherId, CURRENT.year, CURRENT.month));
    expect(prev.studentsCount).toBe(2);
    expect(current.studentsCount).toBe(1);
  });

  it('12: vaqt zonasi chegarasi — oy oxiridan bir daqiqa oldin va keyin', async () => {
    const before = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Oldin' });
    const after = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Keyin' });
    await changeStatus(before.id, 'ACTIVE', 'DROPPED', at(prevRange.end, -1));
    await changeStatus(after.id, 'ACTIVE', 'DROPPED', at(prevRange.end, 1));
    const scope = { branchId: null };
    expect(await droppedBetween(prevRange.start, prevRange.end, scope)).toBe(1);
    expect(await droppedBetween(prevRange.end, businessMonthRange(CURRENT.year, CURRENT.month).end, scope)).toBe(1);
    // Oy oxirida: birinchisi ketgan, ikkinchisi hali faol
    expect(await activeStudentsAt(prevRange.end, scope)).toBe(1);
  });

  it('14, 15: yopilgan oy davomati — ruxsatsiz rad, ruxsat bilan sabab talab qilinadi va auditga yoziladi; qulflangan oy umuman o‘zgarmaydi', async () => {
    const pupil = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Davomat' });
    await request(app).post('/api/finance/periods/close').set(bearer(owner)).send(PREV).expect(200);
    const mark = (token: string, extra: Record<string, unknown> = {}) =>
      request(app).post(`/api/groups/${groupA}/attendance`).set(bearer(token)).send({ date: prevDay, records: [{ studentId: pupil.id, status: 'ABSENT' }], ...extra });

    // Admin — tuzatish ruxsati yo'q (faqat Owner / Super Admin)
    expect((await mark(admin)).status).toBe(403);
    const session = await request(app).post('/api/attendance-sessions').set(bearer(admin)).send({ groupId: groupA, date: prevDay });
    expect(session.status).toBe(403);

    // Owner — sababsiz 422 (maydon: correctionReason), sabab bilan saqlanadi
    const noReason = await mark(owner);
    expect(noReason.status).toBe(422);
    expect(noReason.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'correctionReason' })]));
    expect((await mark(owner, { correctionReason: 'Jurnalda xato belgilangan' })).status).toBe(200);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'attendance.closed_period_corrected' } });
    expect(audit?.metadata).toMatchObject({ reason: 'Jurnalda xato belgilangan' });

    // Qulflash: endi hech kim o'zgartira olmaydi va oy qayta ochilmaydi
    await request(app).post('/api/finance/periods/lock').set(bearer(owner)).send({ ...PREV, reason: 'Oy yakunlari tasdiqlandi' }).expect(200);
    expect((await mark(owner, { correctionReason: 'Yana bir tuzatish' })).status).toBe(409);
    expect((await request(app).post('/api/finance/periods/reopen').set(bearer(owner)).send({ ...PREV, reason: 'Qayta ochish urinishi' })).status).toBe(409);
    expect((await request(app).post('/api/finance/periods/snapshot').set(bearer(owner)).send(PREV)).status).toBe(409);

    // Qulfni ochish — yana "yopilgan" holat, sabab auditga
    const unlocked = await request(app).post('/api/finance/periods/unlock').set(bearer(owner)).send({ ...PREV, reason: 'Hujjat tuzatiladi' });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.data.status).toBe('CLOSED');
    expect(await prisma.auditLog.count({ where: { action: { in: ['finance.period_locked', 'finance.period_unlocked'] } } })).toBe(2);
  });

  it('14: ochiq oyning davomati oddiygidek — sabab so‘ralmaydi', async () => {
    const pupil = await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Ochiq' });
    const response = await request(app)
      .post(`/api/groups/${groupA}/attendance`)
      .set(bearer(admin))
      .send({ date: prevDay, records: [{ studentId: pupil.id, status: 'PRESENT' }] });
    expect(response.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'attendance.closed_period_corrected' } })).toBe(0);
  });

  it('16: RBAC va filial — qulflash faqat ruxsat bilan; snapshot qarzi filial bo‘yicha', async () => {
    await request(app).post('/api/finance/periods/close').set(bearer(owner)).send(PREV).expect(200);
    expect((await request(app).post('/api/finance/periods/lock').set(bearer(admin)).send({ ...PREV, reason: 'Admin urinishi' })).status).toBe(403);
    expect((await request(app).post('/api/finance/periods/snapshot').set(bearer(admin)).send(PREV)).status).toBe(403);

    const other = await prisma.branch.create({ data: { key: 'CHILONZOR', name: 'Chilonzor filiali', sortOrder: 10 } });
    await student({ groupId: groupA, courseId, createdAt: at(olderRange.start, 60), name: 'Asosiy', total: 1_000_000 });
    await student({ groupId: groupB, courseId, createdAt: at(olderRange.start, 60), name: 'Boshqa', total: 700_000, branchId: other.id });
    await generateMonthSnapshots(PREV.year, PREV.month, { now: at(prevRange.end, 30) });

    expect(await debtForMonth(PREV.year, PREV.month, prevRange.end, { branchId: MAIN_BRANCH_ID })).toMatchObject({ total: 1_000_000, source: 'SNAPSHOT' });
    expect(await debtForMonth(PREV.year, PREV.month, prevRange.end, { branchId: null })).toMatchObject({ total: 1_700_000 });
    const summary = await request(app).get('/api/finance/periods/snapshot').query(PREV).set(bearer(admin));
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ students: 1, totalDebt: 1_000_000, estimated: false });
  });
});
