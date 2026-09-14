import { describe, expect, it } from 'vitest';
import { createIdempotencyKey } from './idempotency';

const SERVER_FORMAT = /^[A-Za-z0-9-]{16,64}$/;

describe('createIdempotencyKey', () => {
  it('server qabul qiladigan formatda va har safar yangi kalit beradi', () => {
    const keys = new Set(Array.from({ length: 50 }, () => createIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(SERVER_FORMAT);
  });

  it('randomUUID bo‘lmagan muhitda (lokal tarmoqdagi oddiy HTTP) ham ishlaydi', () => {
    const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const key = createIdempotencyKey();
      expect(key).toMatch(/^[0-9a-f]{32}$/);
      expect(key).toMatch(SERVER_FORMAT);
    } finally {
      if (original) Object.defineProperty(crypto, 'randomUUID', original);
      else Reflect.deleteProperty(crypto, 'randomUUID');
    }
  });
});
