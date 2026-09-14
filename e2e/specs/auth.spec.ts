import { USERS, expect, fillLogin, login, test } from '../fixtures';

test.describe('Kirish va sessiya', () => {
  test('noto‘g‘ri parolda xato ko‘rsatiladi va login sahifasida qoladi', async ({ page }) => {
    await page.goto('/login');
    await fillLogin(page, 'admin', 'NotThePassword1');
    await expect(page.getByRole('alert').filter({ hasText: 'Email yoki parol noto‘g‘ri' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('himoyalangan sahifa loginga yo‘naltiradi, kirgach qaytaradi, yangilanganda sessiya saqlanadi', async ({ page }) => {
    await page.goto('/payments');
    await expect(page).toHaveURL(/\/login\?redirect=/);

    await fillLogin(page, 'accountant');
    await expect(page).toHaveURL(/\/payments$/);
    const heading = page.getByRole('heading', { level: 1, name: 'To‘lovlar' });
    await expect(heading).toBeVisible();

    // Access token faqat xotirada — sessiya httpOnly refresh cookie orqali tiklanadi
    await page.reload();
    await expect(heading).toBeVisible();
  });

  test('chiqishdan keyin himoyalangan sahifalar ochilmaydi', async ({ page }) => {
    await login(page, 'admin');
    await page.getByRole('button', { name: new RegExp(USERS.admin.name) }).click();
    await page.getByText('Chiqish', { exact: true }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
