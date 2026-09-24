import os from 'node:os';
import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// TEST_DATABASE_URL backend/.env dan olinadi. U yo‘q bo‘lsa, integratsion testlar o‘tkazib yuboriladi
// va hech qanday test development bazasiga ulanmaydi.
// Yo‘l config fayliga nisbatan — buyruq qaysi papkadan ishga tushirilishidan qat’i nazar
config({ path: path.resolve(import.meta.dirname, '.env'), quiet: true });
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    // Integratsion testlar bitta bazani ishlatadi — fayllar ketma-ket bajariladi
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // Generatsiya qilingan kod, konfiguratsiya va kirish nuqtasi qamrovga kirmaydi
      exclude: ['src/generated/**', 'src/server.ts', 'src/config/env.ts', 'src/utils/logger.ts', 'prisma/**'],
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl || 'postgresql://test:test@127.0.0.1:1/test_database_not_configured',
      TEST_DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-access-secret-0123456789-abcdefghijklmnop',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-abcdefghijklmnop',
      CLIENT_URL: 'http://localhost:5173',
      // Telegram: token yo'q (o'chirilgan rejim), lekin webhook imzosi tekshiriladigan bo'lsin
      TELEGRAM_WEBHOOK_SECRET: 'test-telegram-webhook-secret',
      // Onlayn to'lov oqimini haqiqiy imzo bilan sinash uchun
      PAYMENT_SANDBOX_SECRET: 'test-payment-sandbox-secret',
      SMTP_HOST: '',
      // Testlar yuklagan fayllar loyiha papkasiga emas, vaqtinchalik papkaga yoziladi
      UPLOAD_DIR: path.join(os.tmpdir(), 'crm-test-uploads'),
    },
  },
});
