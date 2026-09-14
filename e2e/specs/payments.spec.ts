import type { APIRequestContext } from '@playwright/test';
import { API_PORT } from '../env';
import { USERS, expect, login, test } from '../fixtures';

const API = `http://localhost:${API_PORT}/api`;

interface Debtor {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  remaining: number;
}

async function apiToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/auth/login`, {
    data: { email: USERS.accountant.email, password: USERS.accountant.password },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data.accessToken as string;
}

async function debtors(request: APIRequestContext, token: string): Promise<Debtor[]> {
  const response = await request.get(`${API}/debts`, {
    params: { limit: 100 },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as Debtor[];
}

test('buxgalter qarzdor o‘quvchidan to‘lov qabul qiladi, to‘lov ro‘yxatda ko‘rinadi va qarz kamayadi', async ({ page, request }) => {
  const token = await apiToken(request);
  const debtor = (await debtors(request, token)).find((item) => item.remaining >= 100_000);
  expect(debtor, 'seed bazasida qarzdor o‘quvchi bo‘lishi kerak').toBeDefined();
  if (!debtor) return;

  await login(page, 'accountant');
  await page.goto('/payments');
  await page.getByRole('button', { name: 'To‘lov qabul qilish' }).click();
  const dialog = page.getByRole('dialog', { name: 'To‘lov qabul qilish' });

  await dialog.getByLabel('O‘quvchini qidiring').fill(debtor.code);
  await dialog.getByRole('button').filter({ hasText: debtor.code }).first().click();
  await dialog.getByLabel('Summa (so‘m)').fill('100000');
  await dialog.getByRole('button', { name: 'To‘lovni saqlash' }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole('row').filter({ hasText: debtor.code }).first();
  await expect(row).toContainText(`${debtor.firstName} ${debtor.lastName}`);
  await expect(row).toContainText(/100[\s,.]000 so‘m/);

  const after = (await debtors(request, token)).find((item) => item.studentId === debtor.studentId);
  expect(after?.remaining ?? 0).toBe(debtor.remaining - 100_000);
});
