import { expect, login, test } from '../fixtures';

test('buxgalter to‘lov xulosasini menyudan ochadi: jami kartalar, yo‘nalishlar va toifa ko‘rinishi', async ({ page }) => {
  await login(page, 'accountant');
  await page.getByRole('link', { name: 'To‘lov xulosasi' }).first().click();
  await expect(page.getByRole('heading', { name: 'To‘lov xulosasi' })).toBeVisible();
  await expect(page.getByText('Jami yig‘ilishi kerak')).toBeVisible();
  const table = page.getByRole('table');
  await expect(table.getByRole('row', { name: /Jami/ })).toBeVisible();
  await page.getByRole('button', { name: 'Toifa bo‘yicha' }).click();
  await expect(page.getByRole('button', { name: 'Toifa bo‘yicha' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('O‘quvchilar').selectOption('STUDYING');
  await expect(page.getByText(/O‘qiyotganlar \(faol va muzlatilgan\)/)).toBeVisible();
});
