import { expect, login, test } from '../fixtures';

const DARK = /(^|\s)dark(\s|$)/;

test('qorong‘i mavzu tanlanadi, sahifa yangilanganda saqlanadi va yorug‘ga qaytadi', async ({ page }) => {
  await login(page, 'admin');
  const html = page.locator('html');

  await page.getByTitle('Qorong‘i mavzu').click();
  await expect(html).toHaveClass(DARK);
  await page.reload();
  await expect(html).toHaveClass(DARK);

  await page.getByTitle('Yorug‘ mavzu').click();
  await expect(html).not.toHaveClass(DARK);
});
