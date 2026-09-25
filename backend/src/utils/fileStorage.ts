import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

/**
 * Hujjatlar diskda saqlanadi (public papka emas). Fayl nomi tasodifiy, yo‘l faqat shu papka ichida —
 * foydalanuvchi bergan nom hech qachon yo‘l sifatida ishlatilmaydi.
 */
export const UPLOAD_ROOT = path.resolve(env.UPLOAD_DIR);

export interface DetectedFileType {
  mime: string;
  ext: string;
}

/** Faylning birinchi baytlari (magic bytes) bo‘yicha haqiqiy turi — Content-Type va kengaytmaga ishonilmaydi */
export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const FORBIDDEN_NAME_CHARS = '"<>:|?*';

/** Ko‘rsatiladigan nom: papka qismi, boshqaruv va xavfli belgilar olib tashlanadi, kengaytma haqiqiy turga moslanadi */
export function sanitizeFileName(raw: string | undefined, ext: string): string {
  const decoded = raw ? safeDecode(raw) : '';
  const base = path.basename(decoded.split('\\').join('/'));
  const cleaned = Array.from(base)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127 && !FORBIDDEN_NAME_CHARS.includes(char);
    })
    .join('')
    .trim();
  const stem = cleaned.replace(/\.[^.]*$/, '').slice(0, 200).trim() || 'fayl';
  return `${stem}.${ext}`;
}

/** Faylni saqlaydi va nisbiy yo‘lni qaytaradi: "2026/09/<uuid>.pdf" */
export async function saveFile(buffer: Buffer, ext: string): Promise<string> {
  const now = new Date();
  const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  await mkdir(path.join(UPLOAD_ROOT, dir), { recursive: true });
  const relative = `${dir}/${randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOAD_ROOT, relative), buffer, { flag: 'wx', mode: 0o640 });
  return relative;
}

/** Nisbiy yo‘l → mutlaq yo‘l; saqlash papkasidan tashqariga chiqishga yo‘l qo‘yilmaydi */
export function resolveStoredPath(relative: string): string {
  const absolute = path.resolve(UPLOAD_ROOT, relative);
  if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error('Fayl yo‘li saqlash papkasidan tashqarida');
  }
  return absolute;
}

export async function removeStoredFile(relative: string): Promise<void> {
  await rm(resolveStoredPath(relative), { force: true });
}

/** Content-Disposition: ASCII zaxira nom + UTF-8 asl nom (RFC 5987) */
export function contentDisposition(name: string): string {
  const ascii = Array.from(name)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code < 127 && char !== '"' && char !== '\\' ? char : '_';
    })
    .join('');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Saqlangan fayl kengaytmasi → MIME (faqat ruxsat etilgan turlar) */
export function mimeForStoredPath(stored: string): string {
  const ext = stored.split('.').pop()?.toLowerCase();
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'application/octet-stream';
}
