import { expect, login, test } from '../fixtures';

test('davomat jurnali klaviatura bilan boshqariladi', async ({ page }) => {
  await login(page, 'teacher');
  await page.goto('/attendance');
  await expect(page.getByRole('heading', { level: 1, name: 'Davomat' })).toBeVisible();

  const rows = page.getByRole('group', { name: /davomati$/ });
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  const statusOf = (row: number, index: number) => rows.nth(row).getByRole('button').nth(index);

  // ↓ — keyingi o'quvchining xuddi shu holat tugmasi; ↑ — orqaga
  await statusOf(0, 0).focus();
  await page.keyboard.press('ArrowDown');
  await expect(statusOf(1, 0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(statusOf(0, 0)).toBeFocused();

  // → / ← — holatlar orasida
  await page.keyboard.press('ArrowRight');
  await expect(statusOf(0, 1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(statusOf(0, 0)).toBeFocused();

  // Raqam — shu o'quvchiga holat qo'yadi va keyingi o'quvchiga o'tadi (saqlanmaydi — test ma'lumotni o'zgartirmaydi)
  await page.keyboard.press('3');
  await expect(statusOf(0, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(statusOf(1, 2)).toBeFocused();
  await page.keyboard.press('1');
  await expect(statusOf(1, 0)).toHaveAttribute('aria-pressed', 'true');
});
