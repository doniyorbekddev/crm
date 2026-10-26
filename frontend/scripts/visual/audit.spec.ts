import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { API_PORT } from '../../../e2e/env';
import { PORTAL_PASSWORD, USERS, loginWithTemporaryPassword } from '../../../e2e/fixtures';
import { scanContrast, scanGlyphs, scanTokens } from './scanners';
import type { ContrastIssue, TokenPairResult } from './scanners';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const LABEL = process.env.VISUAL_LABEL ?? 'current';
const OUT = path.join(HERE, '../../.visual-audit', LABEL);
const API = `http://localhost:${API_PORT}/api`;
const THEMES = ['light', 'dark'] as const;
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;
/** Faqat ko'rinish uchun: reduced-motion'da hech narsa yashirin qolmasligini ham shu bilan tekshiramiz */
const MOTION = (process.env.VISUAL_MOTION ?? 'reduce') as 'reduce' | 'no-preference';

interface PageResult {
  page: string;
  theme: string;
  viewport: string;
  overflow: number;
  contrast: ContrastIssue[];
  consoleErrors: string[];
  screenshot: string;
}

const STAFF_PAGES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'students', path: '/students' },
  { name: 'student-profile', path: 'STUDENT' },
  { name: 'groups', path: '/groups' },
  { name: 'attendance', path: '/attendance' },
  { name: 'finance', path: '/finance' },
  { name: 'settings', path: '/settings/academy' },
] as const;

/** Har kontekst o'zi kiradi: refresh token har ishlatilganda almashadi, saqlangan cookie qayta ishlatilsa sessiya yopiladi */
async function signIn(context: BrowserContext, email: string, password: string, expectUrl: RegExp) {
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Login', { exact: true }).fill(email);
  await page.getByLabel('Parol', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page).toHaveURL(expectUrl);
  await page.close();
}

async function themedContext(browser: Browser, theme: string, viewport: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: MOTION,
    locale: 'uz-UZ',
    timezoneId: 'Asia/Tashkent',
  });
  await context.addInitScript((value) => localStorage.setItem('crm-theme', JSON.stringify({ state: { theme: value }, version: 0 })), theme);
  return context;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(MOTION === 'reduce' ? 300 : 1500);
}

async function capture(context: BrowserContext, name: string, url: string, theme: string, viewport: string): Promise<PageResult> {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text());
  });
  await page.goto(url);
  await settle(page);
  // Sessiya yo'qolsa skrinshot login sahifasi bo'lib qoladi — buni jim o'tkazib yubormaymiz
  if (name !== 'login') expect(page.url(), `${name}: login sahifasiga qaytdi`).not.toMatch(/\/login/);
  const file = `${name}-${theme}-${viewport}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  // Birinchi ekran (karkas: yopishqoq panellar, sidebar) — fullPage'da `fixed` elementlar faqat tepada chiqadi
  await page.screenshot({ path: path.join(OUT, file.replace('.png', '-fold.png')) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const contrast = await page.evaluate(scanContrast);
  await page.close();
  return { page: name, theme, viewport, overflow, contrast, consoleErrors, screenshot: file };
}

async function apiToken(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.accessToken as string;
}

test('vizual audit', async ({ browser, request }) => {
  mkdirSync(OUT, { recursive: true });
  const results: PageResult[] = [];
  const tokens: Record<string, TokenPairResult[]> = {};
  let glyphs: Array<{ char: string; code: string; family: string; inFont: boolean }> = [];

  // Sinov bazasidagi birinchi o'quvchi (profil sahifasi) va kabinet hisobi (portal)
  const adminHeaders = { Authorization: `Bearer ${await apiToken(request, USERS.admin.email, USERS.admin.password)}` };
  const students = (await (await request.get(`${API}/students`, { params: { limit: 20, status: 'ACTIVE' }, headers: adminHeaders })).json()).data as Array<{ id: string }>;
  expect(students.length).toBeGreaterThan(0);
  const studentPath = `/students/${students[0]!.id}`;

  // Kabinet hisobi: vaqtinchalik parol bir marta almashtiriladi, keyin har kontekst PORTAL_PASSWORD bilan kiradi
  const portalEmail = await (async () => {
    let credentials: { email: string; password: string } | null = null;
    for (const student of students) {
      const email = `visual-${Date.now()}-${student.id.slice(-4)}@e2e.uz`;
      const created = await request.post(`${API}/students/${student.id}/portal-account`, { data: { email }, headers: adminHeaders });
      if (created.status() === 409) continue;
      expect(created.status()).toBe(201);
      credentials = { email, password: (await created.json()).data.temporaryPassword as string };
      break;
    }
    expect(credentials).not.toBeNull();
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginWithTemporaryPassword(page, credentials!.email, credentials!.password);
    await context.close();
    return credentials!.email;
  })();

  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      const anon = await themedContext(browser, theme, viewport);
      results.push(await capture(anon, 'login', '/login', theme, viewport.name));
      if (viewport.name === '1440') {
        const page = await anon.newPage();
        await page.goto('/login');
        await settle(page);
        tokens[theme] = await page.evaluate(scanTokens);
        if (theme === 'light') glyphs = await page.evaluate(scanGlyphs);
        await page.close();
      }
      await anon.close();

      const staff = await themedContext(browser, theme, viewport);
      await signIn(staff, USERS.owner.email, USERS.owner.password, /\/dashboard/);
      for (const item of STAFF_PAGES) {
        results.push(await capture(staff, item.name, item.path === 'STUDENT' ? studentPath : item.path, theme, viewport.name));
      }
      await staff.close();

      const portal = await themedContext(browser, theme, viewport);
      await signIn(portal, portalEmail, PORTAL_PASSWORD, /\/portal/);
      results.push(await capture(portal, 'portal', '/portal', theme, viewport.name));
      await portal.close();
    }
  }

  const tokenFailures = Object.entries(tokens).flatMap(([theme, list]) => list.filter((item) => item.ratio < item.required).map((item) => ({ theme, ...item })));
  const report = { label: LABEL, motion: MOTION, generatedAt: new Date().toISOString(), glyphs, tokens, tokenFailures, pages: results };
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  const lines = [
    `# Vizual audit — ${LABEL}`,
    '',
    `Harakat: ${MOTION}. Sahifalar: ${results.length}.`,
    '',
    `Glif (shrift o'zida): ${glyphs.map((item) => `${item.family} ${item.char} ${item.code} ${item.inFont ? 'ha' : 'YO‘Q'}`).join(', ')}`,
    '',
    `Token juftliklari: ${Object.values(tokens).flat().length}, 4.5:1 dan past: ${tokenFailures.length}`,
    ...tokenFailures.map((item) => `- ${item.theme}: ${item.fg} / ${item.bg} = ${item.ratio}`),
    '',
    '| Sahifa | Mavzu | Kenglik | Gorizontal siljish (px) | Past kontrast | Konsol xatosi |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map((item) => `| ${item.page} | ${item.theme} | ${item.viewport} | ${item.overflow} | ${item.contrast.length} | ${item.consoleErrors.length} |`),
    '',
    '## Past kontrastli matnlar',
    ...results.flatMap((item) => item.contrast.map((issue) => `- ${item.page}/${item.theme}/${item.viewport}: "${issue.text}" ${issue.fg} on ${issue.bg} = ${issue.ratio} (kerak ${issue.required}) — ${issue.selector}`)),
    '',
    '## Konsol xatolari',
    ...results.flatMap((item) => item.consoleErrors.map((error) => `- ${item.page}/${item.theme}/${item.viewport}: ${error}`)),
  ];
  writeFileSync(path.join(OUT, 'report.md'), `${lines.join('\n')}\n`);
});
