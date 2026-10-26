import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';
import rootConfig from '../../../playwright.config';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Ildiz config CommonJS — ESM'dan import qilinganda `default` ichida keladi
const base = ((rootConfig as { default?: PlaywrightTestConfig }).default ?? rootConfig) as PlaywrightTestConfig;

/**
 * Vizual audit: kontrast, gorizontal siljish, konsol xatolari va skrinshotlar (light/dark × 1440/390).
 * E2E bilan bir xil izolyatsiyalangan sinov bazasi va serverlar (`e2e/env.ts`) — real ma'lumot yo'q.
 *
 *   npx tsx e2e/prepare.ts   # sinov bazasini qayta yaratadi (ildizda)
 *   VISUAL_LABEL=after npx playwright test --config frontend/scripts/visual/playwright.visual.config.ts
 *
 * Natija: frontend/.visual-audit/<label>/ (git'ga kirmaydi): *.png, report.json, report.md
 */
export default defineConfig({
  ...base,
  testDir: HERE,
  testMatch: /audit\.spec\.ts$/,
  outputDir: path.join(HERE, '../../.visual-audit/.results'),
  timeout: 15 * 60_000,
  reporter: 'list',
  projects: [{ name: 'visual', use: { ...base.projects?.[0]?.use } }],
});
