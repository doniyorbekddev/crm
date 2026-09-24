import { randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { telegramService } from './telegram.service.js';
import { buildCommandReply, resolveCommandScope } from './telegramCommand.service.js';

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
}): TelegramLinkDto {
  return {
    id: row.id,
    linkCode: row.linkCode,
    chatId: row.chatId,
    chatTitle: row.chatTitle,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    isActive: row.isActive,
    deepLink: env.TELEGRAM_BOT_USERNAME ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${row.linkCode}` : null,
  };
}

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

/**
 * Bog'langan chatdan kelgan buyruqqa javob beradi.
 *
 * Chat tasdiqlanmagan yoki o'chirilgan bo'lsa — hech qanday ma'lumot berilmaydi.
 */
async function handleCommand(chatId: string, text: string): Promise<void> {
  const link = await prisma.telegramLink.findFirst({
    where: { chatId, isActive: true, verifiedAt: { not: null } },
    select: { id: true, userId: true, studentId: true, parentId: true },
  });
  if (!link) {
    await telegramService.sendMessage(chatId, 'Bog‘lash uchun CRM’dagi havoladan foydalaning.');
    return;
  }

  const scope = await resolveCommandScope(link);
  if (!scope) {
    // Egasi o'chirilgan (masalan, o'quvchi arxivlangan) — bog'lanish ham yopiladi
    await prisma.telegramLink.update({ where: { id: link.id }, data: { isActive: false } });
    await telegramService.sendMessage(chatId, 'Bog‘lanish egasi topilmadi. CRM’dan yangi havola oling.');
    return;
  }

  const { reply, unlink } = await buildCommandReply(scope, text);
  if (unlink) {
    await prisma.telegramLink.delete({ where: { id: link.id } });
  }
  await telegramService.sendMessage(chatId, reply);
}

export const telegramLinkService = {
  /** Mavjud bog'lanishni qaytaradi yoki yangi kod yaratadi */
  async ensureLink(owner: TelegramLinkOwner): Promise<TelegramLinkDto> {
    const where = ownerWhere(owner);
    const existing = await prisma.telegramLink.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, linkCode: true, chatId: true, chatTitle: true, verifiedAt: true, isActive: true },
    });
    if (existing) return toDto(existing);

    const created = await prisma.telegramLink.create({
      data: { ...where, linkCode: randomBytes(LINK_CODE_BYTES).toString('hex') },
      select: { id: true, linkCode: true, chatId: true, chatTitle: true, verifiedAt: true, isActive: true },
    });
    return toDto(created);
  },

  async status(owner: TelegramLinkOwner): Promise<TelegramLinkDto | null> {
    const existing = await prisma.telegramLink.findFirst({
      where: ownerWhere(owner),
      orderBy: { createdAt: 'desc' },
      select: { id: true, linkCode: true, chatId: true, chatTitle: true, verifiedAt: true, isActive: true },
    });
    return existing ? toDto(existing) : null;
  },

  /** Bog'lanishni uzish — yozuv o'chiriladi, keyin yangi kod olish mumkin */
  async unlink(owner: TelegramLinkOwner): Promise<void> {
    await prisma.telegramLink.deleteMany({ where: ownerWhere(owner) });
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
    const message = (update as { message?: { chat?: { id?: number | string; first_name?: string; title?: string }; text?: string } })
      ?.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();
    if (!chatId || !text) return { linked: false };

    const match = /^\/start\s+([A-Za-z0-9]{4,32})$/.exec(text);
    if (!match) {
      await handleCommand(String(chatId), text);
      return { linked: false };
    }

    const code = match[1]!;
    const link = await prisma.telegramLink.findUnique({
      where: { linkCode: code },
      select: { id: true, verifiedAt: true },
    });
    if (!link) {
      await telegramService.sendMessage(String(chatId), 'Kod topilmadi yoki eskirgan. CRM’dan yangi havola oling.');
      return { linked: false };
    }

    // Shu chat boshqa yozuvga bog'langan bo'lsa — eskisi uziladi (bitta chat = bitta egasi)
    await prisma.telegramLink.updateMany({
      where: { chatId: String(chatId), id: { not: link.id } },
      data: { chatId: null, verifiedAt: null },
    });

    await prisma.telegramLink.update({
      where: { id: link.id },
      data: {
        chatId: String(chatId),
        chatTitle: (message?.chat?.first_name ?? message?.chat?.title ?? null)?.slice(0, 150) ?? null,
        verifiedAt: new Date(),
        isActive: true,
      },
    });

    await telegramService.sendMessage(
      String(chatId),
      'Telegram muvaffaqiyatli ulandi. Endi eslatmalar shu yerga keladi.',
    );
    logger.info({ linkId: link.id }, 'Telegram bog‘lanishi tasdiqlandi');
    return { linked: true };
  },
};
