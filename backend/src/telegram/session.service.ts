import { prisma } from '../config/database.js';

/**
 * Ko'p qadamli oqim holati.
 *
 * Telegram suhbatni eslamaydi — har xabar alohida keladi. "O'qituvchi 2-guruhni tanladi,
 * endi davomat qo'yyapti" degan holat shu yerda saqlanadi.
 *
 * Qoidalar:
 *  - bitta chatda **bitta** oqim bo'ladi: yangisi boshlansa, eskisi almashtiriladi
 *    (yarim qolgan ish chalkashtirmasin);
 *  - yozuv **muddatli**: foydalanuvchi tashlab ketsa, o'zi yo'qoladi;
 *  - muddati o'tgan yozuv o'qishda ham qaytarilmaydi — tozalash jobiga bog'liq bo'lib qolmaslik uchun.
 */

/** Oqim tashlab ketilgan deb hisoblanadigan muddat */
const TTL_MS = 30 * 60_000;

/** Oqim yo'q, faqat tanlov saqlanadi */
export const IDLE_FLOW = 'idle';

export interface SessionState {
  flow: string;
  step: string;
  data: Record<string, unknown>;
}

export const telegramSessionService = {
  /** Joriy oqim; yo'q yoki muddati o'tgan bo'lsa — null */
  async get(chatId: string, now: Date = new Date()): Promise<SessionState | null> {
    const row = await prisma.telegramSession.findUnique({
      where: { chatId },
      select: { flow: true, step: true, data: true, expiresAt: true },
    });
    if (!row || row.expiresAt <= now) return null;
    return { flow: row.flow, step: row.step, data: (row.data ?? {}) as Record<string, unknown> };
  },

  /** Oqimni boshlaydi yoki keyingi qadamga o'tkazadi (muddat har safar uzayadi) */
  async set(chatId: string, state: SessionState, now: Date = new Date()): Promise<void> {
    const expiresAt = new Date(now.getTime() + TTL_MS);
    const data = state.data as never;
    await prisma.telegramSession.upsert({
      where: { chatId },
      update: { flow: state.flow, step: state.step, data, expiresAt },
      create: { chatId, flow: state.flow, step: state.step, data, expiresAt },
    });
  },

  /** Oqimni tugatadi yoki bekor qiladi */
  async clear(chatId: string): Promise<void> {
    await prisma.telegramSession.deleteMany({ where: { chatId } });
  },

  /**
   * Faqat **oqimni** yopadi, tanlangan farzand (`activeStudentId`) qoladi.
   *
   * Ota-ona boshqa bo'limga o'tganda yarim qolgan topshirish bekor bo'lishi kerak, lekin
   * "qaysi farzand" degan tanlov yo'qolmasligi kerak — aks holda har tugmada qayta so'raladi.
   */
  async clearFlow(chatId: string, now: Date = new Date()): Promise<void> {
    const current = await this.get(chatId, now);
    const active = current?.data.activeStudentId;
    if (typeof active === 'string') {
      await this.set(chatId, { flow: IDLE_FLOW, step: '-', data: { activeStudentId: active } }, now);
      return;
    }
    await prisma.telegramSession.deleteMany({ where: { chatId } });
  },

  /** Muddati o'tganlarini tozalaydi (fon vazifasi uchun) */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const result = await prisma.telegramSession.deleteMany({ where: { expiresAt: { lte: now } } });
    return result.count;
  },
};
