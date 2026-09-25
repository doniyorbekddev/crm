import type { APIRequestContext } from '@playwright/test';
import { Client } from 'pg';
import { API_PORT, e2eDatabaseUrl } from './env';
import { USERS, expect } from './fixtures';
import type { SeedUser } from './fixtures';

/** TZ 3.0 §64–66 to'liq oqimlari uchun umumiy tayyorgarlik (faqat boshlang'ich ma'lumot — asosiy qadamlar UI orqali) */

export const API = `http://localhost:${API_PORT}/api`;

export type Headers = { Authorization: string };

export async function apiLogin(request: APIRequestContext, user: SeedUser): Promise<Headers> {
  const response = await request.post(`${API}/auth/login`, { data: { email: USERS[user].email, password: USERS[user].password } });
  expect(response.status()).toBe(200);
  return { Authorization: `Bearer ${(await response.json()).data.accessToken as string}` };
}

export interface FlowFamily {
  admin: Headers;
  groupId: string;
  groupName: string;
  courseId: string;
  student: { id: string; name: string; login: string; password: string };
  parent: { id: string; userId: string; phone: string; password: string };
}

/**
 * Seed o'qituvchisining guruhidagi o'quvchi: kabinet ochiladi, ota-ona yaratiladi va unga ham
 * kabinet ochiladi, ota-onaning Telegrami "bog'langan" holatga keltiriladi (bot bilan haqiqiy
 * aloqa E2E'da o'chiq — faqat navbatga yozilishi tekshiriladi).
 */
const used = new Set<string>();

export async function prepareFamily(request: APIRequestContext): Promise<FlowFamily> {
  const admin = await apiLogin(request, 'admin');
  const teacher = await apiLogin(request, 'teacher');
  const groups = (await (await request.get(`${API}/groups`, { params: { status: 'ACTIVE', limit: 50 }, headers: teacher })).json()).data as Array<{
    id: string;
    name: string;
    course: { id: string };
  }>;
  expect(groups.length, 'seed o‘qituvchisida faol guruh bo‘lishi kerak').toBeGreaterThan(0);

  for (const group of groups) {
    const students = (await (await request.get(`${API}/students`, { params: { groupId: group.id, status: 'ACTIVE', limit: 30 }, headers: admin })).json()).data as Array<{
      id: string;
      firstName: string;
      lastName: string;
    }>;
    // Har testga boshqa o'quvchi (bir o'quvchida bir nechta ota-ona/natija aralashmasin)
    for (const student of students.filter((item) => !used.has(item.id))) {
      used.add(student.id);
      let loginName = `flow-${Date.now()}-${student.id.slice(-4)}@e2e.uz`;
      let account = await request.post(`${API}/students/${student.id}/portal-account`, { data: { email: loginName }, headers: admin });
      if (account.status() === 409) {
        // Oldingi test kabinet ochgan — xodim parolni tiklaydi (yangi vaqtinchalik parol)
        account = await request.post(`${API}/students/${student.id}/portal-account/reset-password`, { headers: admin, data: {} });
        loginName = await withDb(async (db) => (await db.query<{ email: string }>('SELECT u.email FROM users u JOIN students s ON s."userId" = u.id WHERE s.id = $1', [student.id])).rows[0]!.email);
      }
      expect([200, 201]).toContain(account.status());
      const studentPassword = (await account.json()).data.temporaryPassword as string;

      const phone = `+99893${String(Date.now()).slice(-7)}`;
      const parent = await request.post(`${API}/parents`, {
        headers: admin,
        data: { firstName: 'Malika', lastName: 'Oqilova', phone, students: [{ studentId: student.id, relation: 'MOTHER' }] },
      });
      expect(parent.status(), await parent.text()).toBe(201);
      const parentId = (await parent.json()).data.id as string;
      const parentAccount = await request.post(`${API}/parents/${parentId}/portal-account`, { headers: admin, data: {} });
      expect(parentAccount.status()).toBe(201);
      const parentPassword = (await parentAccount.json()).data.temporaryPassword as string;
      const parentUserId = await withDb(async (db) => (await db.query<{ userId: string }>('SELECT "userId" FROM parents WHERE id = $1', [parentId])).rows[0]!.userId);
      await linkParentTelegram(parentId);

      return {
        admin,
        groupId: group.id,
        groupName: group.name,
        courseId: group.course.id,
        student: { id: student.id, name: `${student.firstName} ${student.lastName}`, login: loginName, password: studentPassword },
        parent: { id: parentId, userId: parentUserId, phone, password: parentPassword },
      };
    }
  }
  throw new Error('O‘qituvchi guruhida faol o‘quvchi topilmadi');
}

export async function withDb<T>(run: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: e2eDatabaseUrl() });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

/** Ota-onaning tasdiqlangan Telegram bog'lanishi (botda kod/telefon orqali bo'ladigan holat — `parentId` bo'yicha) */
async function linkParentTelegram(parentId: string): Promise<void> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await withDb((db) =>
    db.query(
      `INSERT INTO telegram_links (id, "chatId", "linkCode", "codeUsedAt", "telegramUserId", "parentId", "verifiedAt", "isActive", muted, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), $2, $4, NOW(), true, false, NOW(), NOW())`,
      [`e2e-link-${stamp}`, `9${stamp}`.slice(0, 15), `e2e${stamp}`.slice(0, 32), parentId],
    ),
  );
}

/** Ota-ona uchun Telegram navbatiga yozilgan xabarlar sarlavhalari */
export async function telegramTitles(parentId: string): Promise<string[]> {
  return withDb(async (db) => {
    const rows = await db.query<{ title: string; lastError: string | null }>(
      `SELECT d.title, d."lastError" FROM notification_deliveries d JOIN telegram_links l ON l.id = d."telegramLinkId"
       WHERE l."parentId" = $1 AND d.channel = 'TELEGRAM' ORDER BY d."createdAt"`,
      [parentId],
    );
    // E2E'da bot tokeni yo'q: xabar navbatga yoziladi, lekin tashqariga hech narsa ketmaydi
    for (const row of rows.rows) if (row.lastError) expect(row.lastError).toContain('tokeni sozlanmagan');
    return rows.rows.map((row) => row.title);
  });
}

/** Kurs dasturida yangi mavzu (modul + mavzu) */
export async function createTopic(request: APIRequestContext, headers: Headers, courseId: string, title: string): Promise<string> {
  const module = await request.post(`${API}/courses/${courseId}/modules`, { headers, data: { title: `${title} moduli` } });
  expect(module.status()).toBe(201);
  const topic = await request.post(`${API}/curriculum/modules/${(await module.json()).data.id as string}/topics`, { headers, data: { title } });
  expect(topic.status()).toBe(201);
  return (await topic.json()).data.id as string;
}

/** Savollar bankiga savol (rahbar/metodist tayyorlaydi — o'qituvchi faqat foydalanadi) */
export async function createQuestion(request: APIRequestContext, headers: Headers, data: Record<string, unknown>): Promise<string> {
  const response = await request.post(`${API}/questions`, { headers, data });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data.id as string;
}
