import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, BACKEND_DIR, FRONTEND_DIR, WEB_PORT, e2eDatabaseUrl } from './e2e/env';

const isCI = Boolean(process.env.CI);
// Lokal mashinada o'rnatilgan Google Chrome; CI'da `npx playwright install chromium`
const channel = isCI ? undefined : (process.env.E2E_BROWSER_CHANNEL ?? 'chrome');

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './e2e/.results',
  // Testlar bitta seed qilingan bazani ishlatadi — ketma-ket bajariladi
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'uz-UZ',
    timezoneId: 'Asia/Tashkent',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /\.mobile\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /\.mobile\.spec\.ts$/,
      use: { ...devices['Pixel 7'], channel },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx src/server.ts',
      cwd: BACKEND_DIR,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        PORT: String(API_PORT),
        // test rejimi: rate limiter o'chiq (bitta IP'dan ko'p login), bcrypt tezroq
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        CLIENT_URL: `http://localhost:${WEB_PORT}`,
        UPLOAD_DIR: path.join(os.tmpdir(), 'crm-e2e-uploads'),
        SMTP_HOST: '',
        JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-access-secret-0123456789-abcdefghijklmnop',
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret-0123456789-abcdefghijklmnop',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: FRONTEND_DIR,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
    },
  ],
});
