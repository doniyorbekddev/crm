import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/utils/AppError.js';
import { buildPaginationMeta } from '../../src/utils/apiResponse.js';
import { addDays, startOfBusinessDay } from '../../src/utils/dates.js';
import { splitSearchTerms, toSkipTake } from '../../src/utils/pagination.js';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';
import { durationToSeconds, hashToken } from '../../src/utils/tokens.js';

describe('pagination', () => {
  it('sahifa raqamidan skip/take hisoblaydi', () => {
    expect(toSkipTake(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake(3, 20)).toEqual({ skip: 40, take: 20 });
    expect(toSkipTake(2, 5)).toEqual({ skip: 5, take: 5 });
  });

  it('qidiruv matnini so‘zlarga ajratadi va sonini cheklaydi', () => {
    expect(splitSearchTerms('Ali Valiyev')).toEqual(['Ali', 'Valiyev']);
    expect(splitSearchTerms('  bir   ikki  ')).toEqual(['bir', 'ikki']);
    expect(splitSearchTerms(undefined)).toEqual([]);
    expect(splitSearchTerms('')).toEqual([]);
    expect(splitSearchTerms('a b c d e f g')).toHaveLength(5);
    expect(splitSearchTerms('a b c', 2)).toEqual(['a', 'b']);
  });
});

describe('sana yordamchilari', () => {
  // Testlarda APP_UTC_OFFSET_MINUTES standart qiymati (UTC+5) ishlatiladi
  it('kun boshlanishini o‘quv markaz vaqtida hisoblaydi', () => {
    // 2026-09-15T09:00Z → mahalliy vaqt 14:00, mahalliy yarim tun = 2026-09-14T19:00Z
    const dayStart = startOfBusinessDay(new Date('2026-09-15T09:00:00.000Z'));
    expect(dayStart.toISOString()).toBe('2026-09-14T19:00:00.000Z');
  });

  it('mahalliy yarim tundan keyingi daqiqa yangi kunga o‘tadi', () => {
    const late = startOfBusinessDay(new Date('2026-09-14T18:59:00.000Z'));
    const early = startOfBusinessDay(new Date('2026-09-14T19:01:00.000Z'));
    expect(late.toISOString()).toBe('2026-09-13T19:00:00.000Z');
    expect(early.toISOString()).toBe('2026-09-14T19:00:00.000Z');
  });

  it('kun qo‘shadi va ayiradi', () => {
    const base = new Date('2026-09-15T00:00:00.000Z');
    expect(addDays(base, 1).toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect(addDays(base, -15).toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(addDays(base, 0).getTime()).toBe(base.getTime());
  });
});

describe('AppError', () => {
  it('to‘g‘ri status kodlari bilan yaratiladi', () => {
    expect(AppError.badRequest().statusCode).toBe(400);
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.conflict().statusCode).toBe(409);
    expect(AppError.unprocessable().statusCode).toBe(422);
    expect(AppError.tooManyRequests().statusCode).toBe(429);
  });

  it('maydon xatoliklarini saqlaydi', () => {
    const error = AppError.unprocessable('Xato', [{ field: 'email', message: 'Band' }]);
    expect(error.errors).toEqual([{ field: 'email', message: 'Band' }]);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Xato');
  });
});

describe('sahifalash meta', () => {
  it('sahifalar sonini to‘g‘ri hisoblaydi', () => {
    expect(buildPaginationMeta(1, 20, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
    expect(buildPaginationMeta(1, 20, 20)).toMatchObject({ totalPages: 1 });
    expect(buildPaginationMeta(1, 20, 0)).toMatchObject({ totalPages: 0, total: 0 });
    expect(buildPaginationMeta(2, 10, 11)).toMatchObject({ totalPages: 2 });
  });
});

describe('parol', () => {
  it('hash qaytaradi va tekshiradi', async () => {
    const hash = await hashPassword('Password123');

    expect(hash).not.toBe('Password123');
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword('Password123', hash)).toBe(true);
    expect(await verifyPassword('Password124', hash)).toBe(false);
  });

  it('bir xil parol uchun har safar boshqa hash beradi (salt)', async () => {
    const first = await hashPassword('Password123');
    const second = await hashPassword('Password123');
    expect(first).not.toBe(second);
  });
});

describe('token yordamchilari', () => {
  it('davomiylik formatini soniyaga aylantiradi', () => {
    expect(durationToSeconds('30s')).toBe(30);
    expect(durationToSeconds('15m')).toBe(900);
    expect(durationToSeconds('2h')).toBe(7200);
    expect(durationToSeconds('7d')).toBe(604_800);
  });

  it('noto‘g‘ri formatda xatolik beradi', () => {
    expect(() => durationToSeconds('15')).toThrow();
    expect(() => durationToSeconds('15x')).toThrow();
    expect(() => durationToSeconds('')).toThrow();
  });

  it('tokenni SHA-256 bilan hashlaydi (bir xil kirish — bir xil chiqish)', () => {
    const hash = hashToken('some-refresh-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken('some-refresh-token')).toBe(hash);
    expect(hashToken('boshqa-token')).not.toBe(hash);
  });
});
