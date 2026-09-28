import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { removeStoredFile } from '../utils/fileStorage.js';

/**
 * TZ 3.1 PHASE 21 — yetim fayllar. Ba'zi fayllar diskka **bog'lanishdan oldin** yoziladi: bot vazifa
 * qoralamasidagi fayl (oqim tashlab ketilishi mumkin) va web broadcast media (token olinib, xabar yuborilmasligi
 * mumkin). Ular `pending_uploads`ga yoziladi; bog'langanda yozuv o'chiriladi. Tozalash jobi 24 soatdan eski
 * yozuvlarni ko'radi va faylni **faqat** uni hech bir ustun ishlatmasa o'chiradi.
 */
export const PENDING_UPLOAD_KIND = {
  HOMEWORK_ATTACHMENT: 'homework_attachment',
  BROADCAST_MEDIA: 'broadcast_media',
} as const;
export type PendingUploadKind = (typeof PENDING_UPLOAD_KIND)[keyof typeof PENDING_UPLOAD_KIND];

/** Bot oqimi 30 daqiqa, media token 1 soat — 24 soat katta zaxira */
export const PENDING_UPLOAD_MAX_AGE_MS = 24 * 60 * 60_000;
const SWEEP_BATCH = 200;

type Client = Prisma.TransactionClient | typeof prisma;

/** Fayl ishlatilayaptimi — tur bo'yicha aniq ustun (boshqa turdagi tasodifiy moslik hisobga olinmaydi) */
async function isReferenced(path: string, kind: string): Promise<boolean> {
  if (kind === PENDING_UPLOAD_KIND.BROADCAST_MEDIA) {
    return (await prisma.telegramBroadcast.count({ where: { mediaPath: path } })) > 0;
  }
  if (kind === PENDING_UPLOAD_KIND.HOMEWORK_ATTACHMENT) {
    return (await prisma.homeworkAttachment.count({ where: { storagePath: path } })) > 0;
  }
  // Noma'lum tur — xavfsiz tomonga: o'chirmaymiz
  return true;
}

export const pendingUploadService = {
  async track(path: string, kind: PendingUploadKind, client: Client = prisma): Promise<void> {
    await client.pendingUpload.upsert({ where: { path }, create: { path, kind }, update: {} });
  },

  async release(paths: string[], client: Client = prisma): Promise<void> {
    if (paths.length === 0) return;
    await client.pendingUpload.deleteMany({ where: { path: { in: paths } } });
  },

  /**
   * Muddati o'tgan yozuvlar: ishlatilmayotgan fayl diskdan o'chiriladi, ishlatilayotgani — faqat yozuv.
   * Fayl o'chmasa (disk xatosi) yozuv qoladi va keyingi yurishda qayta uriniladi.
   */
  async sweep(now: Date = new Date(), maxAgeMs: number = PENDING_UPLOAD_MAX_AGE_MS): Promise<{ removed: number; kept: number; failed: number }> {
    const rows = await prisma.pendingUpload.findMany({
      where: { createdAt: { lt: new Date(now.getTime() - maxAgeMs) } },
      orderBy: { createdAt: 'asc' },
      take: SWEEP_BATCH,
    });
    const result = { removed: 0, kept: 0, failed: 0 };
    for (const row of rows) {
      if (await isReferenced(row.path, row.kind)) {
        result.kept += 1;
      } else {
        try {
          await removeStoredFile(row.path);
          result.removed += 1;
        } catch {
          result.failed += 1;
          continue;
        }
      }
      await prisma.pendingUpload.delete({ where: { path: row.path } }).catch(() => undefined);
    }
    return result;
  },
};
