import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Davomat taxtasidan birinchi guruh kartasini ochadi va guruh nomini qaytaradi.
 *
 * Seed guruhlari dushanba–shanba kunlari dars o'tadi. Test yakshanba kuni yursa bugungi taxta bo'sh bo'ladi —
 * bu holda bir kun oldingi sana (shanba) tanlanadi, shunda senariy haftaning har kuni bir xil ishlaydi.
 */
export async function openFirstLessonGroup(page: Page): Promise<string> {
  await page.goto('/attendance');
  await expect(page.getByRole('heading', { level: 1, name: 'Davomat' })).toBeVisible();
  const board = page.getByRole('region', { name: 'Kunlik darslar' });
  const cards = board.getByRole('link', { name: /— davomatni ochish$/ });
  const empty = board.getByText(/dars yo‘q|rejalashtirilmagan/);
  await expect(cards.first().or(empty.first())).toBeVisible();

  if ((await cards.count()) === 0) {
    const dateInput = board.getByLabel('Sana');
    const shown = await dateInput.inputValue();
    const previous = new Date(`${shown}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    await dateInput.fill(previous.toISOString().slice(0, 10));
    await expect(cards.first()).toBeVisible();
  }

  const label = (await cards.first().getAttribute('aria-label')) ?? '';
  const name = label.replace(/ — davomatni ochish$/, '');
  await cards.first().click();
  await expect(page).toHaveURL(/\/attendance\/groups\/[^/?]+\?date=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return name;
}
