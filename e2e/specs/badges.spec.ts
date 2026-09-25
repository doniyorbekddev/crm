import { expect, login, test } from '../fixtures';

/** TZ 3.1 GAP-02 — rahbar yangi nishon yaratadi; dublikat nom rad etiladi */
test('rahbar "Qoidalar va nishonlar"da yangi nishon yaratadi, bir xil nom ikkinchi marta qabul qilinmaydi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/gamification');
  await page.getByRole('tab', { name: 'Qoidalar va nishonlar' }).click();

  const name = `Do‘st olib keluvchi ${Date.now().toString().slice(-5)}`;
  const create = async () => {
    await page.getByRole('button', { name: 'Nishon yaratish' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yangi nishon' });
    await dialog.getByLabel(/Nomi/).fill(name);
    await dialog.getByLabel(/Tavsif/).fill('Taklif qilgan do‘sti o‘quvchi bo‘ldi');
    await dialog.getByLabel(/Talab/).selectOption('REFERRAL');
    await dialog.getByLabel(/Chegara/).fill('2');
    await dialog.getByRole('button', { name: 'Yaratish' }).click();
    return dialog;
  };

  const first = await create();
  await expect(first).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText('Ijtimoiy · Do‘st taklif qilish');
  await expect(row.getByLabel(`${name} chegarasi`)).toHaveValue('2');

  const second = await create();
  await expect(second.getByText('Boshqa nom tanlang')).toBeVisible();
  await second.getByRole('button', { name: 'Bekor qilish' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(1);
});
