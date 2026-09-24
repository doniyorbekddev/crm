import type { APIRequestContext, Page } from '@playwright/test';
import { API_PORT } from '../env';
import { USERS, expect, test } from '../fixtures';

const API = `http://localhost:${API_PORT}/api`;

interface PortalCredentials {
  email: string;
  password: string;
  studentName: string;
  studentId: string;
  groupId: string | null;
  headers: { Authorization: string };
}

/**
 * Seed bazasida kabinet hisobi yo‘q — admin API orqali birinchi faol o‘quvchiga ochiladi.
 * Parol faqat shu javobda keladi (backend uni qayta ko‘rsatmaydi).
 */
async function openStudentPortal(request: APIRequestContext): Promise<PortalCredentials> {
  const auth = await request.post(`${API}/auth/login`, { data: { email: USERS.admin.email, password: USERS.admin.password } });
  const headers = { Authorization: `Bearer ${(await auth.json()).data.accessToken as string}` };
  const students = (await (await request.get(`${API}/students`, { params: { limit: 20, status: 'ACTIVE' }, headers })).json()).data as Array<{
    id: string;
    firstName: string;
    lastName: string;
    group: { id: string } | null;
  }>;
  // Vazifa berish uchun guruhi bor o'quvchi kerak; oldingi test hisob ochgan bo'lsa (409) — keyingisi olinadi
  const candidates = [...students.filter((item) => item.group), ...students.filter((item) => !item.group)];
  expect(candidates.length, 'seed bazasida faol o‘quvchi bo‘lishi kerak').toBeGreaterThan(0);

  for (const student of candidates) {
    const email = `portal-${Date.now()}-${student.id.slice(-4)}@e2e.uz`;
    const created = await request.post(`${API}/students/${student.id}/portal-account`, { data: { email }, headers });
    if (created.status() === 409) continue;
    expect(created.status()).toBe(201);
    const password = (await created.json()).data.temporaryPassword as string;
    return {
      email,
      password,
      studentName: `${student.firstName} ${student.lastName}`,
      studentId: student.id,
      groupId: student.group?.id ?? null,
      headers,
    };
  }
  throw new Error('Kabinet ochish uchun bo‘sh o‘quvchi topilmadi');
}

async function loginAsStudent(page: Page, credentials: PortalCredentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Parol', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

test.describe('Kabinet (o‘quvchi) — PHASE 1 karkas', () => {
  test('o‘quvchi kiradi, bo‘limlar orasida yuradi, sozlamalarda parol formasi bor, xodim sahifasiga kira olmaydi', async ({ page, request }) => {
    const credentials = await openStudentPortal(request);
    await loginAsStudent(page, credentials);
    await expect(page.getByRole('heading', { level: 1, name: /Salom,/ })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Kabinet bo‘limlari' }).first();
    await nav.getByRole('link', { name: 'Vazifalar' }).click();
    await expect(page).toHaveURL(/\/portal\/homework$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Uy vazifalari' })).toBeVisible();

    await nav.getByRole('link', { name: 'Davomat' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Davomat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keyingi oy' })).toBeVisible();

    await nav.getByRole('link', { name: 'To‘lovlar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'To‘lovlar' })).toBeVisible();

    await nav.getByRole('link', { name: 'Sozlamalar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sozlamalar' })).toBeVisible();
    await expect(page.getByLabel('Joriy parol', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sozlash' })).toBeVisible();

    // Bildirishnomalar qo'ng'irog'i kabinet sahifasiga olib boradi
    await page.getByRole('button', { name: /Bildirishnomalar/ }).click();
    await page.getByRole('link', { name: /Barchasini/ }).click();
    await expect(page).toHaveURL(/\/portal\/notifications$/);

    // Xodim sahifasi kabinet foydalanuvchisi uchun yopiq — kabinetga qaytariladi
    await page.goto('/students');
    await expect(page).toHaveURL(/\/portal$/);
  });

  test('o‘quvchi vazifani ochadi, matnli javob topshiradi va holat "Topshirdi" bo‘ladi (PHASE 2)', async ({ page, request }) => {
    const credentials = await openStudentPortal(request);
    expect(credentials.groupId, 'o‘quvchi guruhda bo‘lishi kerak').not.toBeNull();

    // Admin API orqali guruhga vazifa beriladi — o'quvchiga topshiriq avtomatik ochiladi
    const title = `E2E vazifa ${Date.now()}`;
    const created = await request.post(`${API}/homework`, {
      headers: credentials.headers,
      data: { title, description: 'Javob yozing', groupId: credentials.groupId, deadline: new Date(Date.now() + 2 * 86_400_000).toISOString() },
    });
    expect(created.status()).toBe(201);

    await loginAsStudent(page, credentials);
    // Bosh sahifada "kutilayotgan vazifa" kartasi shu vazifaga olib boradi
    await expect(page.getByText(new RegExp(title))).toBeVisible();

    await page.goto('/portal/homework');
    await page.getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    const submitButton = page.getByRole('button', { name: 'Topshirish' });
    await expect(submitButton).toBeDisabled();
    await page.getByLabel('Javob matni').fill('Mening E2E javobim');
    await submitButton.click();

    await expect(page.getByText('Mening E2E javobim', { exact: true })).toBeVisible();
    await expect(page.getByText('Topshirdi', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Qayta topshirish' })).toBeVisible();
  });
});
