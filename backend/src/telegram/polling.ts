import { env } from '../config/env.js';
import { telegramService } from '../services/telegram.service.js';
import { telegramLinkService } from '../services/telegramLink.service.js';
import { logger } from '../utils/logger.js';

/**
 * Sinov rejimi: bot Telegramdan yangiliklarni **o'zi so'rab** turadi (long polling).
 *
 * Nega kerak: webhook uchun Telegram yeta oladigan ochiq HTTPS manzil kerak, `localhost`
 * esa bunday emas. Tunnel qo'yish har safar tayyorgarlik talab qiladi, shuning uchun
 * ishlab chiqishda polling — eng qisqa yo'l. Productionda **webhook** ishlatiladi.
 *
 * Muhim: bitta botda ikkalasi birga ishlamaydi — Telegram webhook o'rnatilgan bo'lsa
 * `getUpdates` ni 409 bilan rad etadi. Shuning uchun boshlanishda webhook o'chiriladi.
 *
 * Update'lar **ketma-ket** ishlanadi: bitta odam tez-tez tugma bossa ham tartib saqlanadi
 * va bir vaqtning o'zida ikkita javob yozilmaydi.
 */

/** Telegram shuncha soniya kutadi, yangilik bo'lmasa bo'sh javob qaytaradi */
const LONG_POLL_SECONDS = 25;
/** Xatodan keyin qayta urinishdan oldin kutish — Telegramga tinmay urilmaslik uchun */
const ERROR_BACKOFF_MS = 5_000;

function updateIdOf(update: unknown): number | null {
  const id = (update as { update_id?: unknown })?.update_id;
  return typeof id === 'number' ? id : null;
}

/**
 * Bir partiya update'ni ketma-ket ishlaydi va yangi `offset` ni qaytaradi.
 *
 * Alohida funksiya — offset mantiqi eng nozik joy: noto'g'ri surilsa xabar yo'qoladi
 * yoki cheksiz takrorlanadi. Shuning uchun u testda tekshiriladi.
 */
export async function processUpdates(updates: readonly unknown[], offset: number): Promise<number> {
  let next = offset;
  for (const update of updates) {
    const id = updateIdOf(update);
    try {
      await telegramLinkService.handleUpdate(update);
    } catch (error) {
      // Bitta xato butun tsiklni to'xtatmaydi — keyingi xabar ishlanaveradi.
      // Offset baribir suriladi: aks holda xato beradigan xabar abadiy takrorlanardi.
      logger.error({ err: error, updateId: id }, 'Telegram update ishlanmadi');
    }
    if (id !== null && id + 1 > next) next = id + 1;
  }
  return next;
}

export function startTelegramPolling(): () => void {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_POLLING yoqilgan, lekin TELEGRAM_BOT_TOKEN yo‘q — bot ishga tushmadi');
    return () => undefined;
  }

  let stopped = false;
  // Telegram `offset` dan kichik update'larni o'chiradi, shuning uchun u faqat
  // update ishlangandan keyin suriladi: dastur to'xtasa, ishlanmagan xabar yo'qolmaydi.
  let offset = 0;

  const loop = async (): Promise<void> => {
    const removed = await telegramService.deleteWebhook();
    logger.info({ webhookRemoved: removed }, 'Telegram polling rejimi ishga tushdi');

    while (!stopped) {
      try {
        const updates = await telegramService.getUpdates(offset, LONG_POLL_SECONDS);
        offset = await processUpdates(updates, offset);
      } catch (error) {
        logger.error({ err: error }, 'Telegram polling xatosi');
        await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS));
      }
    }

    logger.info('Telegram polling to‘xtadi');
  };

  void loop();

  return () => {
    stopped = true;
  };
}
