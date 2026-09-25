import { expect, login, test } from '../fixtures';

/** TZ 3.1 GAP-03 — jadval ustunlari profilga saqlanadi (faqat ko'rinish) */
test('xodim o‘quvchilar jadvalida ustunni yashiradi va suradi — yangilanganda saqlanadi, standart holatga qaytadi', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/students');
  const headers = page.getByRole('columnheader');
  const dialog = page.getByRole('dialog', { name: 'Jadval ustunlari' });

  // Oldingi yurishdan qolgan sozlama bo'lsa — standart holatdan boshlaymiz (test qayta ishga tushirishga chidamli)
  await page.getByRole('button', { name: /^Ustunlar/ }).click();
  const reset = dialog.getByRole('button', { name: 'Standart holat' });
  if (await reset.isEnabled()) await reset.click();
  await dialog.getByRole('button', { name: 'Tayyor' }).click();
  await expect(page.getByRole('columnheader', { name: 'Qarzdorlik' })).toBeVisible();

  await page.getByRole('button', { name: 'Ustunlar' }).click();
  await expect(dialog.getByLabel('O‘quvchi', { exact: true })).toBeDisabled();
  // Holat profilga saqlash bilan (optimistik) yangilanadi — bosib, natijani kutamiz
  await dialog.getByLabel('Qarzdorlik', { exact: true }).click();
  await expect(dialog.getByLabel('Qarzdorlik', { exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Holat — yuqoriga' }).click();
  await dialog.getByRole('button', { name: 'Tayyor' }).click();

  await expect(page.getByRole('columnheader', { name: 'Qarzdorlik' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ustunlar (1 yashirin)' })).toBeVisible();
  const order = async () => (await headers.allTextContents()).map((text) => text.trim()).filter(Boolean);
  expect((await order()).indexOf('Holat')).toBeLessThan((await order()).indexOf('Boshlangan'));

  // Profilda saqlangan — sahifa yangilanganda ham shunday
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'Holat' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Qarzdorlik' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ustunlar (1 yashirin)' }).click();
  await page.getByRole('dialog', { name: 'Jadval ustunlari' }).getByRole('button', { name: 'Standart holat' }).click();
  await expect(page.getByRole('columnheader', { name: 'Qarzdorlik' })).toBeVisible();
});
