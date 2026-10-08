import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { AssignAlertInput, SnoozeInput } from '../validators/alert.validator.js';
import type { TaskCreateInput } from '../validators/task.validator.js';
import { alertLinkFor, alertSelect, alertService, toAlertDto } from './alert.service.js';
import type { AlertDto } from './alert.service.js';
import { auditService } from './audit.service.js';
import { getBranchAccess } from './branchAccess.js';
import { notificationService } from './notification.service.js';
import type { NotificationDto } from './notification.service.js';
import { taskService } from './task.service.js';
import type { TaskDto } from './task.service.js';

/**
 * "Xabar → amal" (CRM 4.0, 2-faza): ogohlantirish yoki bildirishnomani ko'rgan xodim shu joyning o'zida
 * uni vazifaga aylantiradi, mas'ulga biriktiradi yoki keyinga suradi.
 *
 * Doira o'zgarmaydi: ogohlantirish — `alertService.scopeFor` (filial), bildirishnoma — faqat egasi.
 * Ko'ra olmaydigan yozuv uchun javob 404.
 */
async function findAlert(actor: AuthUser, id: string) {
  const alert = await prisma.alert.findFirst({ where: { AND: [{ id }, await alertService.scopeFor(actor)] }, select: { id: true, title: true, message: true, entityType: true, entityId: true, resolvedAt: true, assigneeId: true, severity: true } });
  if (!alert) throw AppError.notFound('Ogohlantirish topilmadi');
  return alert;
}

function assertOpen(alert: { resolvedAt: Date | null }): void {
  if (alert.resolvedAt) throw AppError.conflict('Bu ogohlantirish allaqachon yopilgan');
}

export const workActionService = {
  /** Ogohlantirishga mas'ul qilish mumkin bo'lgan xodimlar: ogohlantirishlarni ko'ra oladigan, filial doirasidagi faol xodimlar */
  async alertAssignees(actor: AuthUser): Promise<Array<{ id: string; firstName: string; lastName: string; role: string }>> {
    const access = await getBranchAccess(actor);
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        role: { permissions: { some: { permission: { key: PERMISSIONS.ALERT_VIEW } } } },
        ...(access.canViewAll ? {} : { branchId: access.branchId }),
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    });
    return users.map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role.name }));
  },

  /** Mas'ul biriktirish (`task.assign`); `null` — mas'ulni olib tashlash */
  async assignAlert(actor: AuthUser, id: string, input: AssignAlertInput, client: ClientInfo): Promise<AlertDto> {
    const alert = await findAlert(actor, id);
    assertOpen(alert);
    const access = await getBranchAccess(actor);
    const updated = await prisma.$transaction(async (tx) => {
      if (input.assigneeId) {
        const assignee = await tx.user.findFirst({
          where: {
            id: input.assigneeId,
            deletedAt: null,
            status: 'ACTIVE',
            // Mas'ul ogohlantirishni ko'ra olishi kerak — aks holda biriktirish ma'nosiz
            role: { permissions: { some: { permission: { key: PERMISSIONS.ALERT_VIEW } } } },
            ...(access.canViewAll ? {} : { branchId: access.branchId }),
          },
          select: { id: true },
        });
        if (!assignee) throw AppError.unprocessable('Xodim topilmadi yoki ogohlantirishlarni ko‘ra olmaydi');
        if (assignee.id !== actor.id && assignee.id !== alert.assigneeId) {
          await notificationService.createInTransaction(tx, {
            userId: assignee.id,
            type: 'TASK_UPDATE',
            title: 'Sizga ogohlantirish biriktirildi',
            message: `${alert.title} — ${actor.firstName} ${actor.lastName}`.trim(),
            entityType: 'alert',
            entityId: id,
            actionUrl: '/alerts',
            dedupeKey: `alert:${id}:assigned:${assignee.id}:${Date.now()}`,
          });
        }
      }
      const row = await tx.alert.update({ where: { id }, data: { assigneeId: input.assigneeId, escalatedAt: null }, select: alertSelect });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'alert.assigned', entityType: 'alert', entityId: id, metadata: { from: alert.assigneeId, to: input.assigneeId }, ...client });
      return row;
    });
    return toAlertDto(updated);
  },

  /** Kechiktirish: shu vaqtgacha faol ro'yxat va hisoblagichda ko'rinmaydi (yopilmaydi) */
  async snoozeAlert(actor: AuthUser, id: string, input: SnoozeInput, client: ClientInfo): Promise<AlertDto> {
    const alert = await findAlert(actor, id);
    assertOpen(alert);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.alert.update({ where: { id }, data: { snoozedUntil: input.until }, select: alertSelect });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'alert.snoozed', entityType: 'alert', entityId: id, metadata: { until: input.until.toISOString() }, ...client });
      return row;
    });
    return toAlertDto(updated);
  },

  /** Kechiktirishni bekor qilish */
  async unsnoozeAlert(actor: AuthUser, id: string): Promise<AlertDto> {
    await findAlert(actor, id);
    return toAlertDto(await prisma.alert.update({ where: { id }, data: { snoozedUntil: null }, select: alertSelect }));
  },

  /**
   * Ogohlantirishdan vazifa. Sarlavha/havola berilmasa ogohlantirishnikidan olinadi; vazifa ijrochisi
   * (ogohlantirishlarni ko'ra olsa) ogohlantirishning mas'uli bo'ladi. Ogohlantirish yopilmaydi — muammo hal bo'lgach o'zi yopiladi.
   */
  async taskFromAlert(actor: AuthUser, id: string, input: Partial<TaskCreateInput>, client: ClientInfo): Promise<TaskDto> {
    const alert = await findAlert(actor, id);
    assertOpen(alert);
    const task = await taskService.create(
      actor,
      {
        title: input.title ?? alert.title,
        description: input.description ?? alert.message.slice(0, 2000),
        priority: input.priority ?? (alert.severity === 'CRITICAL' ? 'URGENT' : alert.severity === 'WARNING' ? 'HIGH' : 'NORMAL'),
        ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        entityType: alert.entityType ?? 'alert',
        entityId: alert.entityId ?? alert.id,
        link: alertLinkFor(alert.entityType, alert.entityId) ?? '/alerts',
      },
      client,
      { source: 'ALERT', alertId: id },
    );
    // Ijrochi ogohlantirishlarni ko'ra olsa — uning mas'uli ham bo'ladi (ko'ra olmasa, faqat vazifa orqali ishlaydi)
    const canView = await prisma.user.count({ where: { id: task.assignee.id, role: { permissions: { some: { permission: { key: PERMISSIONS.ALERT_VIEW } } } } } });
    if (canView > 0) await prisma.alert.update({ where: { id }, data: { assigneeId: task.assignee.id } });
    return task;
  },

  async snoozeNotification(actor: AuthUser, id: string, input: SnoozeInput): Promise<NotificationDto> {
    return notificationService.snooze(actor, id, input.until);
  },

  /** Bildirishnomadan vazifa: bildirishnoma o'qilgan deb belgilanadi va vazifaga bog'lanadi */
  async taskFromNotification(actor: AuthUser, id: string, input: Partial<TaskCreateInput>, client: ClientInfo): Promise<TaskDto> {
    const notification = await prisma.notification.findFirst({ where: { id, userId: actor.id }, select: { id: true, title: true, message: true, entityType: true, entityId: true, actionUrl: true, taskId: true } });
    if (!notification) throw AppError.notFound('Bildirishnoma topilmadi');
    if (notification.taskId) throw AppError.conflict('Bu bildirishnomadan allaqachon vazifa yaratilgan');
    const task = await taskService.create(
      actor,
      {
        title: input.title ?? notification.title,
        description: input.description ?? notification.message.slice(0, 2000),
        priority: input.priority ?? 'NORMAL',
        ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(notification.entityType && notification.entityId ? { entityType: notification.entityType.slice(0, 30), entityId: notification.entityId } : {}),
        ...(notification.actionUrl?.startsWith('/') ? { link: notification.actionUrl.slice(0, 200) } : {}),
      },
      client,
      { source: 'NOTIFICATION', notificationId: id },
    );
    // Shartli: ikki marta bosilsa ikkinchisi bog'lanmaydi (vazifaning o'zi yaratilgan bo'lsa ham bildirishnoma bittasiga ishora qiladi)
    await prisma.notification.updateMany({ where: { id, userId: actor.id, taskId: null }, data: { taskId: task.id, readAt: new Date() } });
    return task;
  },
};
