import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse } from './helpers/fixtures.js';

const app = createApp();

async function createRoom(token: string, key = 'A1', name = 'A1 xona') {
  const response = await request(app).post('/api/rooms').set(bearer(token)).send({ key, name, capacity: 20 });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; key: string; name: string };
}

interface GroupPayload {
  name: string;
  courseId: string;
  roomId?: string;
  teacherId?: string;
  scheduleDays?: string[];
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
  allowConflict?: boolean;
}

function groupBody(payload: GroupPayload) {
  return {
    name: payload.name,
    courseId: payload.courseId,
    capacity: 15,
    scheduleDays: payload.scheduleDays ?? ['MONDAY', 'WEDNESDAY'],
    startTime: payload.startTime ?? '14:00',
    endTime: payload.endTime ?? '16:00',
    startDate: payload.startDate ?? '2026-09-01',
    ...(payload.endDate ? { endDate: payload.endDate } : {}),
    ...(payload.roomId ? { roomId: payload.roomId } : {}),
    ...(payload.teacherId ? { teacherId: payload.teacherId } : {}),
    ...(payload.allowConflict ? { allowConflict: true } : {}),
    status: 'ACTIVE',
  };
}

describe.skipIf(!hasTestDatabase)('Xonalar va jadval to‘qnashuvi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('xona qo‘shish faqat group.manage bilan, takroriy kalit rad etiladi', async () => {
    const { token: admin } = await createUserWithToken(app, { role: 'ADMIN' });
    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER' });

    const created = await request(app).post('/api/rooms').set(bearer(admin)).send({ key: 'A1', name: 'A1 xona', capacity: 20 });
    const duplicate = await request(app).post('/api/rooms').set(bearer(admin)).send({ key: 'A1', name: 'Boshqa', capacity: 10 });
    const byTeacher = await request(app).post('/api/rooms').set(bearer(teacher)).send({ key: 'B2', name: 'B2', capacity: 10 });
    const list = await request(app).get('/api/rooms').set(bearer(teacher));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ key: 'A1', capacity: 20, isActive: true });
    expect(duplicate.status).toBe(409);
    expect(byTeacher.status).toBe(403);
    // Ko'rish o'qituvchiga ochiq
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('bitta xonaga bir vaqtda ikki guruh qo‘shib bo‘lmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const room = await createRoom(token);

    const first = await request(app).post('/api/groups').set(bearer(token)).send(groupBody({ name: 'Ertalabki', courseId: course.id, roomId: room.id }));
    const clash = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupBody({ name: 'Kechki', courseId: course.id, roomId: room.id, startTime: '15:00', endTime: '17:00' }));

    expect(first.status).toBe(201);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('Xona band');
    expect(clash.body.errors[0]).toMatchObject({ field: 'roomId' });
    expect(await prisma.group.count()).toBe(1);
  });

  it('vaqtlar kesishmasa yoki kunlar boshqa bo‘lsa — to‘qnashuv yo‘q', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const room = await createRoom(token);
    await request(app).post('/api/groups').set(bearer(token)).send(groupBody({ name: 'Birinchi', courseId: course.id, roomId: room.id }));

    const afterIt = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupBody({ name: 'Keyingi', courseId: course.id, roomId: room.id, startTime: '16:00', endTime: '18:00' }));
    const otherDays = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupBody({ name: 'Boshqa kunlar', courseId: course.id, roomId: room.id, scheduleDays: ['TUESDAY', 'THURSDAY'] }));

    // 14:00–16:00 va 16:00–18:00 chegarada tegadi, lekin kesishmaydi
    expect(afterIt.status).toBe(201);
    expect(otherDays.status).toBe(201);
  });

  it('o‘qituvchi bir vaqtda ikki guruhda dars qila olmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const { user: teacher } = await createUserWithToken(app, { role: 'TEACHER' });
    const course = await createCourse();
    const roomA = await createRoom(token, 'A1', 'A1');
    const roomB = await createRoom(token, 'B2', 'B2');

    await request(app).post('/api/groups').set(bearer(token)).send(groupBody({ name: 'A guruh', courseId: course.id, roomId: roomA.id, teacherId: teacher.id }));
    const clash = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupBody({ name: 'B guruh', courseId: course.id, roomId: roomB.id, teacherId: teacher.id }));

    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('O‘qituvchi band');
    expect(clash.body.errors[0]).toMatchObject({ field: 'teacherId' });
  });

  it('davrlar kesishmasa to‘qnashuv hisoblanmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const room = await createRoom(token);
    await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupBody({ name: 'Yozgi', courseId: course.id, roomId: room.id, startDate: '2026-06-01', endDate: '2026-08-31' }));

    const autumn = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupBody({ name: 'Kuzgi', courseId: course.id, roomId: room.id, startDate: '2026-09-01' }));

    expect(autumn.status).toBe(201);
  });

  it('allowConflict bilan ataylab saqlash mumkin (qo‘shma dars)', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const room = await createRoom(token);
    await request(app).post('/api/groups').set(bearer(token)).send(groupBody({ name: 'Asosiy', courseId: course.id, roomId: room.id }));

    const forced = await request(app)
      .post('/api/groups')
      .set(bearer(token))
      .send(groupBody({ name: 'Qo‘shma', courseId: course.id, roomId: room.id, allowConflict: true }));

    expect(forced.status).toBe(201);
    expect(await prisma.group.count()).toBe(2);
  });

  it('tahrirlashda guruh o‘zi bilan to‘qnashmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const room = await createRoom(token);
    const created = await request(app).post('/api/groups').set(bearer(token)).send(groupBody({ name: 'Yagona', courseId: course.id, roomId: room.id }));

    const updated = await request(app)
      .put(`/api/groups/${created.body.data.id}`)
      .set(bearer(token))
      .send(groupBody({ name: 'Yagona', courseId: course.id, roomId: room.id, endTime: '17:00' }));

    expect(updated.status).toBe(200);
    expect(updated.body.data.roomRef).toMatchObject({ name: 'A1 xona' });
  });

  it('saqlashdan oldin tekshirish endpointi to‘qnashuvlarni qaytaradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const room = await createRoom(token);
    await request(app).post('/api/groups').set(bearer(token)).send(groupBody({ name: 'Band guruh', courseId: course.id, roomId: room.id }));

    const check = await request(app)
      .post('/api/rooms/conflicts')
      .set(bearer(token))
      .send({
        roomId: room.id,
        scheduleDays: ['MONDAY'],
        startTime: '15:00',
        endTime: '16:30',
        startDate: '2026-09-10',
      });
    const free = await request(app)
      .post('/api/rooms/conflicts')
      .set(bearer(token))
      .send({ roomId: room.id, scheduleDays: ['SUNDAY'], startTime: '10:00', endTime: '12:00', startDate: '2026-09-10' });

    expect(check.body.data.conflicts).toHaveLength(1);
    expect(check.body.data.conflicts[0]).toMatchObject({ kind: 'ROOM', groupName: 'Band guruh', days: ['MONDAY'] });
    expect(free.body.data.conflicts).toEqual([]);
  });

  it('guruhlari bor xonani o‘chirib bo‘lmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const course = await createCourse();
    const room = await createRoom(token);
    await request(app).post('/api/groups').set(bearer(token)).send(groupBody({ name: 'Band', courseId: course.id, roomId: room.id }));

    const disabled = await request(app).put(`/api/rooms/${room.id}`).set(bearer(token)).send({ isActive: false });

    expect(disabled.status).toBe(422);
  });
});
