import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

/**
 * Ikki xil test bor va ular turli muhitni talab qiladi:
 *  - sof funksiyalar (formatlash, yorliqlar) — brauzer kerak emas, `node` tezroq;
 *  - komponentlar (`*.test.tsx`) — DOM kerak, shuning uchun `jsdom`.
 *
 * Shu sababli ikkita "project": bitta buyruq (`npm test`) ikkalasini ham ishga tushiradi.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/utils/**/*.ts', 'src/components/ui/**/*.tsx'],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'components',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
