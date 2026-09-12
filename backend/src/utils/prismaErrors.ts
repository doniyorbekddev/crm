import { Prisma } from '../generated/prisma/client.js';
import { AppError } from './AppError.js';
import type { ErrorDetail } from './AppError.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Unique constraint buzilgan maydonlarni aniqlaydi.
 * Oddiy ulanishda `meta.target`, driver adapter (pg) orqali esa `meta.driverAdapterError.cause.constraint.fields` keladi.
 */
function extractConstraintFields(meta: unknown): string[] {
  if (!isRecord(meta)) return [];

  const target = meta.target;
  if (Array.isArray(target)) return target.filter((item): item is string => typeof item === 'string');
  if (typeof target === 'string') return [target];

  const adapterError = meta.driverAdapterError;
  if (isRecord(adapterError) && isRecord(adapterError.cause) && isRecord(adapterError.cause.constraint)) {
    const fields = adapterError.cause.constraint.fields;
    if (Array.isArray(fields)) {
      return fields.filter((item): item is string => typeof item === 'string').map((item) => item.replaceAll('"', ''));
    }
  }
  return [];
}

/** Prisma xatoligini foydalanuvchiga tushunarli AppError ga o‘giradi. Tanilmasa `null` qaytaradi. */
export function mapPrismaError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (error.code) {
    case 'P2002': {
      const fields = extractConstraintFields(error.meta);
      const details: ErrorDetail[] = fields.map((field) => ({ field, message: 'Bu qiymat allaqachon mavjud' }));
      return AppError.conflict('Bunday ma’lumot allaqachon mavjud', details);
    }
    case 'P2003':
      return AppError.conflict('Bog‘liq ma’lumotlar mavjud yoki bog‘lanayotgan yozuv topilmadi');
    case 'P2025':
      return AppError.notFound('Ma’lumot topilmadi yoki allaqachon o‘chirilgan');
    case 'P2000':
      return AppError.unprocessable('Kiritilgan qiymat juda uzun');
    default:
      return null;
  }
}
