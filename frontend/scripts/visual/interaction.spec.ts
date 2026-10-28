import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { USERS } from '../../../e2e/fixtures';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '../../.visual-audit', process.env.VISUAL_LABEL ?? 'current');

async function signedIn(browser: Browser, reducedMotion: 'reduce' | 'no-preference'): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion, locale: 'uz-UZ', timezoneId: 'Asia/Tashkent' });
  await context.addInitScript(() => localStorage.setItem('crm-theme', JSON.stringify({ state: { theme: 'light' }, version: 0 })));
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Login', { exact: true }).fill(USERS.owner.email);
  await page.getByLabel('Parol', { exact: true }).fill(USERS.owner.password);
  await page.getByLabel('Parol', { exact: true }).press('Enter');
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

/** Fokus ko'rinadimi: :focus-visible va shaffof bo'lmagan outline (maydonlarda — halqa) */
async function focusVisible(page: Page): Promise<{ tag: string; visible: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: 'none', visible: false };
    const style = getComputedStyle(el);
    const outline = el.matches(':focus-visible') && style.outlineStyle !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(style.outlineColor);
    // Forma maydonlari fokusni chegara + halqa (box-shadow) bilan ko'rsatadi — controlStyles.ts
    const ring = el.matches('input, select, textarea') && style.boxShadow !== 'none';
    const visible = outline || ring;
    return { tag: `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}`, visible };
  });
}

test('klaviatura: tablar, menyu, drawer, modal, foydalanuvchi menyusi — fokus ko‘rinadi, Esc yopadi', async ({ browser }) => {
  const page = await signedIn(browser, 'no-preference');
  const log: Record<string, unknown> = {};
  await page.goto('/students');

  // Tablar: ←/→ faol tabni almashtiradi, fokus ko'rinadi
  const first = page.getByRole('tab', { name: /Barchasi/ });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  const second = page.getByRole('tab').nth(1);
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(second).toBeFocused();
  // Halqa rangi o'tish bilan (≤ 220ms) paydo bo'ladi — bir martalik o'lchov emas, kutiladi
  await expect.poll(async () => (await focusVisible(page)).visible, { timeout: 2000 }).toBe(true);
  log.tabs = await focusVisible(page);
  await page.keyboard.press('ArrowLeft');

  // Qator amallari menyusi: Enter ochadi, ↓ yuradi, Esc yopadi va fokus tugmaga qaytadi
  const trigger = page.getByRole('button', { name: /amallari$/ }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  // Halqa rangi o'tish bilan (≤ 220ms) paydo bo'ladi — bir martalik o'lchov emas, kutiladi
  await expect.poll(async () => (await focusVisible(page)).visible, { timeout: 2000 }).toBe(true);
  log.menu = await focusVisible(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Drawer (tezkor ko'rish): fokus ichida, Esc yopadi
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Tezkor ko‘rish' }).focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Modal (o'quvchi qo'shish): Tab bilan fokus ichida aylanadi, Esc yopadi
  await page.getByRole('button', { name: 'O‘quvchi qo‘shish' }).focus();
  await page.keyboard.press('Enter');
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await page.keyboard.press('Tab');
  // Halqa rangi o'tish bilan (≤ 220ms) paydo bo'ladi — bir martalik o'lchov emas, kutiladi
  await expect.poll(async () => (await focusVisible(page)).visible, { timeout: 2000 }).toBe(true);
  log.modal = await focusVisible(page);
  expect(await modal.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Foydalanuvchi menyusi
  await page.getByRole('button', { name: new RegExp(USERS.owner.name) }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'keyboard.json'), JSON.stringify(log, null, 2));
});

test('reduced-motion: hech narsa harakatlanmaydi va hech narsa yashirin qolmaydi', async ({ browser }) => {
  const page = await signedIn(browser, 'reduce');
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    revealReady: document.documentElement.hasAttribute('data-reveal-ready'),
    pending: document.querySelectorAll('[data-reveal-pending]').length,
    countUp: document.querySelectorAll('.count-up').length,
    running: document.getAnimations().filter((animation) => animation.playState === 'running').length,
  }));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'reduced-motion.json'), JSON.stringify(state, null, 2));
  expect(state).toEqual({ revealReady: false, pending: 0, countUp: 0, running: 0 });
});

test('harakat yoqilgan: ekrandagilar yashirilmaydi, pastdagilari aylantirilganda chiqadi; uzun kadrlar o‘lchanadi', async ({ browser }) => {
  const page = await signedIn(browser, 'no-preference');
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  const hiddenInView = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('[data-reveal-pending]')).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }).length,
  );
  expect(hiddenInView).toBe(0);
  // Pastgacha aylantiramiz — barcha kartalar chiqishi kerak
  for (let y = 0; y < 6000; y += 600) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => document.querySelectorAll('[data-reveal-pending]').length)).toBe(0);
  // CountUp tugagach oddiy matnga qaytadi
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  expect(await page.locator('.count-up').count()).toBe(0);

  // Uzun animatsiya kadrlari (LoAF, ≥ 50ms): sidebar orqali sahifalar almashadi, menyu va modal ochiladi
  await page.evaluate(() => {
    const store: number[] = [];
    (window as unknown as { __longFrames: number[] }).__longFrames = store;
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => store.push(Math.round(entry.duration)))).observe({ type: 'long-animation-frame', buffered: false });
  });
  for (const name of ['O‘quvchilar', 'Guruhlar', 'Davomat', 'Dashboard']) {
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(700);
  }
  await page.getByRole('button', { name: 'Vidjetlar' }).click();
  await page.waitForTimeout(500);
  const frames = await page.evaluate(() => (window as unknown as { __longFrames: number[] }).__longFrames);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'long-frames.json'), JSON.stringify({ note: 'Dev server (minifikatsiyasiz React); ma’lumot yuklanishi bilan birga', count: frames.length, max: Math.max(0, ...frames), frames }, null, 2));
});
