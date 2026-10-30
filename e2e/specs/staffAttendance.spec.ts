import { expect, login, test, USERS } from '../fixtures';

/**
 * Xodim davomati (QR): qabulxona ekrani QR beradi → o'qituvchi o'z hisobi bilan havolani ochib "Ishga keldim"ni
 * tanlaydi → ekran darhol yangi QR oladi → rahbar panelida o'qituvchi "Ishda". Token QR ichidagi havoladan
 * (ekran so'ragan javobdan) olinadi — haqiqiy telefon kamerasi ochadigan manzil bilan bir xil.
 */
test('qabulxona QR → o‘qituvchi keldi → ekran yangilanadi → rahbar panelida "Ishda"', async ({ browser, page }) => {
  await login(page, 'owner');
  const firstQr = page.waitForResponse((response) => response.url().endsWith('/api/staff-attendance/qr') && response.request().method() === 'POST');
  await page.goto('/reception-qr');
  const issued = (await (await firstQr).json()) as { data: { id: string; token: string } };
  await expect(page.getByRole('img', { name: 'QR kod' })).toBeVisible();
  await expect(page.getByText('Ulangan')).toBeVisible();

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await login(teacher, 'teacher');
  await teacher.goto(`/my-attendance?qr=${issued.data.token}`);
  const dialog = teacher.getByRole('dialog', { name: 'Davomatni belgilash' });
  await expect(dialog.getByRole('button', { name: 'Ishga keldim' })).toBeVisible();
  // Faqat holatga mos amal: hali kelmagan xodimga "ketdim" ko'rsatilmaydi
  await expect(dialog.getByRole('button', { name: 'Ishdan ketdim' })).toHaveCount(0);

  const rotated = page.waitForResponse((response) => response.url().endsWith('/api/staff-attendance/qr') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Ishga keldim' }).click();
  await expect(teacher.getByText(/Ishga kelganingiz qayd etildi — \d{2}:\d{2}/)).toBeVisible();
  // Bir martalik: ekran ishlatilgan QR o'rniga yangisini oladi
  const next = (await (await rotated).json()) as { data: { token: string } };
  expect(next.data.token).not.toBe(issued.data.token);

  await teacher.getByRole('button', { name: 'Yopish' }).first().click();
  await expect(teacher.getByText('Ishda', { exact: true }).first()).toBeVisible();

  // Ishlatilgan QR qayta ochilsa — tushunarli xabar
  await teacher.goto(`/my-attendance?qr=${issued.data.token}`);
  await expect(teacher.getByText('QR kod allaqachon ishlatilgan')).toBeVisible();
  await teacherContext.close();

  await page.goto('/staff-attendance');
  const row = page.getByRole('row').filter({ hasText: USERS.teacher.name });
  await expect(row).toContainText('Ishda');
  await row.getByRole('button', { name: USERS.teacher.name }).click();
  const drawer = page.getByRole('dialog', { name: USERS.teacher.name });
  await expect(drawer.getByText('Keldi', { exact: false }).first()).toBeVisible();
  await expect(drawer.getByText('QR', { exact: true })).toBeVisible();
});
