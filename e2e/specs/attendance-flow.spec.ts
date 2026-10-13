import { openFirstLessonGroup } from '../attendance';
import { expect, login, test } from '../fixtures';

/**
 * O'qituvchi davomati 2.0: taxtada faqat o'z guruhlari kartalari → karta → faqat shu guruh o'quvchilari →
 * tugmalar bilan belgilash → saqlash → taxtada holat yangilanadi.
 */
test('o‘qituvchi: guruh kartasi → shu guruh o‘quvchilari → belgilash va saqlash → taxtada holat', async ({ page }) => {
  await login(page, 'teacher');
  await page.goto('/attendance');
  const board = page.getByRole('region', { name: 'Kunlik darslar' });
  await expect(board).toBeVisible();

  // Guruh tanlash uchun ochiladigan ro'yxat yo'q; boshqa o'qituvchining guruhlari (EN-*) hech qayerda ko'rinmaydi
  await expect(board.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText(/EN-0\d/)).toHaveCount(0);

  const groupName = await openFirstLessonGroup(page);
  expect(groupName).toMatch(/^(FE|BE)-/);
  const lessonUrl = page.url();

  // Faqat o'quvchi qatorlari va har birida to'rtta holat tugmasi (select emas)
  const rows = page.getByRole('group', { name: /davomati$/ });
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(2);
  await expect(rows.first().getByRole('button')).toHaveText(['Keldi', 'Kechikdi', 'Sababli', 'Kelmadi']);
  await expect(page.getByRole('list').first().getByRole('combobox')).toHaveCount(0);

  // Hammasini belgilab, bittasini "Kelmadi" ga o'zgartiramiz
  await page.getByRole('button', { name: 'Hammasi keldi' }).click();
  await rows.first().getByRole('button', { name: 'Kelmadi', exact: true }).click();
  await expect(page.getByText(`${total} / ${total}`)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Davomat to‘ldirilishi' })).toHaveAttribute('aria-valuenow', String(total));

  await page.getByRole('button', { name: /^Saqlash \(\d+\)$/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saqlandi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saqlash', exact: true })).toBeDisabled();

  // Qayta ochilganda saqlangan holatlar yuklanadi
  await page.reload();
  await expect(rows.first().getByRole('button', { name: 'Kelmadi', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.nth(1).getByRole('button', { name: 'Keldi', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Taxtaga qaytish: shu kunning kartasi "Belgilangan"
  const date = new URL(lessonUrl).searchParams.get('date')!;
  await page.getByRole('link', { name: 'Davomat', exact: true }).first().click();
  await expect(page).toHaveURL(/\/attendance$/);
  await board.getByLabel('Sana').fill(date);
  const card = board.getByRole('link', { name: `${groupName} — davomatni ochish` });
  await expect(card.getByText('Belgilangan', { exact: true })).toBeVisible();
  await expect(card.getByText(`${total} / ${total} belgilangan`)).toBeVisible();
});

test('saqlanmagan belgilar bilan chiqishda ogohlantiriladi; "Qolish" belgilarni saqlab qoladi', async ({ page }) => {
  await login(page, 'teacher');
  await openFirstLessonGroup(page);
  const rows = page.getByRole('group', { name: /davomati$/ });
  await expect(rows.first()).toBeVisible();

  // Hozirgi holatdan farqli holat — o'zgarish albatta paydo bo'lsin
  const excused = rows.first().getByRole('button', { name: 'Sababli', exact: true });
  const target = (await excused.getAttribute('aria-pressed')) === 'true' ? 'Kechikdi' : 'Sababli';
  await rows.first().getByRole('button', { name: target, exact: true }).click();
  await expect(page.getByText('1 ta saqlanmagan o‘zgarish')).toBeVisible();

  await page.getByRole('link', { name: 'Davomat', exact: true }).first().click();
  const dialog = page.getByRole('alertdialog', { name: 'Saqlanmagan o‘zgarishlar bor' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Qolish' }).click();
  await expect(page).toHaveURL(/\/attendance\/groups\//);
  await expect(rows.first().getByRole('button', { name: target, exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: 'Davomat', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Saqlamasdan chiqish' }).click();
  await expect(page).toHaveURL(/\/attendance$/);
});
