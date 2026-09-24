import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions, createTestUser, DEFAULT_PASSWORD } from './helpers/db.js';

const app = createApp();

/**
 * Limitlar odatda testlarda o'chirilgan. Bu yerda ularni ataylab yoqamiz —
 * "brute-force himoyasi bor" degan gap tekshirilmasa, uni yo'q deb hisoblash kerak.
 */
describe.skipIf(!hasTestDatabase)('Rate limiting va brute-force himoyasi', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    process.env.RATE_LIMIT_TEST = 'on';
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_TEST;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ketma-ket noto‘g‘ri parol urinishlari bloklanadi', async () => {
    const user = await createTestUser({ email: 'bruteforce@local.uz' });

    let blockedAt = 0;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const response = await request(app).post('/api/auth/login').send({ email: user.email, password: 'NotoGriParol1' });
      if (response.status === 429) {
        blockedAt = attempt;
        expect(response.body.message).toContain('urinish');
        break;
      }
      // Bloklanmaguncha oddiy xato qaytadi (parol noto'g'ri yoki hisob vaqtincha yopilgan)
      expect([401, 423]).toContain(response.status);
    }

    expect(blockedAt).toBeGreaterThan(0);
    expect(blockedAt).toBeLessThanOrEqual(12);
  });

  it('bloklangandan keyin to‘g‘ri parol ham o‘tmaydi', async () => {
    const user = await createTestUser({ email: 'bruteforce2@local.uz' });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'NotoGriParol1' });
    }

    const response = await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(response.status).toBe(429);
  });
});
