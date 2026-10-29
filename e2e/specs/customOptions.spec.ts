import { expect, login, test, uniqueLetters } from '../fixtures';

test('ro‘yxatda yo‘q lavozim va bo‘limni o‘zi yozadi — saqlanadi, ro‘yxatda chiqadi, keyingi safar taklif qilinadi', async ({ page }) => {
  const lastName = `Sinov${uniqueLetters()}`;
  const title = `Metodist ${uniqueLetters()}`;
  const department = `Metodika ${uniqueLetters()}`;
  await login(page, 'owner');
  await page.goto('/employees');

  await page.getByRole('button', { name: 'Xodim qo‘shish' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Xodim qo‘shish' });
  await dialog.getByLabel('Ism').fill('Nodira');
  await dialog.getByLabel('Familiya').fill(lastName);

  const position = dialog.getByLabel('Lavozim');
  await position.fill(title);
  await page.getByRole('listbox').getByRole('option', { name: /o‘zim qo‘shaman/ }).click();
  await expect(position).toHaveValue(title);

  // Erkin matn: Enter shart emas — maydondan chiqilganda qabul qilinadi
  const departmentInput = dialog.getByLabel('Bo‘lim');
  await departmentInput.fill(department);
  await departmentInput.press('Tab');
  await expect(departmentInput).toHaveValue(department);

  await dialog.getByLabel('Oylik maosh (so‘m)').fill('3000000');
  await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole('row').filter({ hasText: lastName });
  await expect(row).toContainText(title);
  await expect(row).toContainText(department);

  // Keyingi xodimda markaz yozgan lavozim tayyor band bo'lib chiqadi
  await page.getByRole('button', { name: 'Xodim qo‘shish' }).first().click();
  const next = page.getByRole('dialog', { name: 'Xodim qo‘shish' });
  await next.getByLabel('Lavozim').fill(title.slice(0, 12));
  await expect(page.getByRole('listbox').getByRole('option', { name: new RegExp(title) })).toBeVisible();
});
