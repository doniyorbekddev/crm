import type { APIRequestContext } from '@playwright/test';
import { API_PORT } from '../env';
import { USERS, expect, test } from '../fixtures';

const API = `http://localhost:${API_PORT}/api`;

interface PortalCredentials {
  email: string;
  password: string;
  studentName: string;
}

/**
 * Seed bazasida kabinet hisobi yo‘q — admin API orqali birinchi faol o‘quvchiga ochiladi.
 * Parol faqat shu javobda keladi (backend uni qayta ko‘rsatmaydi).
 */
async function openStudentPortal(request: APIRequestContext): Promise<PortalCredentials> {
  const auth = await request.post(`${API}/auth/login`, { data: { email: USERS.admin.email, password: USERS.admin.password } });
  const headers = { Authorization: `Bearer ${(await auth.json()).data.accessToken as string}` };
  const students = (await (await request.get(`${API}/students`, { params: { limit: 1, status: 'ACTIVE' }, headers })).json()).data as Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
  const student = students[0];
  expect(student, 'seed bazasida faol o‘quvchi bo‘lishi kerak').toBeTruthy();

  const email = `portal-${Date.now()}@e2e.uz`;
  const created = await request.post(`${API}/students/${student!.id}/portal-account`, { data: { email }, headers });
  expect(created.status()).toBe(201);
  const password = (await created.json()).data.temporaryPassword as string;
  return { email, password, studentName: `${student!.firstName} ${student!.lastName}` };
}

test.describe('Kabinet (o‘quvchi) — PHASE 1 karkas', () => {
  test('o‘quvchi kiradi, bo‘limlar orasida yuradi, sozlamalarda parol formasi bor, xodim sahifasiga kira olmaydi', async ({ page, request }) => {
    const { email, password } = await openStudentPortal(request);

    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Parol', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Kirish', exact: true }).click();
    await expect(page).toHaveURL(/\/portal$/);
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
});
