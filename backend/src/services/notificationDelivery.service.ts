import { prisma } from '../config/database.js';
import type { DeliveryChannel, Prisma } from '../generated/prisma/client.js';
import { logger } from '../utils/logger.js';
import { escapeHtml, isTelegramEnabled, telegramService } from './telegram.service.js';

/**
 * Yetkazish navbati (outbox).
 *
 * Nima uchun navbat: tashqi kanalga (Telegram) yuborish sekin va ishonchsiz bo'lishi mumkin.
 * Agar uni to'g'ridan-to'g'ri asosiy tranzaksiyada qilsak — davomat belgilash yoki to'lov
 * qabul qilish Telegram sekinlashganda kutib qolardi. Shuning uchun:
 *   1. asosiy amal bilan bitta tranzaksiyada faqat **yozuv** qo'shiladi (PENDING);
 *   2. fon vazifasi uni olib yuboradi va xatolikda `nextAttemptAt` ni orqaga suradi.
 *
 * Takrorlanishdan himoya: `dedupeKey` = `<bildirishnoma dedupeKey>:<kanal>` — bir nechta
 * server nusxasi ishlaganda ham bitta xabar ikki marta ketmaydi.
 */

const MAX_ATTEMPTS = 5;
/** Urinishlar orasidagi kutish: 1, 4, 9, 16 daqiqa (attempt²) */
const BACKOFF_BASE_MS = 60_000;
const BATCH_SIZE = 25;

export interface EnqueueInput {
  notificationId?: string | null;
  title: string;
  body: string;
  /** Kimga: shu egalardan biri bo'yicha bog'langan Telegram chatlari topiladi */
  target: { userId?: string | null; studentId?: string | null; parentId?: string | null };
  /** Bildirishnomaning dedupe kaliti (bo'lsa) — kanal qo'shilib unikal kalit yasaladi */
  dedupeKey?: string | null;
}

type Tx = Prisma.TransactionClient;

function backoffFor(attempts: number): Date {
  return new Date(Date.now() + BACKOFF_BASE_MS * attempts * attempts);
}

/** Qabul qiluvchining tasdiqlangan va faol Telegram chatlari */
async function findChats(tx: Tx, target: EnqueueInput['target']) {
  const owner: Prisma.TelegramLinkWhereInput[] = [];
  if (target.userId) owner.push({ userId: target.userId });
  if (target.studentId) owner.push({ studentId: target.studentId });
  if (target.parentId) owner.push({ parentId: target.parentId });
  if (owner.length === 0) return [];

  // Ovozsiz (bot "Sozlamalar"da eslatmalar o'chirilgan) chatga avtomatik eslatma ketmaydi
  return tx.telegramLink.findMany({
    where: { OR: owner, verifiedAt: { not: null }, isActive: true, muted: false, chatId: { not: null } },
    select: { id: true },
  });
}

export const notificationDeliveryService = {
  /**
   * Navbatga qo'shadi. Asosiy amal bilan **bitta tranzaksiyada** chaqiriladi, shuning uchun
   * amal bekor bo'lsa xabar ham navbatda qolmaydi.
   */
  async enqueueInTransaction(tx: Tx, input: EnqueueInput): Promise<number> {
    const chats = await findChats(tx, input.target);
    if (chats.length === 0) return 0;

    const channel: DeliveryChannel = 'TELEGRAM';
    const rows = chats.map((chat) => ({
      notificationId: input.notificationId ?? null,
      channel,
      telegramLinkId: chat.id,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}:${chat.id}`.slice(0, 200) : null,
    }));

    const result = await tx.notificationDelivery.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  },

  /**
   * Navbatdagi xabarlarni yuboradi. Har bir yozuv alohida yangilanadi — bittasining xatosi
   * qolganlarini to'xtatmaydi.
   */
  async processQueue(now: Date = new Date()): Promise<{ sent: number; failed: number; skipped: number }> {
    const pending = await prisma.notificationDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        title: true,
        body: true,
        attempts: true,
        mediaKind: true,
        mediaFileId: true,
        broadcastId: true,
        telegramLink: { select: { chatId: true, isActive: true, verifiedAt: true } },
      },
    });
    if (pending.length === 0) return { sent: 0, failed: 0, skipped: 0 };

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of pending) {
      const chatId = item.telegramLink?.chatId;
      const usable = chatId && item.telegramLink?.isActive && item.telegramLink.verifiedAt;

      if (!usable) {
        // Bog'lanish uzilgan yoki o'chirilgan — qayta urinishdan ma'no yo'q
        await prisma.notificationDelivery.update({
          where: { id: item.id },
          data: { status: 'SKIPPED', lastError: 'Telegram bog‘lanishi faol emas' },
        });
        skipped += 1;
        continue;
      }

      // Broadcast matni navbatga yozishda allaqachon HTML-escape qilingan — ikkinchi marta emas
      // (aks holda "<dars>" Telegramda "&lt;dars&gt;" bo'lib ko'rinardi)
      const body = item.broadcastId ? item.body : escapeHtml(item.body);
      const text = `<b>${escapeHtml(item.title)}</b>\n${body}`;
      // Broadcast media: xodim yuborgan rasm/hujjat file_id orqali, matn — izoh sifatida
      const result =
        item.mediaFileId && (item.mediaKind === 'photo' || item.mediaKind === 'document')
          ? await telegramService.sendMedia(chatId, { kind: item.mediaKind, fileId: item.mediaFileId }, text)
          : await telegramService.sendMessage(chatId, text);
      const attempts = item.attempts + 1;

      if (result.ok) {
        await prisma.notificationDelivery.update({
          where: { id: item.id },
          data: { status: 'SENT', attempts, sentAt: new Date(), lastError: null },
        });
        sent += 1;
        continue;
      }

      const giveUp = !result.retryable || attempts >= MAX_ATTEMPTS;
      await prisma.notificationDelivery.update({
        where: { id: item.id },
        data: {
          status: giveUp ? 'FAILED' : 'PENDING',
          attempts,
          lastError: result.error ?? null,
          nextAttemptAt: giveUp ? undefined : backoffFor(attempts),
        },
      });
      if (giveUp) failed += 1;
    }

    if (sent > 0 || failed > 0) {
      logger.info({ sent, failed, skipped, telegram: isTelegramEnabled() }, 'Telegram navbati qayta ishlandi');
    }
    return { sent, failed, skipped };
  },
};
