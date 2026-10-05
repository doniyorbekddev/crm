import { expect, login, test } from '../fixtures';

const DARK = /(^|\s)dark(\s|$)/;

test('qorong‘i mavzu tanlanadi, sahifa yangilanganda saqlanadi va yorug‘ga qaytadi', async ({ page }) => {
  await login(page, 'admin');
  const html = page.locator('html');

  // Mavzu tugmalari endi Tooltip bilan (title atributi yo'q) — rol va nom bo'yicha topiladi
  await page.getByRole('radio', { name: 'Qorong‘i mavzu' }).click();
  await expect(html).toHaveClass(DARK);
  await page.reload();
  await expect(html).toHaveClass(DARK);

  await page.getByRole('radio', { name: 'Yorug‘ mavzu' }).click();
  await expect(html).not.toHaveClass(DARK);
});
