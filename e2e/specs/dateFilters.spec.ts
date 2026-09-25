import { expect, login, test } from '../fixtures';

const pad = (value: number) => String(value).padStart(2, '0');
const display = (date: Date) => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;

/** TZ 3.1 GAP-04 — direktor paneli davrlari: bugun, o'tgan yil (to'liq kalendar yili), mavjud oy tanlovi */
test('direktor paneli: "Bugun" va "O‘tgan yil" davrlari sarlavhada, oldingi davr bilan solishtiriladi', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/executive');
  const header = page.getByRole('heading', { level: 1, name: 'Direktor paneli' }).locator('..');
  const period = page.getByLabel('Davr');

  const today = new Date();
  await period.selectOption('today');
  await expect(header).toContainText(`${display(today)} — ${display(today)}`);

  const lastYear = today.getFullYear() - 1;
  await period.selectOption('last_year');
  await expect(header).toContainText(`01.01.${lastYear} — 31.12.${lastYear}`);
  await expect(page.getByRole('list', { name: 'Yo‘nalishlar' })).toBeVisible();

  // Mavjud "shu oy" (prognoz bilan) buzilmagan
  await period.selectOption('this_month');
  await expect(page.getByText('Oy oxiri prognozi')).toBeVisible();
});
