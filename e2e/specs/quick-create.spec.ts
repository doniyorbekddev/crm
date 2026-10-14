import { expect, login, test } from '../fixtures';

/** Qobiq: topbar "Yaratish" menyusi va global qidiruvdagi "Amallar" mavjud yaratish oynalarini ochadi */
test('topbar "Yaratish" → Yangi lead oynasi ochiladi, URL tozalanadi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Yaratish' }).click();
  await page.getByRole('menuitem', { name: 'Yangi lead' }).click();

  await expect(page).toHaveURL(/\/leads$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  // Oyna yopilgach qayta ochilmaydi (niyat URL'dan olib tashlangan)
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('global qidiruv: "Amallar" bo‘limi so‘z bo‘yicha filtrlanadi va Enter bilan ochiladi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('dialog', { name: 'Global qidiruv' });
  await expect(search.getByText('Amallar')).toBeVisible();
  await search.getByLabel('Qidiruv').fill('vazifa');
  await expect(search.getByRole('button', { name: 'Yangi vazifa' })).toBeVisible();
  await expect(search.getByRole('button', { name: 'Yangi lead' })).toHaveCount(0);
  await search.getByLabel('Qidiruv').press('Enter');

  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('"?" klaviatura yorliqlari oynasini ochadi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.locator('body').press('?');
  await expect(page.getByRole('dialog', { name: 'Klaviatura yorliqlari' })).toBeVisible();
});
