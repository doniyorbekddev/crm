import { randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { auditService } from './audit.service.js';
import { telegramService } from './telegram.service.js';
import { allowLinkAttempt, registerFailedLinkAttempt, resetLinkAttempts } from '../telegram/linkAttempts.js';
import { routeUpdate } from '../telegram/router.js';
import type { TelegramUpdate } from '../telegram/types.js';

/**
 * Telegram chatini CRM yozuviga bog'lash.
 *
 * Oqim:
 *   1. CRM'da foydalanuvchi "Telegramni ulash" tugmasini bosadi → bir martalik `linkCode` beriladi;
 *   2. u botga `/start <linkCode>` yuboradi;
 *   3. Telegram webhook'ga xabar keladi, imzo (secret token) tekshiriladi;
 *   4. kod topilsa — `chatId` yoziladi va bog'lanish tasdiqlanadi.
 *
 * Kod bir martalik: tasdiqlangandan keyin qayta ishlatilmaydi.
 */

const LINK_CODE_BYTES = 8;

/**
 * Kod shuncha vaqt amal qiladi.
 *
 * Qisqa bo'lishi shart: kod CRM sahifasida ochiq ko'rinadi va ekran surati orqali
 * tarqalishi mumkin. 15 daqiqa — havolani ochib, botga o'tishga yetarli.
 */
const CODE_TTL_MS = 15 * 60_000;

export interface TelegramLinkOwner {
  userId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
}

export interface TelegramLinkDto {
  id: string;
  linkCode: string;
  chatId: string | null;
  chatTitle: string | null;
  verifiedAt: string | null;
  isActive: boolean;
  /** Kod shu vaqtgacha amal qiladi (bog'langandan keyin — null) */
  codeExpiresAt: string | null;
  /** Foydalanuvchiga ko'rsatiladigan havola: https://t.me/<bot>?start=<kod> */
  deepLink: string | null;
}

function toDto(row: {
  id: string;
  linkCode: string;
  chatId: string | null;
  chatTitle: string | null;
  verifiedAt: Date | null;
  isActive: boolean;
  codeExpiresAt: Date | null;
}): TelegramLinkDto {
  const linked = row.verifiedAt !== null;
  return {
    id: row.id,
    linkCode: row.linkCode,
    chatId: row.chatId,
    chatTitle: row.chatTitle,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    isActive: row.isActive,
    // Bog'langandan keyin kod ahamiyatsiz — muddatini ko'rsatish chalkashtiradi
    codeExpiresAt: linked ? null : (row.codeExpiresAt?.toISOString() ?? null),
    deepLink: env.TELEGRAM_BOT_USERNAME ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${row.linkCode}` : null,
  };
}

const linkSelect = {
  id: true,
  linkCode: true,
  chatId: true,
  chatTitle: true,
  verifiedAt: true,
  isActive: true,
  codeExpiresAt: true,
} as const;

function ownerWhere(owner: TelegramLinkOwner) {
  if (owner.userId) return { userId: owner.userId };
  if (owner.studentId) return { studentId: owner.studentId };
  if (owner.parentId) return { parentId: owner.parentId };
  throw AppError.unprocessable('Telegram bog‘lanishi uchun egasi ko‘rsatilmagan');
}

/** Webhook so'rovi haqiqatan Telegramdan kelganini tekshiradi */
export function verifyWebhookSecret(header: string | undefined): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  // Secret sozlanmagan bo'lsa webhook umuman qabul qilinmaydi (ochiq qoldirishdan ko'ra xavfsiz)
  if (!expected) return false;
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Foydalanuvchi uchun bog'lanish egasini aniqlaydi.
 *
 * Muhim: kabinet foydalanuvchisi (o'quvchi/ota-ona) uchun bog'lanish **o'quvchi yoki ota-ona
 * yozuviga** biriktiriladi, `userId` ga emas. Sababi — xabarlar `studentId`/`parentId` bo'yicha
 * yuboriladi (hisobi yo'q ota-onalar ham bor), shuning uchun ikkalasi bir xil kalitda bo'lishi kerak.
 */
export async function ownerForActor(userId: string): Promise<TelegramLinkOwner> {
  const [student, parent] = await Promise.all([
    prisma.student.findFirst({ where: { userId, deletedAt: null }, select: { id: true } }),
    prisma.parent.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  if (student) return { studentId: student.id };
  if (parent) return { parentId: parent.id };
  return { userId };
}

export interface TelegramHealthDto {
  /** Token sozlanganmi va qaysi rejim */
  enabled: boolean;
  mode: 'polling' | 'webhook';
  /** Bog'langan (tasdiqlangan, faol) chatlar */
  linkedChats: number;
  /** Oxirgi kiruvchi hodisa vaqti — bot "jim" bo'lib qolganini ko'rsatadi */
  lastEventAt: string | null;
  /** So'nggi 24 soat: kiruvchi hodisalar va xatolar */
  eventsLast24h: number;
  failedEventsLast24h: number;
  /** Yetkazish navbati */
  pendingDeliveries: number;
  failedDeliveriesLast24h: number;
  sentDeliveriesLast24h: number;
}

export const telegramLinkService = {
  /** Bot sog'lomligi — monitoring uchun (TZ §55): navbat, xatolar, oxirgi faollik */
  async health(now: Date = new Date()): Promise<TelegramHealthDto> {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
    const [linkedChats, lastEvent, eventsLast24h, failedEventsLast24h, pendingDeliveries, failedDeliveriesLast24h, sentDeliveriesLast24h] =
      await Promise.all([
        prisma.telegramLink.count({ where: { verifiedAt: { not: null }, isActive: true, chatId: { not: null } } }),
        prisma.telegramEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.telegramEvent.count({ where: { createdAt: { gte: dayAgo } } }),
        prisma.telegramEvent.count({ where: { createdAt: { gte: dayAgo }, status: 'FAILED' } }),
        prisma.notificationDelivery.count({ where: { status: 'PENDING' } }),
        prisma.notificationDelivery.count({ where: { status: 'FAILED', updatedAt: { gte: dayAgo } } }),
        prisma.notificationDelivery.count({ where: { status: 'SENT', sentAt: { gte: dayAgo } } }),
      ]);
    return {
      enabled: Boolean(env.TELEGRAM_BOT_TOKEN),
      mode: env.TELEGRAM_POLLING ? 'polling' : 'webhook',
      linkedChats,
      lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
      eventsLast24h,
      failedEventsLast24h,
      pendingDeliveries,
      failedDeliveriesLast24h,
      sentDeliveriesLast24h,
    };
  },

  /** Mavjud bog'lanishni qaytaradi yoki yangi kod yaratadi */
  /**
   * Mavjud bog'lanishni qaytaradi yoki **yangi kod** beradi.
   *
   * Kod har safar yangilanmaydi: sahifa ochilgan sayin yangi kod berilsa, foydalanuvchi
   * havolani nusxalab, keyin qaytib kelganda eskisi ishlamay qolardi. Shuning uchun amal
   * qilayotgan kod qaytariladi, **muddati o'tgani** esa almashtiriladi.
   */
  async ensureLink(owner: TelegramLinkOwner, now: Date = new Date()): Promise<TelegramLinkDto> {
    const where = ownerWhere(owner);
    const existing = await prisma.telegramLink.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      select: linkSelect,
    });

    // Allaqachon bog'langan — kod bilan ishimiz yo'q
    if (existing?.verifiedAt) return toDto(existing);

    const stillValid = existing?.codeExpiresAt !== null && existing?.codeExpiresAt !== undefined && existing.codeExpiresAt > now;
    if (existing && stillValid) return toDto(existing);

    const fresh = {
      linkCode: randomBytes(LINK_CODE_BYTES).toString('hex'),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      codeUsedAt: null,
    };

    // Eski yozuv qayta ishlatiladi: yangisini yaratish "bitta egaga bitta bog'lanish"
    // qoidasini buzardi va eski kod ham amal qilib qolardi.
    const saved = existing
      ? await prisma.telegramLink.update({ where: { id: existing.id }, data: fresh, select: linkSelect })
      : await prisma.telegramLink.create({ data: { ...where, ...fresh }, select: linkSelect });

    return toDto(saved);
  },

  async status(owner: TelegramLinkOwner): Promise<TelegramLinkDto | null> {
    const existing = await prisma.telegramLink.findFirst({
      where: ownerWhere(owner),
      orderBy: { createdAt: 'desc' },
      select: linkSelect,
    });
    return existing ? toDto(existing) : null;
  },

  /** Bog'lanishni uzish — yozuv o'chiriladi, keyin yangi kod olish mumkin */
  async unlink(owner: TelegramLinkOwner, actorId?: string | null): Promise<void> {
    const where = ownerWhere(owner);
    const rows = await prisma.telegramLink.findMany({ where, select: { id: true, chatId: true } });
    await prisma.telegramLink.deleteMany({ where });

    for (const row of rows) {
      await auditService.record({
        userId: actorId ?? null,
        action: 'telegram.unlinked',
        entityType: 'telegram_link',
        entityId: row.id,
        metadata: { chatId: row.chatId, source: 'crm' },
        ip: null,
        userAgent: null,
      });
    }
  },

  /**
   * Ishlatilmagan, muddati o'tgan kodlarni tozalaydi.
   *
   * Bog'lanmagan yozuv omborda turib qolsa, unda eski kod ham qolib ketardi.
   * Tasdiqlangan bog'lanishlarga tegilmaydi.
   */
  async purgeExpiredCodes(now: Date = new Date()): Promise<number> {
    const result = await prisma.telegramLink.deleteMany({
      where: { verifiedAt: null, codeExpiresAt: { lte: now } },
    });
    return result.count;
  },

  /**
   * Telegramdan kelgan xabarni qayta ishlaydi.
   *
   * Ikki holat bor:
   *  1. `/start <kod>` — bog'lash. Bu **tasdiqlanmagan** chatdan keladi, shuning uchun shu yerda;
   *  2. boshqa buyruqlar — faqat allaqachon bog'langan chat uchun, javobi
   *     `telegramCommand.service.ts` da tayyorlanadi.
   *
   * Bog'lanmagan chatdan kelgan boshqa har qanday matnga faqat "havoladan foydalaning" deb
   * javob beriladi: bot begona odamga na ma'lumot, na buyruqlar ro'yxatini ko'rsatmaydi.
   */
  async handleUpdate(update: unknown): Promise<{ linked: boolean }> {
    const typed = update as TelegramUpdate;
    const message = typed?.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();

    // Bot **faqat shaxsiy chatda** ishlaydi. Guruh chatidan `/start <kod>` yuborilsa,
    // bog'lanish guruhga tushib, qarz va davomat butun guruhga ketardi. Guruhdagi
    // xabarlar e'tiborsiz qoldiriladi (javob ham yozilmaydi — botni "gapirtirish" mumkin bo'lmasin).
    const chatType = message?.chat?.type ?? typed?.callback_query?.message?.chat?.type;
    if (chatType && chatType !== 'private') return { linked: false };

    // Bog'lash — yagona amal, u **tasdiqlanmagan** chatdan keladi, shuning uchun shu yerda.
    // Qolgan hamma narsa (menyu, tugmalar, buyruqlar) `telegram/router.ts` da.
    const match = chatId !== undefined && text ? /^\/start\s+([A-Za-z0-9]{4,32})$/.exec(text) : null;
    if (!match) {
      await routeUpdate(typed);
      return { linked: false };
    }

    const code = match[1]!;
    const chat = String(chatId);

    // Ketma-ket noto'g'ri kod — kod izlashga urinish. Chat vaqtincha bloklanadi.
    if (!allowLinkAttempt(chat)) {
      await telegramService.sendMessage(chat, 'Juda ko‘p urinish. Biroz kuting va qaytadan urinib ko‘ring.');
      return { linked: false };
    }

    const now = new Date();
    const link = await prisma.telegramLink.findUnique({
      where: { linkCode: code },
      select: { id: true, verifiedAt: true, codeExpiresAt: true, codeUsedAt: true, userId: true, studentId: true, parentId: true },
    });

    // Uch holatda ham **bir xil** javob beriladi: kod bor-yo'qligini bildirib qo'ymaslik uchun.
    //  - kod topilmadi;
    //  - kod allaqachon ishlatilgan (bir martalik — replay himoyasi);
    //  - kod muddati o'tgan yoki muddatsiz eski yozuv.
    const unusable =
      !link ||
      link.verifiedAt !== null ||
      link.codeUsedAt !== null ||
      link.codeExpiresAt === null ||
      link.codeExpiresAt <= now;

    if (unusable) {
      // Bu yerda ham hisoblanadi: to'g'ri kodni topgan odam bloklanmasin, izlagan bloklansin
      registerFailedLinkAttempt(chat);
      await telegramService.sendMessage(chat, 'Kod topilmadi yoki eskirgan. CRM’dan yangi havola oling.');
      return { linked: false };
    }

    resetLinkAttempts(chat);

    // Shu chat boshqa yozuvga bog'langan bo'lsa — eskisi uziladi (bitta chat = bitta egasi)
    await prisma.telegramLink.updateMany({
      where: { chatId: chat, id: { not: link.id } },
      data: { chatId: null, verifiedAt: null },
    });

    const telegramUserId = message?.from?.id === undefined ? null : String(message.from.id);

    await prisma.telegramLink.update({
      where: { id: link.id },
      data: {
        chatId: chat,
        chatTitle: (message?.chat?.first_name ?? message?.chat?.title ?? null)?.slice(0, 150) ?? null,
        telegramUserId,
        verifiedAt: now,
        // Kod ishlatildi — endi u bilan boshqa chat bog'lana olmaydi
        codeUsedAt: now,
        lastSeenAt: now,
        isActive: true,
      },
    });

    // TZ §33: bog'lash audit qilinadi — kim, qachon, qaysi chat
    await auditService.record({
      userId: link.userId,
      action: 'telegram.linked',
      entityType: 'telegram_link',
      entityId: link.id,
      metadata: {
        chatId: chat,
        telegramUserId,
        ...(link.studentId ? { studentId: link.studentId } : {}),
        ...(link.parentId ? { parentId: link.parentId } : {}),
      },
      ip: null,
      userAgent: null,
    });

    await telegramService.sendMessage(chat, 'Telegram muvaffaqiyatli ulandi. Endi eslatmalar shu yerga keladi.');
    logger.info({ linkId: link.id }, 'Telegram bog‘lanishi tasdiqlandi');
    return { linked: true };
  },
};
