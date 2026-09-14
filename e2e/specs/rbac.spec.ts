import { expect, login, test } from '../fixtures';

const FORBIDDEN = 'Bu sahifaga ruxsatingiz yo‘q';

test.describe('Rollar va ruxsatlar (spec 74)', () => {
  test('o‘qituvchi moliya va boshqaruv bo‘limlarini ko‘rmaydi, to‘g‘ridan-to‘g‘ri ham ocholmaydi', async ({ page }) => {
    await login(page, 'teacher');
    await expect(page.getByRole('link', { name: 'Davomat', exact: true })).toBeVisible();
    for (const label of ['Moliya paneli', 'Xarajatlar', 'Maoshlar', 'Foydalanuvchilar', 'Audit jurnali']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }

    for (const path of ['/finance', '/expenses', '/audit-logs']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: FORBIDDEN })).toBeVisible();
    }
  });

  test('buxgalter to‘lov va xarajatlarni ko‘radi, rollarni boshqara olmaydi', async ({ page }) => {
    await login(page, 'accountant');
    await expect(page.getByRole('link', { name: 'To‘lovlar', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xarajatlar', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rollar va ruxsatlar', exact: true })).toHaveCount(0);

    await page.goto('/roles');
    await expect(page.getByRole('heading', { name: FORBIDDEN })).toBeVisible();
  });
});
