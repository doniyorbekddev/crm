import { prisma } from '../config/database.js';
import type { DeliveryChannel, Prisma } from '../generated/prisma/client.js';
import { logger } from '../utils/logger.js';
import { readFile } from 'node:fs/promises';
import { mimeForStoredPath, resolveStoredPath } from '../utils/fileStorage.js';
import { escapeHtml, isTelegramEnabled, telegramService, type InlineKeyboard, type TelegramSendResult } from './telegram.service.js';
import { metrics } from '../utils/metrics.js';

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
/** Bir chaqiruvda ko'pi bilan: 40 × 25 = 1000 xabar/daqiqa (Telegram umumiy chegarasi ~30/s dan past) */
const MAX_BATCHES = 40;
/** Daqiqalik job keyingi yurishga ulgurishi uchun */
const RUN_BUDGET_MS = 50_000;

type QueueItem = {
  id: string;
  title: string;
  body: string;
  mediaKind: string | null;
  mediaFileId: string | null;
  buttons: Prisma.JsonValue;
  broadcastId: string | null;
  broadcast: { mediaPath: string | null; mediaFileName: string | null; mediaFileId: string | null } | null;
};

/** `[{ text, url }]` → bitta ustunli havola tugmalari */
function urlKeyboard(buttons: Prisma.JsonValue): InlineKeyboard | undefined {
  if (!Array.isArray(buttons)) return undefined;
  const rows = buttons
    .filter((button): button is { text: string; url: string } => typeof button === 'object' && button !== null && typeof (button as { text?: unknown }).text === 'string' && typeof (button as { url?: unknown }).url === 'string')
    .map((button) => [{ text: button.text, url: button.url, data: '' }]);
  return rows.length ? rows : undefined;
}

/**
 * Bitta yozuvni yuboradi: matn, file_id bo'yicha media yoki web'dan yuklangan fayl (birinchi marta yuklanadi,
 * olingan file_id broadcast va uning kutayotgan yozuvlariga yoziladi — qolganlar qayta yuklamaydi).
 */
async function sendItem(chatId: string, item: QueueItem, uploaded: Map<string, string>): Promise<TelegramSendResult> {
  // Broadcast matni navbatga yozishda allaqachon HTML-escape qilingan — ikkinchi marta emas
  // (aks holda "<dars>" Telegramda "&lt;dars&gt;" bo'lib ko'rinardi)
  const body = item.broadcastId ? item.body : escapeHtml(item.body);
  const text = `<b>${escapeHtml(item.title)}</b>\n${body}`;
  const keyboard = urlKeyboard(item.buttons);
  const kind = item.mediaKind === 'photo' || item.mediaKind === 'document' ? item.mediaKind : null;
  if (!kind) return telegramService.sendMessage(chatId, text, keyboard);

  const fileId = item.mediaFileId ?? (item.broadcastId ? (uploaded.get(item.broadcastId) ?? item.broadcast?.mediaFileId ?? null) : null);
  if (fileId) return telegramService.sendMedia(chatId, { kind, fileId }, text, keyboard);

  const stored = item.broadcast?.mediaPath;
  if (!stored || !item.broadcastId) return { ok: false, retryable: false, error: 'Fayl topilmadi' };
  let buffer: Buffer;
  try {
    buffer = await readFile(resolveStoredPath(stored));
  } catch {
    return { ok: false, retryable: false, error: 'Fayl CRM xotirasida topilmadi' };
  }
  const result = await telegramService.sendMedia(chatId, { kind, buffer, fileName: item.broadcast?.mediaFileName ?? 'fayl', mimeType: mimeForStoredPath(stored) }, text, keyboard);
  if (result.ok && result.fileId) {
    uploaded.set(item.broadcastId, result.fileId);
    await prisma.$transaction([
      prisma.telegramBroadcast.update({ where: { id: item.broadcastId }, data: { mediaFileId: result.fileId } }),
      prisma.notificationDelivery.updateMany({ where: { broadcastId: item.broadcastId, mediaFileId: null }, data: { mediaFileId: result.fileId } }),
    ]);
  }
  return result;
}

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
   *
   * TZ 3.1 GAP-15 (katta auditoriya): bitta chaqiruvda bir nechta partiya — navbat bo'shaguncha yoki
   * vaqt/partiya chegarasigacha (daqiqalik job keyingisiga yetib qolmasin). Bir chaqiruvda har yozuv
   * **ko'pi bilan bir marta** urinadi (qayta urinish — faqat keyingi chaqiruvda, backoff bilan).
   * 429 (`retry_after`) — urinish hisoblanmaydi, shu partiyadagi qolganlar ham shuncha kutadi va
   * chaqiruv to'xtaydi (Telegram cheklovini buzmaslik uchun).
   */
  async processQueue(now: Date = new Date(), options: { maxBatches?: number; budgetMs?: number } = {}): Promise<{ sent: number; failed: number; skipped: number }> {
    const maxBatches = options.maxBatches ?? MAX_BATCHES;
    const deadline = Date.now() + (options.budgetMs ?? RUN_BUDGET_MS);
    const seen: string[] = [];
    /** Web'dan yuklangan broadcast fayli: birinchi yuborishda olingan file_id (partiyalar orasida) */
    const uploaded = new Map<string, string>();

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let throttled = false;

    for (let batch = 0; batch < maxBatches && !throttled && Date.now() < deadline; batch += 1) {
      const pending = await prisma.notificationDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: now }, ...(seen.length ? { id: { notIn: seen } } : {}) },
        orderBy: { nextAttemptAt: 'asc' },
        take: BATCH_SIZE,
        select: {
          id: true,
          title: true,
          body: true,
          attempts: true,
          mediaKind: true,
          mediaFileId: true,
          buttons: true,
          broadcastId: true,
          broadcast: { select: { mediaPath: true, mediaFileName: true, mediaFileId: true } },
          telegramLink: { select: { chatId: true, isActive: true, verifiedAt: true } },
        },
      });
      if (pending.length === 0) break;

      for (const [index, item] of pending.entries()) {
        seen.push(item.id);
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

        const result = await sendItem(chatId, item, uploaded);
        const attempts = item.attempts + 1;

        if (result.ok) {
          await prisma.notificationDelivery.update({
            where: { id: item.id },
            data: { status: 'SENT', attempts, sentAt: new Date(), lastError: null },
          });
          sent += 1;
          continue;
        }

        if (result.retryAfter) {
          // Telegram "sekinroq" dedi: bu va partiyadagi qolganlar shuncha kutadi; urinish sanalmaydi
          const until = new Date(Date.now() + result.retryAfter * 1000);
          const rest = pending.slice(index).map((row) => row.id);
          await prisma.notificationDelivery.updateMany({ where: { id: { in: rest }, status: 'PENDING' }, data: { nextAttemptAt: until, lastError: result.error ?? null } });
          throttled = true;
          break;
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
        if (giveUp) {
          failed += 1;
          metrics.notificationFailures.inc({ channel: 'TELEGRAM' });
        }
      }
      if (pending.length < BATCH_SIZE) break;
    }

    if (sent > 0 || failed > 0) {
      logger.info({ sent, failed, skipped, telegram: isTelegramEnabled() }, 'Telegram navbati qayta ishlandi');
    }
    return { sent, failed, skipped };
  },
};
