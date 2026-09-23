import { prisma } from '../config/database.js';
import { notificationDeliveryService } from './notificationDelivery.service.js';
import type { NotificationType, Prisma } from '../generated/prisma/client.js';
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
}

const notificationSelect = {
  id: true,
  type: true,
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
    title: notification.title,
    message: notification.message,
    entityType: notification.entityType,
    entityId: notification.entityId,
    isRead: notification.readAt !== null,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

function buildWhere(userId: string, query: Partial<NotificationListQuery>): Prisma.NotificationWhereInput {
  return {
    userId,
    ...(query.unreadOnly ? { readAt: null } : {}),
    ...(query.type ? { type: query.type } : {}),
  };
}

function toCreateData(input: NotificationInput): Prisma.NotificationUncheckedCreateInput {
  return {
    userId: input.userId,
    type: input.type,
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

export const notificationService = {
  /** Asosiy amal bilan bir tranzaksiyada yaratiladi. `dedupeKey` takrorlansa — jimgina o‘tkazib yuboriladi. */
  async createInTransaction(tx: Prisma.TransactionClient, input: NotificationInput): Promise<void> {
    await tx.notification.createMany({ data: [toCreateData(input)], skipDuplicates: true });
    await enqueueExternal(tx, [input]);
  },

  /** Bir nechta xodimga bir xil xabar (masalan, yangi lead haqida barcha managerlarga) */
  async createManyInTransaction(tx: Prisma.TransactionClient, inputs: NotificationInput[]): Promise<void> {
    if (inputs.length === 0) return;
    await tx.notification.createMany({ data: inputs.map(toCreateData), skipDuplicates: true });
    await enqueueExternal(tx, inputs);
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

    return { total, unread: byType.reduce((sum, row) => sum + row.unread, 0), byType };
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
