import { expect, login, logout, test } from '../fixtures';

/** TZ 3.1 GAP-01 — "Markaz ma'lumotlari": rahbar o'zgartiradi, nom butun ilovada yangilanadi; boshqa rol kira olmaydi (seed'dagi admin — SUPER_ADMIN, unga ruxsat bor) */
test('rahbar markaz nomi va ish vaqtini saqlaydi — menyu va sarlavha yangilanadi; buxgalter kira olmaydi', async ({ page }) => {
  await login(page, 'owner');
  await page.getByRole('link', { name: 'Markaz ma’lumotlari', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Markaz ma’lumotlari' })).toBeVisible();

  const name = `IT-Academy E2E ${Date.now().toString().slice(-5)}`;
  await page.getByLabel(/Markaz nomi/).fill(name);
  await page.getByLabel('Telefon').fill('+998 90 111 22 33');
  await page.getByLabel('Shanba — yopilish', { exact: true }).fill('14:00');
  await page.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByText('Markaz ma’lumotlari saqlandi')).toBeVisible();
  await expect(page.getByText(/Oxirgi o‘zgarish:/)).toBeVisible();

  // Brend butun ilovada: menyudagi nom va brauzer sarlavhasi
  await expect(page.getByRole('complementary').getByText(name)).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(`${name}$`));

  // Qayta ochilganda saqlangan qiymatlar
  await page.reload();
  await expect(page.getByLabel(/Markaz nomi/)).toHaveValue(name);
  await expect(page.getByLabel('Telefon')).toHaveValue('+998901112233');
  await expect(page.getByLabel('Shanba — yopilish', { exact: true })).toHaveValue('14:00');

  await logout(page, 'owner');
  await login(page, 'accountant');
  await expect(page.getByRole('link', { name: 'Markaz ma’lumotlari', exact: true })).toHaveCount(0);
  await page.goto('/settings/academy');
  await expect(page.getByRole('heading', { name: 'Bu sahifaga ruxsatingiz yo‘q' })).toBeVisible();
});
