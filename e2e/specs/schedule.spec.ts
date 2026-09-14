import type { APIRequestContext } from '@playwright/test';
import { API_PORT } from '../env';
import { USERS, expect, login, test } from '../fixtures';

const API = `http://localhost:${API_PORT}/api`;

interface Debtor {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  total: number;
  paid: number;
  remaining: number;
}

/** O‘quv markaz (Toshkent) kuni bo‘yicha bugundan siljish */
function day(offset: number): string {
  return new Date(Date.now() + 5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

async function api(request: APIRequestContext) {
  const login = await request.post(`${API}/auth/login`, { data: { email: USERS.accountant.email, password: USERS.accountant.password } });
  expect(login.ok()).toBe(true);
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken as string}` };
  return {
    async debtors(): Promise<Debtor[]> {
      const response = await request.get(`${API}/debts`, { params: { limit: 100 }, headers });
      return (await response.json()).data as Debtor[];
    },
    async replaceSchedule(studentId: string, installments: Array<{ dueDate: string; amount: number }>) {
      const response = await request.put(`${API}/students/${studentId}/payment-schedule`, { data: { installments }, headers });
      expect(response.ok(), await response.text()).toBe(true);
    },
  };
}

test('buxgalter muddati o‘tgan to‘lovni qarzdorlikda topadi, profilda jadvalni ko‘radi va qayta tuzadi', async ({ page, request }) => {
  const client = await api(request);
  const debtor = (await client.debtors()).find((item) => item.remaining >= 100_000 && item.total > 2000);
  expect(debtor, 'seed bazasida qarzdor o‘quvchi bo‘lishi kerak').toBeDefined();
  if (!debtor) return;

  // Deyarli butun shartnoma 15 kun oldin to'lanishi kerak edi — to'lanmagan qismi kechikkan
  await client.replaceSchedule(debtor.studentId, [
    { dueDate: day(-15), amount: debtor.total - 1000 },
    { dueDate: day(20), amount: 1000 },
  ]);

  await login(page, 'accountant');
  await page.goto('/debts');
  await page.getByRole('tab', { name: /^Muddati o‘tgan/ }).click();
  await page.getByPlaceholder('Ism, telefon yoki ST-raqam').fill(debtor.code);
  const row = page.getByRole('row').filter({ hasText: `${debtor.firstName} ${debtor.lastName}` });
  await expect(row).toContainText('15 kun kechikdi');

  await row.getByRole('link', { name: `${debtor.firstName} ${debtor.lastName}` }).click();
  await expect(page).toHaveURL(new RegExp(`/students/${debtor.studentId}$`));
  await page.getByRole('tab', { name: 'To‘lov jadvali' }).click();
  const overdueRow = page.getByRole('row').filter({ hasText: 'Muddati o‘tgan' });
  await expect(overdueRow).toContainText('15 kun kechikdi');

  await page.getByRole('button', { name: 'Qayta tuzish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Jadvalni qayta tuzish' });
  await dialog.getByLabel('Qismlar soni').fill('4');
  await dialog.getByLabel('Birinchi to‘lov sanasi').fill(day(0));
  await dialog.getByRole('button', { name: 'Tuzish' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.getByText('15 kun kechikdi')).toHaveCount(0);
});
