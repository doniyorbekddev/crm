import { expect, login, logout, test, uniqueLetters } from '../fixtures';

test('buxgalter reklama xarajatini kanalga bog‘laydi, analitikada ROI ustunlari ko‘rinadi', async ({ page }) => {
  const description = `E2E reklama ${uniqueLetters()}`;
  await login(page, 'accountant');
  await page.goto('/expenses');

  await page.getByRole('button', { name: 'Xarajat qo‘shish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Xarajat qo‘shish' });
  await dialog.getByLabel('Kategoriya').selectOption({ label: 'Reklama' });

  // Manba maydoni faqat reklama kategoriyasida chiqadi
  const source = dialog.getByLabel('Reklama manbasi');
  await expect(source).toBeVisible();
  const sourceName = (await source.locator('option').nth(1).innerText()).trim();
  await source.selectOption({ index: 1 });
  await dialog.getByLabel('Summa (so‘m)').fill('150000');
  await dialog.getByLabel('Izoh').fill(description);
  await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect(dialog).toBeHidden();

  const row = page.locator('tr, li').filter({ hasText: description }).first();
  await expect(row).toContainText(sourceName);

  // Kirgan foydalanuvchi login sahifasidan qaytariladi — avval chiqamiz
  await logout(page, 'accountant');
  await login(page, 'owner');
  await page.goto('/analytics');
  const sourcesTable = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Manba' }) }).first();
  await expect(sourcesTable.getByRole('columnheader', { name: 'Xarajat' })).toBeVisible();
  await expect(sourcesTable.getByRole('columnheader', { name: 'ROI' })).toBeVisible();
});
