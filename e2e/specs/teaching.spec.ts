import { expect, login, test } from '../fixtures';

/** PHASE 8 — o'qituvchi boshqaruv markazi (TZ §28): kartalar → guruh jadvali */
test('o‘qituvchi markazni ochadi, guruh kartasidan jadvalga o‘tadi; buxgalter kira olmaydi', async ({ page }) => {
  await login(page, 'teacher');
  await page.getByRole('link', { name: 'O‘qituvchi markazi', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'O‘qituvchi markazi' })).toBeVisible();
  await expect(page.getByText('Xavf ostida', { exact: true })).toBeVisible();

  // Seedda o'qituvchining faol guruhi bor — kartadan guruh jadvaliga
  const groupLink = page.locator('a[href^="/teaching/groups/"]').first();
  const groupName = (await groupLink.textContent())?.trim() ?? '';
  await groupLink.click();
  await expect(page.getByRole('heading', { level: 1, name: groupName })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Oxirgi faollik' })).toBeVisible();
  await page.getByRole('button', { name: 'Mavzular bo‘yicha' }).click();
  await expect(page.getByRole('dialog', { name: 'Mavzular bo‘yicha o‘zlashtirish' })).toBeVisible();
});

test('buxgalter o‘qituvchi markazini ko‘rmaydi', async ({ page }) => {
  await login(page, 'accountant');
  await expect(page.getByRole('link', { name: 'O‘qituvchi markazi', exact: true })).toHaveCount(0);
  await page.goto('/teaching');
  await expect(page.getByRole('heading', { name: 'Bu sahifaga ruxsatingiz yo‘q' })).toBeVisible();
});

/** PHASE 9 — AI akademik markaz (kalitsiz — qoidalar rejimi) */
test('o‘qituvchi guruh uchun AI tahlil oladi va yordamchidan akademik savol so‘raydi', async ({ page }) => {
  await login(page, 'teacher');
  await page.getByRole('link', { name: 'O‘qituvchi markazi', exact: true }).click();
  await page.locator('a[href^="/teaching/groups/"]').first().click();
  await page.getByRole('button', { name: 'AI tahlil' }).click();
  const dialog = page.getByRole('dialog', { name: 'AI guruh tahlili' });
  await dialog.getByRole('button', { name: 'Tahlil qilish' }).click();
  await expect(dialog.getByText('Qoidalar rejimi')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Fakt' })).toContainText('O‘quvchilar:');
  await dialog.getByRole('button', { name: 'Yopish' }).last().click();

  await page.getByRole('link', { name: 'AI yordamchi', exact: true }).click();
  await page.getByLabel('Savol').fill('Qaysi guruhlar xavfda?');
  await page.getByRole('button', { name: 'So‘rash' }).click();
  await expect(page.getByText('Manba: Xavf ostidagi guruhlar')).toBeVisible();
});

/** PHASE 12 — akademik analitika (rahbar) */
test('rahbar akademik analitikada kesimlarni almashtiradi va jadvalni ko‘radi', async ({ page }) => {
  await login(page, 'owner');
  await page.getByRole('link', { name: 'Akademik analitika', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Akademik analitika' })).toBeVisible();
  await page.getByRole('tab', { name: 'Guruhlar' }).click();
  await expect(page.getByRole('tab', { name: 'Guruhlar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('columnheader', { name: 'Retention' })).toBeVisible();
});
