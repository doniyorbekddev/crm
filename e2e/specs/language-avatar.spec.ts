import { expect, login, test } from '../fixtures';

const language = (page: import('@playwright/test').Page) => page.getByLabel('Til / Язык / Language').first();

/** Interfeys tili: rus, ingliz, kirill va qaytib o'zbekcha — matnlar almashadi, ma'lumotlar o'zgarmaydi, tanlov saqlanadi */
test('til almashtiriladi: rus → ingliz → kirill → o‘zbek; tanlov sahifa yangilanganda saqlanadi', async ({ page }) => {
  await page.goto('/login');
  // Kirish sahifasida ham til tanlanadi
  await language(page).selectOption('ru');
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await language(page).selectOption('uz');
  await expect(page.getByRole('button', { name: 'Kirish', exact: true })).toBeVisible();

  await login(page, 'owner');
  await page.goto('/students');
  await expect(page.getByRole('heading', { level: 1, name: 'O‘quvchilar' })).toBeVisible();
  const firstStudent = (await page.getByRole('row').nth(1).getByRole('link').first().innerText()).trim();

  await language(page).selectOption('ru');
  await expect(page.getByRole('heading', { level: 1, name: 'Ученики' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Посещаемость', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  // O'quvchi ismi (ma'lumot) tarjima qilinmaydi
  await expect(page.getByRole('row').nth(1).getByRole('link').first()).toHaveText(firstStudent);

  // Tanlov saqlanadi; sahifalar orasida o'tganda ham tarjima ishlaydi
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Ученики' })).toBeVisible();
  await page.getByRole('link', { name: 'Посещаемость', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Посещаемость' })).toBeVisible();

  await language(page).selectOption('en');
  await expect(page.getByRole('heading', { level: 1, name: 'Attendance' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Students', exact: true })).toBeVisible();

  await language(page).selectOption('uz-Cyrl');
  await expect(page.getByRole('heading', { level: 1, name: 'Давомат' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ўқувчилар', exact: true })).toBeVisible();

  await language(page).selectOption('uz');
  await expect(page.getByRole('heading', { level: 1, name: 'Davomat' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'O‘quvchilar', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'uz-Latn');
});

test('rus tilida forma ishlaydi: vazifa yaratiladi va saqlangan matn o‘zgarmaydi', async ({ page }) => {
  const title = `E2E til ${Date.now()}`;
  await login(page, 'owner');
  await page.goto('/tasks');
  await language(page).selectOption('ru');
  await expect(page.getByRole('heading', { level: 1, name: 'Задачи' })).toBeVisible();

  await page.getByRole('button', { name: 'Новая задача' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill(title);
  await dialog.getByRole('button', { name: 'Создать' }).click();
  await expect(dialog).toBeHidden();
  // Foydalanuvchi yozgan sarlavha aynan o'zi ko'rinadi
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();

  await language(page).selectOption('uz');
  await expect(page.getByRole('heading', { level: 1, name: 'Vazifalar' })).toBeVisible();
});

test('profil rasmi: yuklanadi, menyuda ko‘rinadi, o‘chiriladi', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Rasm yuklash' })).toBeVisible();

  // Haqiqiy 640×320 PNG brauzerning o'zida chiziladi — ilova uni kvadrat qilib qirqib, 256×256 JPEG ga o'giradi
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2563eb';
    context.fillRect(0, 0, 640, 320);
    context.fillStyle = '#f59e0b';
    context.fillRect(200, 60, 240, 200);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const png = Buffer.from(base64, 'base64');
  await page.getByLabel('Profil rasmi fayli').setInputFiles({ name: 'men.png', mimeType: 'image/png', buffer: png });

  await expect(page.getByRole('button', { name: 'Rasmni almashtirish' })).toBeVisible();
  const image = page.locator('img[src*="/public/avatars/"]').first();
  await expect(image).toBeVisible();
  // Rasm haqiqatan yuklangan (buzilgan emas) va kvadrat JPEG
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(256);
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(256);
  expect(await image.getAttribute('src')).toMatch(/\.jpg$/);

  // Yangilangandan keyin ham joyida (yuqori paneldagi menyu tugmasida ham)
  await page.reload();
  await expect(page.locator('img[src*="/public/avatars/"]').first()).toBeVisible();
  expect(await page.locator('header img[src*="/public/avatars/"]').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'O‘chirish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rasm yuklash' })).toBeVisible();
  await expect(page.locator('img[src*="/public/avatars/"]')).toHaveCount(0);
});
