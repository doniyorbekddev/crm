import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Xavfsizlik testlari haqiqiy konteynerlarni ishga tushiradi — ketma-ket va uzunroq vaqt bilan
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
