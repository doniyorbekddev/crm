import { expect, login, test } from '../fixtures';

test('to‘lov xulosasi telefonda: jadval o‘z ichida siljiydi, sahifa gorizontal siljimaydi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/payment-summary');
  await expect(page.getByText('Jami yig‘ilishi kerak')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
