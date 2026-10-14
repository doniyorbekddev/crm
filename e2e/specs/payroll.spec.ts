import { expect, login, test } from '../fixtures';

/**
 * Maosh oqimi: oyni hisoblash → tasdiqlashga yuborish → profil hisob-kitobi → rad etish (sabab) →
 * qayta yuborish → tasdiqlash; o'zgarishlar xronologiyada.
 */
test('maosh: hisoblash, yuborish, rad etish va tasdiqlash — hisob izohi va tarix bilan', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/salaries');
  await expect(page.getByRole('heading', { level: 1, name: 'Maoshlar' })).toBeVisible();

  await page.getByRole('button', { name: 'Oyni hisoblash' }).click();
  const table = page.getByRole('table', { name: 'Maoshlar' });
  await expect(table.getByText('Hisoblandi').first()).toBeVisible();

  await page.getByRole('button', { name: /Tasdiqlashga yuborish \(\d+\)/ }).click();
  await expect(table.getByText('Ko‘rib chiqilmoqda').first()).toBeVisible();
  await expect(page.getByText(/ta maosh direktor qarorini kutmoqda/)).toBeVisible();

  // Profil: hisob-kitob formulasi va jami
  await table.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Hisob-kitob' })).toBeVisible();
  await expect(page.getByText('Jami', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Rad etish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Maoshni rad etish' });
  await dialog.getByLabel('Sabab').fill('Darslar soni qayta tekshirilsin');
  await dialog.getByRole('button', { name: 'Rad etish' }).click();
  await expect(page.getByText('Direktor rad etgan')).toBeVisible();

  await page.getByRole('button', { name: 'Tasdiqlashga yuborish' }).click();
  await page.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Maoshni tasdiqlash' }).getByRole('button', { name: 'Tasdiqlash' }).click();

  const history = page.getByRole('list', { name: 'Maosh o‘zgarishlari' });
  await expect(history.getByText('Tasdiqlandi')).toBeVisible();
  await expect(history.getByText('Rad etildi')).toBeVisible();
});

test('KPI sozlamasi: vaznlar 100% bo‘lmasa lavozimda ogohlantiriladi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/salaries/kpi');
  await expect(page.getByRole('heading', { level: 1, name: 'KPI sozlamalari' })).toBeVisible();

  await page.getByRole('button', { name: 'KPI qo‘shish' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Yangi KPI' });
  await dialog.getByLabel('Nomi').fill('Filial davomati');
  await dialog.getByLabel('O‘lchov usuli').selectOption('ATTENDANCE_RATE');
  await dialog.getByLabel('Maqsad, %').fill('90');
  await dialog.getByLabel('Vazn, %').fill('60');
  await dialog.getByRole('button', { name: 'Saqlash' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Vaznlar 60% — bonus hisoblanmaydi')).toBeVisible();

  // 100% dan oshadigan vazn rad etiladi
  await page.getByRole('button', { name: 'KPI qo‘shish' }).first().click();
  const second = page.getByRole('dialog', { name: 'Yangi KPI' });
  await second.getByLabel('Nomi').fill('Saqlash');
  await second.getByLabel('O‘lchov usuli').selectOption('STUDENT_RETENTION');
  await second.getByLabel('Maqsad, %').fill('95');
  await second.getByLabel('Vazn, %').fill('50');
  await second.getByRole('button', { name: 'Saqlash' }).click();
  await expect(second.getByText(/100% dan oshmasligi kerak/).first()).toBeVisible();
  await second.getByLabel('Vazn, %').fill('40');
  await second.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByText('Vaznlar 100%')).toBeVisible();
});
