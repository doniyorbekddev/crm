import { prisma } from '../config/database.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { detectFileType, mimeForStoredPath, removeStoredFile, resolveStoredPath, saveFile } from '../utils/fileStorage.js';
import { logger } from '../utils/logger.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';

/**
 * Profil rasmi (avatar). Har kim faqat O'Z rasmini qo'yadi va o'chiradi.
 *
 * Ko'rsatish: `<img>` so'rovi kirish tokenini yubora olmaydi, shuning uchun rasm tokensiz, lekin TAXMIN QILIB
 * BO'LMAYDIGAN manzil orqali beriladi — fayl nomi tasodifiy UUID (122 bit). Manzilni faqat ilovaga kirgan
 * foydalanuvchi API javobidan biladi. Rasm almashtirilsa nom ham o'zgaradi, eski fayl o'chiriladi — shu sababli
 * brauzer keshi uzoq muddatga yoqilgan (eskirgan rasm ko'rinmaydi).
 */
export const AVATAR_MAX_BYTES = 1024 * 1024;
const AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** "2026/10/<uuid>.jpg" — `saveFile` shakli; boshqa har qanday yo'l rad etiladi */
const AVATAR_PATH = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

/** API javobi uchun: ilova API manziliga nisbatan yo'l (frontend o'z API bazasini qo'shadi) */
export function avatarUrlOf(avatarPath: string | null | undefined): string | null {
  return avatarPath ? `/public/avatars/${avatarPath}` : null;
}

export const avatarService = {
  async upload(actor: AuthUser, body: unknown, client: ClientInfo): Promise<{ avatarUrl: string }> {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw AppError.unprocessable('Fayl bo‘sh', [{ field: 'file', message: 'Rasmni tanlang' }]);
    }
    if (body.length > AVATAR_MAX_BYTES) {
      throw AppError.unprocessable('Rasm 1 MB dan oshmasin', [{ field: 'file', message: 'Fayl juda katta' }]);
    }
    // Turi fayl ichidan (magic bytes) aniqlanadi — Content-Type va kengaytmaga ishonilmaydi
    const type = detectFileType(body);
    if (!type || !AVATAR_MIMES.has(type.mime)) {
      throw AppError.unprocessable('Rasm faqat PNG, JPG yoki WEBP bo‘lishi mumkin', [{ field: 'file', message: 'Fayl turi qo‘llanmaydi' }]);
    }

    const previous = (await prisma.user.findUnique({ where: { id: actor.id }, select: { avatarPath: true } }))?.avatarPath ?? null;
    const stored = await saveFile(body, type.ext);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: actor.id }, data: { avatarPath: stored } });
        await auditService.recordInTransaction(tx, { userId: actor.id, action: 'user.avatar_updated', entityType: 'user', entityId: actor.id, metadata: { mime: type.mime, bytes: body.length, replaced: previous !== null }, ...client });
      });
    } catch (error) {
      // Baza yozilmadi — diskda egasiz fayl qolmasin
      await removeStoredFile(stored).catch(() => undefined);
      throw error;
    }
    if (previous) await removeStoredFile(previous).catch((error: unknown) => logger.warn({ err: error }, 'Eski profil rasmi o‘chirilmadi'));
    return { avatarUrl: avatarUrlOf(stored)! };
  },

  async remove(actor: AuthUser, client: ClientInfo): Promise<void> {
    const previous = (await prisma.user.findUnique({ where: { id: actor.id }, select: { avatarPath: true } }))?.avatarPath ?? null;
    if (!previous) return;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { avatarPath: null } });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'user.avatar_removed', entityType: 'user', entityId: actor.id, ...client });
    });
    await removeStoredFile(previous).catch((error: unknown) => logger.warn({ err: error }, 'Profil rasmi fayli o‘chirilmadi'));
  },

  /**
   * Ochiq endpoint uchun. Yo'l shakli qat'iy tekshiriladi va faqat HOZIR biror foydalanuvchining rasmi bo'lgan fayl
   * beriladi — shu yo'l orqali saqlash papkasidagi boshqa fayllarni (cheklar, hujjatlar) olib bo'lmaydi.
   */
  async file(relativePath: string): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    if (!AVATAR_PATH.test(relativePath)) throw AppError.notFound('Rasm topilmadi');
    const owner = await prisma.user.findFirst({ where: { avatarPath: relativePath, deletedAt: null }, select: { id: true } });
    if (!owner) throw AppError.notFound('Rasm topilmadi');
    return { absolutePath: resolveStoredPath(relativePath), fileName: `avatar.${relativePath.split('.').pop()}`, mimeType: mimeForStoredPath(relativePath) };
  },
};
