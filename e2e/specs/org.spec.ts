import { expect, login, test, USERS } from '../fixtures';

/**
 * ORG tizimi: murojaat qabulxonadan kiritiladi → CEO o'qituvchiga yo'naltiradi → o'qituvchi hal etadi →
 * kirituvchi yopadi; bilimlar bazasida majburiy hujjat — o'qituvchi tanishganini tasdiqlaydi; katalog va tuzilma.
 */
test('murojaat: kiritish → yo‘naltirish → hal etish → yopish', async ({ browser, page }) => {
  const title = `E2E murojaat ${Date.now()}`;
  await login(page, 'accountant');
  await page.goto('/complaints');
  await page.getByRole('button', { name: 'Murojaat kiritish' }).click();
  const form = page.getByRole('dialog', { name: 'Murojaat kiritish' });
  await form.getByLabel('Kimdan').selectOption('PARENT');
  await form.getByLabel('Turkum').selectOption('SCHEDULE');
  await form.getByLabel(/Mavzu/).fill(title);
  await form.getByLabel(/Murojaat matni/).fill('Ota-ona dars vaqtini kechroqqa surishni so‘radi');
  await form.getByLabel('Murojaatchi ismi').fill('Karimova Dilnoza');
  await form.getByRole('button', { name: 'Yuborish' }).click();
  await expect(page.getByRole('dialog', { name: new RegExp(title) })).toBeVisible();

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await login(owner, 'owner');
  await owner.goto('/complaints');
  await owner.getByRole('button', { name: new RegExp(title) }).click();
  const drawer = owner.getByRole('dialog', { name: new RegExp(title) });
  const teacherOption = drawer.getByLabel('Mas’ulga yo‘naltirish').locator('option', { hasText: USERS.teacher.name });
  await drawer.getByLabel('Mas’ulga yo‘naltirish').selectOption((await teacherOption.getAttribute('value'))!);
  await drawer.getByRole('button', { name: 'Yo‘naltirish' }).click();
  await expect(drawer.getByText('Ko‘rib chiqilmoqda').first()).toBeVisible();
  await ownerContext.close();

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await login(teacher, 'teacher');
  await teacher.goto('/complaints');
  await teacher.getByRole('button', { name: new RegExp(title) }).click();
  const work = teacher.getByRole('dialog', { name: new RegExp(title) });
  await work.getByRole('button', { name: 'Hal etildi' }).click();
  await work.getByLabel('Qanday hal etildi?').fill('Kechki guruhga o‘tkazildi');
  await work.getByRole('button', { name: 'Saqlash' }).click();
  await expect(work.getByText('Kechki guruhga o‘tkazildi').first()).toBeVisible();
  await teacherContext.close();

  await page.reload();
  const mine = page.getByRole('dialog', { name: new RegExp(title) });
  await mine.getByRole('button', { name: 'Murojaatni yopish' }).click();
  await expect(mine.getByText('Yopildi').first()).toBeVisible();
});

test('bilimlar bazasi: majburiy hujjat e’lon qilinadi, o‘qituvchi tanishganini tasdiqlaydi', async ({ browser, page }) => {
  const title = `E2E qoida ${Date.now()}`;
  await login(page, 'owner');
  await page.goto('/knowledge');
  await page.getByRole('button', { name: 'Hujjat yozish' }).click();
  const editor = page.getByRole('dialog', { name: 'Yangi hujjat' });
  await editor.getByLabel(/Sarlavha/).fill(title);
  await editor.getByLabel('Turkum').selectOption('POLICY');
  await editor.getByLabel(/Matn/).fill('Ish kuni 09:00 da boshlanadi, QR orqali belgilanadi.');
  await editor.getByLabel(/Tanishish majburiy/).check();
  await editor.getByRole('button', { name: 'Saqlash' }).click();
  const drawer = page.getByRole('dialog', { name: title });
  await drawer.getByRole('button', { name: 'E’lon qilish' }).click();
  await expect(drawer.getByText('E’lon qilingan').first()).toBeVisible();

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await login(teacher, 'teacher');
  await teacher.goto('/knowledge');
  await expect(teacher.getByText(/hujjat bilan tanishib chiqishingiz kerak/)).toBeVisible();
  await teacher.getByRole('button', { name: new RegExp(title) }).click();
  await teacher.getByRole('button', { name: 'Tanishib chiqdim' }).click();
  await expect(teacher.getByText('Siz bu versiya bilan tanishgansiz')).toBeVisible();
  await teacherContext.close();
});

test('lavozimlar katalogi va tashkiliy tuzilma: hujjatdagi mas’uliyatlar, rahbar va bo‘limlar', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/org-catalog');
  await expect(page.getByRole('heading', { level: 1, name: 'Lavozimlar va bo‘limlar' })).toBeVisible();
  await expect(page.getByText('Yangi leadlar bilan ishlash')).toBeVisible();
  await expect(page.getByText('Sotuv va qabulxona').first()).toBeVisible();
  await page.goto('/org-structure');
  await expect(page.getByText(USERS.owner.name).first()).toBeVisible();
  await expect(page.getByText('Kelajakdagi lavozimlar')).toBeVisible();
});
