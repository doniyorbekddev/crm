import { expect, login, logout, test } from '../fixtures';

/** CRM 4.0 · 2-faza: rahbar vazifa yaratadi → "Ishlarim"da ko'rinadi → bajarildi deb belgilaydi */
test('rahbar vazifa yaratadi, "Ishlarim"da ko‘radi va bajaradi', async ({ page }) => {
  const title = `E2E vazifa ${Date.now()}`;
  await login(page, 'owner');
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Vazifalar' })).toBeVisible();

  await page.getByRole('button', { name: 'Yangi vazifa' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sarlavha').fill(title);
  await dialog.getByLabel('Ustuvorlik').selectOption('URGENT');
  await dialog.getByRole('button', { name: 'Yaratish' }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText('Shoshilinch')).toBeVisible();

  // "Ishlarim" markazida vazifalar bo'limida ko'rinadi
  await page.goto('/my-work');
  await expect(page.getByRole('heading', { level: 1, name: 'Ishlarim' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Vazifalar' }).getByText(title)).toBeVisible();

  await page.goto('/tasks');
  await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Bajarildi' }).click();
  // Ochiqlar ro'yxatidan chiqadi, bajarilganlarda ko'rinadi
  await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
  await page.getByLabel('Holat').selectOption('DONE');
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
});

/** Rahbar panelidagi chip → filtrli ro'yxat → tahrirlash va izoh; ijrochi bildirishnomani kechiktiradi */
test('kechikkan vazifa: chip orqali ochiladi, tahrirlanadi, izohlanadi; ijrochi xabarni kechiktiradi', async ({ page }) => {
  const title = `E2E kechikkan ${Date.now()}`;
  await login(page, 'owner');
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Yangi vazifa' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Sarlavha').fill(title);
  await form.getByLabel('Muddat').fill('2026-01-05T10:00');
  const teacherOption = form.getByLabel('Ijrochi').locator('option', { hasText: 'Bobur Ismoilov' });
  await form.getByLabel('Ijrochi').selectOption((await teacherOption.getAttribute('value'))!);
  await form.getByRole('button', { name: 'Yaratish' }).click();
  await expect(form).toBeHidden();

  // Rahbar paneli: chip — havola, filtrli ro'yxatga olib boradi
  await page.goto('/executive');
  await page.getByRole('link', { name: /Muddati o‘tgan vazifalar/ }).click();
  await expect(page).toHaveURL(/\/tasks\?scope=all&overdue=1/);
  await expect(page.getByLabel('Faqat kechikkanlar')).toBeChecked();
  await expect(page.getByLabel('Kimniki')).toHaveValue('all');
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row.getByText('Muddati o‘tgan')).toBeVisible();
  await expect(row.getByText(/Bobur Ismoilov/)).toBeVisible();

  // Tafsilot → tahrirlash
  await row.getByRole('button', { name: /Tafsilot/ }).click();
  const drawer = page.getByRole('dialog', { name: title });
  await drawer.getByRole('button', { name: 'Tahrirlash' }).click();
  const edit = page.getByRole('dialog', { name: 'Vazifani tahrirlash' });
  await expect(edit.getByLabel('Sarlavha')).toHaveValue(title);
  await edit.getByLabel('Sarlavha').fill(`${title} (yangilandi)`);
  await edit.getByLabel('Ustuvorlik').selectOption('HIGH');
  await edit.getByRole('button', { name: 'Saqlash' }).click();
  await expect(edit).toBeHidden();
  const updated = page.getByRole('dialog', { name: `${title} (yangilandi)` });
  await expect(updated.getByText('Yuqori')).toBeVisible();

  // Izoh
  await updated.getByLabel('Izoh').fill('E2E izoh: ota-ona bilan gaplashildi');
  await updated.getByRole('button', { name: 'Izoh qo‘shish' }).click();
  await expect(updated.getByText('E2E izoh: ota-ona bilan gaplashildi')).toBeVisible();
  await page.keyboard.press('Escape');
  await logout(page, 'owner');

  // Ijrochi: xabar keldi → vaqt tanlab kechiktiradi → ro'yxatdan chiqadi
  await login(page, 'teacher');
  await page.goto('/notifications');
  const note = page.getByRole('listitem').filter({ hasText: title }).filter({ hasText: 'Sizga vazifa berildi' });
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Kechiktirish' }).click();
  const snooze = page.getByRole('dialog', { name: 'Kechiktirish' });
  await snooze.getByRole('button', { name: '1 soatdan keyin' }).click();
  await expect(snooze).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: title }).filter({ hasText: 'Sizga vazifa berildi' })).toHaveCount(0);
});

/** Ogohlantirish → vazifa → kechiktirish → qaytarish → mas'ul */
test('ogohlantirishdan vazifa yaratiladi; kechiktiriladi va qaytariladi; mas’ul belgilanadi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/alerts');
  await page.getByRole('button', { name: 'Hozir tekshirish' }).click();
  const first = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Yopish' }) }).first();
  await expect(first).toBeVisible();

  // Vazifa: sarlavha ogohlantirishdan oldindan to'ldirilgan
  await first.getByRole('button', { name: 'Vazifa', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Yangi vazifa' });
  const alertTitle = await form.getByLabel('Sarlavha').inputValue();
  expect(alertTitle.length).toBeGreaterThan(2);
  await form.getByRole('button', { name: 'Yaratish' }).click();
  await expect(form).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: alertTitle }).first();
  await expect(row.getByText(/1 ta ochiq vazifa/)).toBeVisible();
  await expect(row.getByText(/Mas’ul: Sherzod Abdullayev/)).toBeVisible();

  // Mas'ulni almashtirish
  await row.getByRole('button', { name: 'Mas’ul', exact: true }).click();
  const assign = page.getByRole('dialog', { name: 'Mas’ul xodim' });
  const adminOption = assign.getByLabel('Mas’ul').locator('option', { hasText: 'Jamshid Karimov' });
  await assign.getByLabel('Mas’ul').selectOption((await adminOption.getAttribute('value'))!);
  await assign.getByRole('button', { name: 'Saqlash' }).click();
  await expect(assign).toBeHidden();
  await expect(row.getByText(/Mas’ul: Jamshid Karimov/)).toBeVisible();

  // Kechiktirish: faol ro'yxatdan chiqadi, "Kechiktirilgan"da ko'rinadi
  await row.getByRole('button', { name: 'Kechiktirish' }).click();
  const snooze = page.getByRole('dialog', { name: 'Kechiktirish' });
  await snooze.getByRole('button', { name: 'Ertaga ertalab (09:00)' }).click();
  await expect(snooze).toBeHidden();
  await page.getByRole('tab', { name: 'Kechiktirilgan' }).click();
  const snoozed = page.getByRole('listitem').filter({ hasText: alertTitle }).first();
  await expect(snoozed.getByText(/Kechiktirilgan: .* gacha/)).toBeVisible();

  // Qaytarish — yana faol ro'yxatda
  await snoozed.getByRole('button', { name: 'Qaytarish' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: alertTitle })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Ochiq', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: alertTitle }).first()).toBeVisible();
});
