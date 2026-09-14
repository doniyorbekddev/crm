import { expect, login, test } from '../fixtures';

test('o‘qituvchi telefonda davomatni belgilaydi, saqlaydi va sahifa gorizontal siljimaydi', async ({ page }) => {
  await login(page, 'teacher');
  await page.goto('/attendance');
  await expect(page.getByRole('heading', { level: 1, name: 'Davomat' })).toBeVisible();

  const rows = page.locator('li').filter({ has: page.getByRole('button', { name: 'Keldi', exact: true }) });
  const firstRow = rows.first();
  await expect(firstRow).toBeVisible();
  const studentName = (await firstRow.locator('p').first().innerText()).trim();

  // Hozirgi holatdan farqli holat tanlanadi — test qayta ishga tushsa ham o'zgarish bo'ladi
  const absentPressed = await firstRow.getByRole('button', { name: 'Kelmadi', exact: true }).getAttribute('aria-pressed');
  const target = absentPressed === 'true' ? 'Kechikdi' : 'Kelmadi';
  await firstRow.getByRole('button', { name: target, exact: true }).click();
  await page.getByRole('button', { name: 'Saqlash (1)' }).click();
  await expect(page.getByRole('button', { name: 'Saqlash', exact: true })).toBeDisabled();

  await page.reload();
  const savedRow = rows.filter({ hasText: studentName }).first();
  await expect(savedRow.getByRole('button', { name: target, exact: true })).toHaveAttribute('aria-pressed', 'true');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
