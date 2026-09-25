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

const NEW_PASSWORD = 'MeningParolim2026';

/**
 * Vaqtinchalik parol bilan kiradi: tizim avval parolni almashtirish sahifasiga olib boradi,
 * yangi parol o'rnatilgach kabinetga o'tadi.
 */
async function loginWithTemporaryPassword(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Login', { exact: true }).fill(login);
  await page.getByLabel('Parol', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  // Parol almashtirilmaguncha kabinet ochilmaydi
  await page.goto('/portal');
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel('Joriy parol', { exact: true }).fill(password);
  await page.getByLabel('Yangi parol', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Yangi parolni takrorlang', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Parolni saqlash' }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

async function loginAsStudent(page: Page, credentials: PortalCredentials): Promise<void> {
  await loginWithTemporaryPassword(page, credentials.email, credentials.password);
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

  test('admin guruhga ommaviy kabinet ochadi, o‘quvchi ID raqami va o‘z paroli bilan kiradi', async ({ page, request }) => {
    const auth = await request.post(`${API}/auth/login`, { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const headers = { Authorization: `Bearer ${(await auth.json()).data.accessToken as string}` };
    const groups = (await (await request.get(`${API}/lookups/student-form`, { headers })).json()).data.groups as Array<{ id: string; name: string; studentCount: number }>;
    const group = groups.find((item) => item.studentCount > 0);
    expect(group, 'seed bazasida o‘quvchili guruh bo‘lishi kerak').toBeTruthy();

    // UI orqali: O'quvchilar → Kabinetlar ochish → guruh → ochish
    await page.goto('/login');
    await page.getByLabel('Login', { exact: true }).fill(USERS.admin.email);
    await page.getByLabel('Parol', { exact: true }).fill(USERS.admin.password);
    await page.getByRole('button', { name: 'Kirish', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/students');
    await page.getByRole('button', { name: 'Kabinetlar ochish' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Kimlarga').selectOption(group!.id);
    await dialog.getByRole('button', { name: 'Kabinetlarni ochish' }).click();

    const firstRow = dialog.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    const login = (await firstRow.locator('td').nth(2).innerText()).trim();
    const password = (await firstRow.locator('td').nth(3).innerText()).trim();
    expect(login).toMatch(/^ST-\d{6}$/);

    // Parollar saqlanmagan — yopishda tasdiq so'raladi
    page.once('dialog', (confirmDialog) => void confirmDialog.accept());
    await dialog.getByRole('button', { name: 'Yopish' }).first().click();

    // Admin chiqadi, o'quvchi ID bilan kiradi
    await page.context().clearCookies();
    await loginWithTemporaryPassword(page, login.toLowerCase(), password);
    await expect(page.getByRole('heading', { level: 1, name: /Salom,/ })).toBeVisible();
  });

  test('ota-ona telefon raqami bilan kiradi, farzandlarini va haftalik hisobotni ko‘radi (PHASE 3)', async ({ page, request }) => {
    const auth = await request.post(`${API}/auth/login`, { data: { email: USERS.admin.email, password: USERS.admin.password } });
    const headers = { Authorization: `Bearer ${(await auth.json()).data.accessToken as string}` };
    const students = (await (await request.get(`${API}/students`, { params: { limit: 5, status: 'ACTIVE' }, headers })).json()).data as Array<{
      id: string;
      firstName: string;
      lastName: string;
    }>;
    expect(students.length).toBeGreaterThan(1);
    const phone = `+99897${String(Date.now()).slice(-7)}`;
    const parent = await request.post(`${API}/parents`, {
      headers,
      data: { firstName: 'Nodira', lastName: 'Karimova', phone, students: [{ studentId: students[0]!.id, relation: 'MOTHER' }, { studentId: students[1]!.id, relation: 'MOTHER' }] },
    });
    expect(parent.status(), await parent.text()).toBe(201);
    const account = await request.post(`${API}/parents/${(await parent.json()).data.id as string}/portal-account`, { headers, data: {} });
    expect(account.status()).toBe(201);
    const { temporaryPassword } = (await account.json()).data as { temporaryPassword: string };

    // Telefonni bo'sh joylar bilan yozsa ham kiradi
    await loginWithTemporaryPassword(page, `${phone.slice(0, 4)} ${phone.slice(4, 6)} ${phone.slice(6)}`, temporaryPassword);
    const children = page.getByRole('region', { name: 'Farzandlarim' });
    await expect(children).toBeVisible();
    await expect(children.getByRole('heading', { name: `${students[0]!.firstName} ${students[0]!.lastName}` })).toBeVisible();
    await expect(children.getByRole('heading', { name: `${students[1]!.firstName} ${students[1]!.lastName}` })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Kabinet bo‘limlari' }).first();
    await nav.getByRole('link', { name: 'Hisobot' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Haftalik hisobot' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Davomat' })).toBeVisible();
    await page.getByRole('button', { name: 'Oldingi' }).click();
    await expect(page.getByRole('button', { name: 'Joriy hafta' })).toBeEnabled();
  });
});
