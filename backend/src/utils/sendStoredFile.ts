import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Response } from 'express';
import { AppError } from './AppError.js';
import { contentDisposition } from './fileStorage.js';

/**
 * Saqlangan faylni oqim bilan yuboradi (hujjat, vazifa fayli, dars materiali — hammasi shu yo'l).
 * Egalik va ruxsat chaqiruvchi servisda tekshirilgan bo'lishi kerak.
 */
export async function sendStoredFile(
  res: Response,
  file: { absolutePath: string; fileName: string; mimeType: string },
  /** Ochiq, versiyalangan fayllar (logo) uchun keshlash; standart — keshlanmaydi */
  cacheControl = 'private, no-store',
): Promise<void> {
  let size: number;
  try {
    size = (await stat(file.absolutePath)).size;
  } catch {
    throw AppError.notFound('Fayl saqlash joyida topilmadi');
  }
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(size));
  res.setHeader('Content-Disposition', contentDisposition(file.fileName));
  res.setHeader('Cache-Control', cacheControl);
  const stream = createReadStream(file.absolutePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
