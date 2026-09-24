import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Har testdan keyin DOM tozalanadi — aks holda oldingi testning tugmalari keyingisida
 * ham topilib, "strict mode" xatolari chiqadi.
 */
afterEach(() => {
  cleanup();
});
