import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Sof funksiyalar (formatlash, yorliqlar, ruxsat yordamchilari) uchun testlar —
// brauzer muhiti kerak emas, shuning uchun `node` environment yetarli.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/utils/**/*.ts'],
    },
  },
});
