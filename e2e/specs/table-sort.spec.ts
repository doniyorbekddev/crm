import { expect, login, test } from '../fixtures';

test('ustun sarlavhasi bosilganda ro‘yxat serverda saralanadi', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/students');
  const header = page.getByRole('columnheader', { name: 'O‘quvchi' });
  await expect(header).toHaveAttribute('aria-sort', 'none');

  const sorted = (order: 'asc' | 'desc') =>
    page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith('/students') && url.searchParams.get('sortBy') === 'firstName' && url.searchParams.get('sortOrder') === order;
    });

  const ascending = sorted('asc');
  await header.getByRole('button').click();
  await ascending;
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  // Saralash ro'yxati ham shu holatni ko'rsatadi — ikkalasi bitta holat
  await expect(page.getByLabel('Saralash')).toHaveValue('firstName:asc');

  const descending = sorted('desc');
  await header.getByRole('button').click();
  await descending;
  await expect(header).toHaveAttribute('aria-sort', 'descending');

  // Uchinchi bosish — standart tartib
  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort', 'none');
  await expect(page.getByLabel('Saralash')).toHaveValue('createdAt:desc');
});

test('bildirishnomalar toifa bo‘yicha filtrlanadi', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/notifications');
  const tabs = page.getByRole('tablist', { name: 'Toifa bo‘yicha filtr' });
  await expect(tabs.getByRole('tab', { name: /Hammasi/ })).toHaveAttribute('aria-selected', 'true');

  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/notifications') && url.searchParams.get('category') === 'PAYMENT';
  });
  await tabs.getByRole('tab', { name: /To‘lov/ }).click();
  expect((await filtered).status()).toBe(200);
  await expect(tabs.getByRole('tab', { name: /To‘lov/ })).toHaveAttribute('aria-selected', 'true');

  // Tur ro'yxati tanlangan toifa bilan cheklanadi
  const types = page.getByLabel('Bildirishnoma turi');
  await expect(types.getByRole('option', { name: /Yangi to‘lov/ })).toBeAttached();
  await expect(types.getByRole('option', { name: /Yangi lead/ })).toHaveCount(0);
});
