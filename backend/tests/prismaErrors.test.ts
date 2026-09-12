import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { mapPrismaError } from '../src/utils/prismaErrors.js';

function knownError(code: string, meta?: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('test', { code, clientVersion: 'test', meta });
}

describe('mapPrismaError', () => {
  it('P2002 (unique) → 409 va maydon nomi', () => {
    const error = mapPrismaError(knownError('P2002', { target: ['email'] }));

    expect(error?.statusCode).toBe(409);
    expect(error?.errors).toEqual([{ field: 'email', message: 'Bu qiymat allaqachon mavjud' }]);
  });

  it('P2002 driver adapter formatidagi maydonni ham aniqlaydi', () => {
    const error = mapPrismaError(
      knownError('P2002', { driverAdapterError: { cause: { constraint: { fields: ['"phone"'] } } } }),
    );

    expect(error?.errors).toEqual([{ field: 'phone', message: 'Bu qiymat allaqachon mavjud' }]);
  });

  it('P2025 (topilmadi) → 404', () => {
    expect(mapPrismaError(knownError('P2025'))?.statusCode).toBe(404);
  });

  it('P2003 (foreign key) → 409', () => {
    expect(mapPrismaError(knownError('P2003'))?.statusCode).toBe(409);
  });

  it('Prisma bo‘lmagan xatolik uchun null qaytaradi', () => {
    expect(mapPrismaError(new Error('boshqa'))).toBeNull();
  });
});
