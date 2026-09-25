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
