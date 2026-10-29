import { expect, login, test, uniqueLetters } from '../fixtures';

test.describe('Moliya', () => {
  test('buxgalter xarajat qo‘shadi va u ro‘yxatda summasi bilan ko‘rinadi', async ({ page }) => {
    const description = `E2E xarajat ${uniqueLetters()}`;
    await login(page, 'accountant');
    await page.goto('/expenses');

    await page.getByRole('button', { name: 'Xarajat qo‘shish' }).click();
    const dialog = page.getByRole('dialog', { name: 'Xarajat qo‘shish' });
    // Ro'yxatda yo'q kategoriya — formadan chiqmasdan qo'shiladi va darhol tanlanadi
    const categoryName = `E2E kategoriya ${uniqueLetters()}`;
    const category = dialog.getByRole('combobox', { name: 'Kategoriya' });
    await category.fill(categoryName);
    await page.getByRole('listbox').getByRole('option', { name: new RegExp(`${categoryName}.*kategoriyasini qo‘shish`) }).click();
    await expect(category).toHaveValue(categoryName);
    await dialog.getByLabel('Summa (so‘m)').fill('75000');
    await dialog.getByLabel('Izoh').fill(description);
    await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
    await expect(dialog).toBeHidden();

    const row = page.locator('tr, li').filter({ hasText: description }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/75[\s,.]000 so‘m/);
    await expect(row).toContainText(categoryName);
  });

  test('rahbar foyda-zarar hisobotini, direktor paneli va analitikani ochadi', async ({ page }) => {
    await login(page, 'owner');
    await page.goto('/finance');
    await page.getByRole('tab', { name: 'Foyda va zarar' }).click();
    await expect(page.getByText('Sof foyda').first()).toBeVisible();

    await page.goto('/executive');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
