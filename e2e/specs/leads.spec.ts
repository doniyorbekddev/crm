import { expect, login, test, uniqueLetters, uniquePhone } from '../fixtures';

test('manager yangi lead qo‘shadi, profili ochiladi, statusini o‘zgartiradi va lead ro‘yxatda ko‘rinadi', async ({ page }) => {
  const lastName = `Sinov${uniqueLetters()}`;
  await login(page, 'manager');
  await page.goto('/leads');

  await page.getByRole('button', { name: 'Lead qo‘shish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yangi lead' });
  await dialog.getByLabel('Ism').fill('Sardor');
  await dialog.getByLabel('Familiya').fill(lastName);
  await dialog.getByLabel('Lidning telefon raqami').fill(uniquePhone());
  // Ro'yxatda yo'q manba — shu yerning o'zida yoziladi va lead bilan birga saqlanadi
  const sourceName = `Ko‘rgazma ${uniqueLetters()}`;
  const source = dialog.getByLabel('Manba');
  await source.fill(sourceName);
  await page.getByRole('listbox').getByRole('option', { name: /yangi manba/ }).click();
  await expect(source).toHaveValue(sourceName);
  await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect(dialog).toBeHidden();

  // Saqlangach yangi leadning profili ochiladi
  await expect(page).toHaveURL(/\/leads\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: `Sardor ${lastName}` })).toBeVisible();
  await expect(page.getByText(sourceName, { exact: true })).toBeVisible();

  // Sotuv manageri leadni bir qadamda yangilaydi (spec 58: tez yangilash)
  const status = page.getByRole('combobox', { name: 'Statusni o‘zgartirish' });
  await status.selectOption({ label: 'Bog‘lanildi' });
  await expect(status.locator('option:checked')).toHaveText('Bog‘lanildi');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Statusni o‘zgartirish' }).locator('option:checked')).toHaveText('Bog‘lanildi');

  await page.goto('/leads');
  await expect(page.getByRole('row').filter({ hasText: lastName })).toBeVisible();
});
