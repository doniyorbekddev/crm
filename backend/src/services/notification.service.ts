import { prisma } from '../config/database.js';
import { NOTIFICATION_PRIORITY, isMutableNotificationType } from '../config/notificationTypes.js';
import { notificationDeliveryService } from './notificationDelivery.service.js';
import { NotificationType } from '../generated/prisma/enums.js';
import type { NotificationPriority, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { NotificationListQuery } from '../validators/notification.validator.js';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  /** Bir xil bildirishnoma ikki marta yaratilmasligi uchun */
  dedupeKey?: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSummaryDto {
  total: number;
  unread: number;
  /** Turlar bo‘yicha o‘qilmaganlar */
  byType: Array<{ type: NotificationType; unread: number }>;
  /** Muhim (HIGH) va o‘qilmaganlar — qo‘ng‘iroqcha ularni alohida ko‘rsatadi */
  unreadHigh: number;
}

export interface NotificationSettingDto {
  type: NotificationType;
  inApp: boolean;
  telegram: boolean;
  priority: NotificationPriority;
  /** `false` bo‘lsa — o‘chirib bo‘lmaydigan tur (masalan, tizim xabarlari) */
  canMute: boolean;
}

const notificationSelect = {
  id: true,
  type: true,
  priority: true,
  title: true,
  message: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

function toDto(notification: NotificationRecord): NotificationDto {
  return {
    id: notification.id,
    type: notification.type,
    priority: notification.priority,
    title: notification.title,
    message: notification.message,
    entityType: notification.entityType,
    entityId: notification.entityId,
    isRead: notification.readAt !== null,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function buildWhere(userId: string, query: Partial<NotificationListQuery>): Prisma.NotificationWhereInput {
  return {
    userId,
    ...(query.unreadOnly ? { readAt: null } : {}),
    ...(query.readOnly ? { readAt: { not: null } } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: dayStart(query.from) } : {}),
            // "to" kuni ham kiradi — shuning uchun keyingi kun boshigacha
            ...(query.to ? { lt: new Date(dayStart(query.to).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };
}

function toCreateData(input: NotificationInput): Prisma.NotificationUncheckedCreateInput {
  return {
    userId: input.userId,
    type: input.type,
    // Daraja turga bog'langan — chaqiruvchi uni yozmaydi
    priority: NOTIFICATION_PRIORITY[input.type],
    title: input.title,
    message: input.message,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    dedupeKey: input.dedupeKey ?? null,
  };
}

/**
 * Ilova ichidagi bildirishnoma yaratilgandan keyin uni tashqi kanal (Telegram) navbatiga ham
 * qo'shadi. Navbat bo'sh o'tishi mumkin — foydalanuvchi Telegramni ulamagan bo'lsa hech nima
 * yaratilmaydi va bu xato emas.
 */
async function enqueueExternal(tx: Prisma.TransactionClient, inputs: NotificationInput[]): Promise<void> {
  for (const input of inputs) {
    await notificationDeliveryService.enqueueInTransaction(tx, {
      title: input.title,
      body: input.message,
      target: { userId: input.userId },
      dedupeKey: input.dedupeKey ?? null,
    });
  }
}

/**
 * Xodimlarning o'chirib qo'ygan turlarini olib tashlaydi.
 *
 * Sozlama jadvalida qator **faqat standart o'zgartirilganda** bo'ladi, shuning uchun bu yerda
 * ham "qator yo'q = yoqilgan" qoidasi ishlaydi. O'chirib bo'lmaydigan turlar (tizim xabarlari)
 * sozlamadan qat'i nazar o'tkaziladi.
 */
async function applySettings(
  tx: Prisma.TransactionClient,
  inputs: NotificationInput[],
): Promise<{ inApp: NotificationInput[]; telegram: NotificationInput[] }> {
  const mutable = inputs.filter((input) => isMutableNotificationType(input.type));
  if (mutable.length === 0) return { inApp: inputs, telegram: inputs };

  const rows = await tx.notificationSetting.findMany({
    where: {
      userId: { in: [...new Set(mutable.map((input) => input.userId))] },
      type: { in: [...new Set(mutable.map((input) => input.type))] },
      // Ikkala kanali ham yoqilgan qator filtrga ta'sir qilmaydi — uni tortib o'tirmaymiz
      OR: [{ inApp: false }, { telegram: false }],
    },
    select: { userId: true, type: true, inApp: true, telegram: true },
  });
  if (rows.length === 0) return { inApp: inputs, telegram: inputs };

  const byKey = new Map(rows.map((row) => [`${row.userId}:${row.type}`, row]));
  const allowed = (input: NotificationInput, channel: 'inApp' | 'telegram'): boolean => {
    if (!isMutableNotificationType(input.type)) return true;
    const setting = byKey.get(`${input.userId}:${input.type}`);
    return setting ? setting[channel] : true;
  };

  return {
    inApp: inputs.filter((input) => allowed(input, 'inApp')),
    telegram: inputs.filter((input) => allowed(input, 'telegram')),
  };
}

export const notificationService = {
  /** Asosiy amal bilan bir tranzaksiyada yaratiladi. `dedupeKey` takrorlansa — jimgina o‘tkazib yuboriladi. */
  async createInTransaction(tx: Prisma.TransactionClient, input: NotificationInput): Promise<void> {
    await this.createManyInTransaction(tx, [input]);
  },

  /**
   * Bir nechta xodimga bir xil xabar (masalan, yangi lead haqida barcha managerlarga).
   * `channels` — avtomatlashtirish qoidasi kanalni cheklashi mumkin (TZ §51 "Channel");
   * foydalanuvchi sozlamasi baribir ustun (o'chirgan kanaliga yuborilmaydi).
   */
  async createManyInTransaction(tx: Prisma.TransactionClient, inputs: NotificationInput[], channels: { inApp: boolean; telegram: boolean } = { inApp: true, telegram: true }): Promise<void> {
    if (inputs.length === 0) return;
    const allowed = await applySettings(tx, inputs);
    if (channels.inApp && allowed.inApp.length > 0) {
      await tx.notification.createMany({ data: allowed.inApp.map(toCreateData), skipDuplicates: true });
    }
    if (channels.telegram) await enqueueExternal(tx, allowed.telegram);
  },

  /**
   * Hisobi yo'q qabul qiluvchi (o'quvchi yoki ota-ona) uchun faqat tashqi kanal.
   * Ilova ichida ko'rsatiladigan joyi yo'q, shuning uchun `Notification` yozuvi yaratilmaydi.
   */
  async notifyExternalInTransaction(
    tx: Prisma.TransactionClient,
    input: { title: string; message: string; studentId?: string | null; parentId?: string | null; dedupeKey?: string | null },
  ): Promise<number> {
    return notificationDeliveryService.enqueueInTransaction(tx, {
      title: input.title,
      body: input.message,
      target: { studentId: input.studentId ?? null, parentId: input.parentId ?? null },
      dedupeKey: input.dedupeKey ?? null,
    });
  },

  async list(actor: AuthUser, query: NotificationListQuery): Promise<{ items: NotificationDto[]; total: number }> {
    const where = buildWhere(actor.id, query);
    const items = await prisma.notification.findMany({
      where,
      select: notificationSelect,
      // Bir vaqtda yaratilgan bildirishnomalarda ham sahifalash barqaror bo'lishi uchun ikkinchi kalit
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.notification.count({ where });
    return { items: items.map(toDto), total };
  },

  /** Qo‘ng‘iroqcha uchun: umumiy va o‘qilmaganlar soni */
  async summary(actor: AuthUser): Promise<NotificationSummaryDto> {
    const total = await prisma.notification.count({ where: { userId: actor.id } });
    const grouped = await prisma.notification.groupBy({
      by: ['type'],
      where: { userId: actor.id, readAt: null },
      _count: { _all: true },
    });

    const byType = grouped
      .map((row) => ({ type: row.type, unread: row._count._all }))
      .sort((a, b) => b.unread - a.unread);

    const unreadHigh = grouped
      .filter((row) => NOTIFICATION_PRIORITY[row.type] === 'HIGH')
      .reduce((sum, row) => sum + row._count._all, 0);

    return { total, unread: byType.reduce((sum, row) => sum + row.unread, 0), byType, unreadHigh };
  },

  /**
   * Xodimning sozlamalari — **barcha turlar** qaytariladi, jadvalda qatori bo'lmagani
   * "yoqilgan" holatida ko'rinadi. Shu tufayli yangi tur qo'shilishi bilan sozlamada ham
   * o'zidan paydo bo'ladi.
   */
  async settings(actor: AuthUser): Promise<NotificationSettingDto[]> {
    const rows = await prisma.notificationSetting.findMany({
      where: { userId: actor.id },
      select: { type: true, inApp: true, telegram: true },
    });
    const byType = new Map(rows.map((row) => [row.type, row]));

    return Object.values(NotificationType).map((type) => {
      const stored = byType.get(type);
      const canMute = isMutableNotificationType(type);
      return {
        type,
        inApp: canMute ? (stored?.inApp ?? true) : true,
        telegram: canMute ? (stored?.telegram ?? true) : true,
        priority: NOTIFICATION_PRIORITY[type],
        canMute,
      };
    });
  },

  /**
   * Sozlamani saqlaydi. O'chirib bo'lmaydigan tur yuborilsa — 422, chunki jimgina
   * e'tiborsiz qoldirilsa xodim "o'chirdim" deb o'ylab yurardi.
   */
  async saveSettings(actor: AuthUser, items: Array<{ type: NotificationType; inApp: boolean; telegram: boolean }>): Promise<NotificationSettingDto[]> {
    const locked = items.find((item) => !isMutableNotificationType(item.type));
    if (locked) {
      throw AppError.unprocessable('Bu turni o‘chirib bo‘lmaydi', [
        { field: 'type', message: 'Tizim xabarlari har doim yuboriladi' },
      ]);
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.notificationSetting.upsert({
          where: { userId_type: { userId: actor.id, type: item.type } },
          update: { inApp: item.inApp, telegram: item.telegram },
          create: { userId: actor.id, type: item.type, inApp: item.inApp, telegram: item.telegram },
        }),
      ),
    );
    return this.settings(actor);
  },

  async markRead(actor: AuthUser, id: string): Promise<NotificationDto> {
    const notification = await prisma.notification.findFirst({
      where: { id, userId: actor.id },
      select: { id: true, readAt: true },
    });
    if (!notification) {
      throw AppError.notFound('Bildirishnoma topilmadi');
    }
    if (notification.readAt) {
      return toDto(await prisma.notification.findUniqueOrThrow({ where: { id }, select: notificationSelect }));
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: notificationSelect,
    });
    return toDto(updated);
  },

  /** Hammasini o‘qilgan deb belgilaydi, nechtasi belgilangani qaytariladi */
  async markAllRead(actor: AuthUser): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  },

  async remove(actor: AuthUser, id: string): Promise<void> {
    const notification = await prisma.notification.findFirst({ where: { id, userId: actor.id }, select: { id: true } });
    if (!notification) {
      throw AppError.notFound('Bildirishnoma topilmadi');
    }
    await prisma.notification.delete({ where: { id } });
  },

  /** O‘qilganlarni tozalash (foydalanuvchi o‘zi uchun) */
  async clearRead(actor: AuthUser): Promise<number> {
    const result = await prisma.notification.deleteMany({ where: { userId: actor.id, readAt: { not: null } } });
    return result.count;
  },
};
