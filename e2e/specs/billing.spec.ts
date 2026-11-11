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
  const response = await request.post(`${API}/auth/login`, { data: { email: USERS.accountant.email, password: USERS.accountant.password } });
  expect(response.ok()).toBe(true);
  const headers = { Authorization: `Bearer ${(await response.json()).data.accessToken as string}` };
  return {
    async debtors(): Promise<Debtor[]> {
      const list = await request.get(`${API}/debts`, { params: { limit: 100 }, headers });
      return (await list.json()).data as Debtor[];
    },
    async replaceSchedule(studentId: string, installments: Array<{ dueDate: string; amount: number }>) {
      const saved = await request.put(`${API}/students/${studentId}/payment-schedule`, { data: { installments }, headers });
      expect(saved.ok(), await saved.text()).toBe(true);
    },
    async history(studentId: string) {
      const result = await request.get(`${API}/students/${studentId}/billing-history`, { headers });
      expect(result.ok()).toBe(true);
      return (await result.json()).data as { months: Array<{ period: string; remaining: number; status: string }> };
    },
  };
}

test('buxgalter muddati kelgan oy qarzini topadi, to‘lovni shu oyga biriktiradi va oy yopiladi', async ({ page, request }) => {
  const client = await api(request);
  // To'lov spetsifikatsiyasi ro'yxat boshidagini, jadval spetsifikatsiyasi oxiridagini ishlatadi — oxiridan ikkinchisi
  const candidates = (await client.debtors()).filter((item) => item.paid === 0 && item.remaining >= 100_000 && item.total > 2000);
  const debtor = candidates[candidates.length - 2];
  expect(debtor, 'seed bazasida to‘lov qilmagan kamida ikki qarzdor bo‘lishi kerak').toBeDefined();
  if (!debtor) return;

  // Birinchi qism 20 kun oldin to'lanishi kerak edi — muddati kelgan qarz
  const first = Math.floor(debtor.total / 2);
  await client.replaceSchedule(debtor.studentId, [
    { dueDate: day(-20), amount: first },
    { dueDate: day(40), amount: debtor.total - first },
  ]);
  const period = day(-20).slice(0, 7);

  await login(page, 'accountant');
  await page.goto('/debts');
  await expect(page.getByRole('tab', { name: 'Muddati kelgan qarzlar' })).toHaveAttribute('aria-selected', 'true');
  await page.getByPlaceholder('Ism, telefon yoki ST-raqam').fill(debtor.code);
  const row = page.getByRole('row').filter({ hasText: `${debtor.firstName} ${debtor.lastName}` });
  await expect(row).toContainText('20 kun kechikdi');

  await row.getByRole('button', { name: 'To‘lov' }).click();
  const dialog = page.getByRole('dialog', { name: 'To‘lov qabul qilish' });
  await dialog.getByLabel('Summa (so‘m)').fill(String(first));
  await expect(dialog.getByRole('group', { name: 'Qaysi oy uchun' })).toContainText('yopiladi');
  // Oy belgilansa summa shu oy qoldig'iga tenglanadi; muddati o'tgan oy "qarz · N kun kechikdi"
  await expect(dialog.getByRole('group', { name: 'Qaysi oy uchun' })).toContainText('qarz · 20 kun kechikdi');
  await dialog.getByLabel('Summa (so‘m)').fill('');
  await dialog.getByRole('checkbox', { name: /uchun to‘lash$/ }).first().check();
  await expect(dialog.getByLabel('Summa (so‘m)')).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'To‘lovni saqlash' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);

  const history = await client.history(debtor.studentId);
  expect(history.months.find((month) => month.period === period)).toMatchObject({ remaining: 0, status: 'PAID' });

  // Oy bo'yicha ko'rinish: shu oy "Yopilgan" holatida
  await page.goto(`/debts?view=monthly&period=${period}`);
  await page.getByRole('tab', { name: /^Yopilgan/ }).click();
  await page.getByPlaceholder('Ism, telefon yoki ST-raqam').fill(debtor.code);
  await expect(page.getByRole('row').filter({ hasText: `${debtor.firstName} ${debtor.lastName}` })).toContainText('Yopilgan');
});
