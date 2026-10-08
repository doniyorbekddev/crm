import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { notificationService } from './notification.service.js';
import type { NotificationInput } from './notification.service.js';

/**
 * Eskalatsiya (CRM 4.0, 2-faza): muddati o'tib ketgan ish egasida qolib ketmasin.
 *
 *  - Vazifa: muddati TASK_GRACE_HOURS dan ko'p o'tgan ochiq vazifa — uni bergan xodimga va ijrochi
 *    filialining rahbarlariga (`task.view_all`). Ijrochining o'ziga yuborilmaydi.
 *  - Ogohlantirish: mas'ulga biriktirilgan, ALERT_GRACE_HOURS dan beri hal qilinmagan — ogohlantirish
 *    sozlovchilariga (`alert.manage`).
 *
 * Har yozuv **bir marta** ko'tariladi (`escalatedAt`); muddat surilsa yoki qayta biriktirilsa belgi tozalanadi.
 *
 * Xabar toshqini bo'lmasligi uchun bir yurishda har qabul qiluvchi **bitta** xabar oladi: bitta yozuv bo'lsa —
 * o'sha haqida, ko'p bo'lsa — yig'ma ("12 ta vazifa muddati o'tdi: …"). Aks holda birinchi yurishda (yoki
 * yuzlab kechikkan vazifada) rahbarga har biri uchun alohida xabar ketardi.
 * Yangi vazifa yaratilmaydi — rahbarga signal kerak; ish o'sha vazifaning o'zida davom etadi.
 */
export const TASK_GRACE_HOURS = 24;
export const ALERT_GRACE_HOURS = 48;
/** Bir yurishda ko'tariladigan yozuvlar chegarasi (qolgani keyingi soatda) */
const BATCH = 500;
/** Yig'ma xabarda nomi keltiriladigan yozuvlar soni */
const PREVIEW = 3;
const HOUR_MS = 3_600_000;

/** Ruxsat egalari filial kesimida: `null` kalit — barcha filiallarni ko'ra oladiganlar */
async function holdersByBranch(permission: string): Promise<{ everywhere: string[]; byBranch: Map<string, string[]> }> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE', role: { permissions: { some: { permission: { key: permission } } } } },
    select: { id: true, branchId: true, role: { select: { permissions: { where: { permission: { key: PERMISSIONS.BRANCH_VIEW_ALL } }, select: { permissionId: true } } } } },
  });
  const everywhere: string[] = [];
  const byBranch = new Map<string, string[]>();
  for (const user of users) {
    if (user.role.permissions.length > 0) everywhere.push(user.id);
    else byBranch.set(user.branchId, [...(byBranch.get(user.branchId) ?? []), user.id]);
  }
  return { everywhere, byBranch };
}

function summary(titles: string[]): string {
  const shown = titles.slice(0, PREVIEW).join('; ');
  return titles.length > PREVIEW ? `${shown} va yana ${titles.length - PREVIEW} ta` : shown;
}

export const escalationService = {
  async run(now: Date = new Date()): Promise<{ tasks: number; alerts: number }> {
    const stamp = now.getTime();

    // ---------------------------------------------------------------- vazifalar
    const tasks = await prisma.$transaction(async (tx) => {
      // Belgi va tanlov bitta so'rovda: parallel yurish (boshqa nusxa) shu qatorlarni ikkinchi marta olmaydi
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "tasks" SET "escalatedAt" = ${now}
        WHERE "id" IN (
          SELECT "id" FROM "tasks"
          WHERE "status" = 'OPEN' AND "escalatedAt" IS NULL AND "dueAt" < ${new Date(stamp - TASK_GRACE_HOURS * HOUR_MS)}
          ORDER BY "dueAt" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
        )
        RETURNING "id"
      `;
      if (claimed.length === 0) return 0;
      const rows = await tx.task.findMany({
        where: { id: { in: claimed.map((row) => row.id) } },
        orderBy: { dueAt: 'asc' },
        select: { id: true, title: true, dueAt: true, assigneeId: true, createdById: true, assignee: { select: { firstName: true, lastName: true, branchId: true } } },
      });
      const managers = await holdersByBranch(PERMISSIONS.TASK_VIEW_ALL);

      // Qabul qiluvchi → unga tegishli vazifalar; rahbar — "hammasi", faqat muallif — "men berganlar" ro'yxatiga o'tadi
      const inbox = new Map<string, { items: typeof rows; manager: boolean }>();
      const add = (userId: string, task: (typeof rows)[number], manager: boolean) => {
        if (userId === task.assigneeId) return;
        const entry = inbox.get(userId) ?? { items: [], manager: false };
        if (!entry.items.includes(task)) entry.items.push(task);
        entry.manager ||= manager;
        inbox.set(userId, entry);
      };
      for (const task of rows) {
        if (task.createdById) add(task.createdById, task, false);
        for (const userId of [...managers.everywhere, ...(managers.byBranch.get(task.assignee.branchId) ?? [])]) add(userId, task, true);
      }

      const notifications: NotificationInput[] = [...inbox].map(([userId, { items, manager }]) => {
        const first = items[0]!;
        const single = items.length === 1;
        const days = Math.floor((stamp - first.dueAt!.getTime()) / (24 * HOUR_MS));
        return {
          userId,
          type: 'TASK_UPDATE',
          title: single ? 'Vazifa muddati o‘tdi' : `${items.length} ta vazifa muddati o‘tdi`,
          message: single ? `${first.title} — ${first.assignee.firstName} ${first.assignee.lastName}, ${days} kun kechikdi` : summary(items.map((item) => item.title)),
          entityType: 'task',
          entityId: first.id,
          actionUrl: `/tasks?scope=${manager ? 'all' : 'created'}&overdue=1`,
          dedupeKey: `task:escalated:${userId}:${stamp}`,
        };
      });
      await notificationService.createManyInTransaction(tx, notifications);
      return rows.length;
    });

    // ---------------------------------------------------------- ogohlantirishlar
    const alerts = await prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "alerts" SET "escalatedAt" = ${now}
        WHERE "id" IN (
          SELECT "id" FROM "alerts"
          WHERE "resolvedAt" IS NULL AND "escalatedAt" IS NULL AND "assigneeId" IS NOT NULL
            AND "createdAt" < ${new Date(stamp - ALERT_GRACE_HOURS * HOUR_MS)}
            AND ("snoozedUntil" IS NULL OR "snoozedUntil" <= ${now})
          ORDER BY "createdAt" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
        )
        RETURNING "id"
      `;
      if (claimed.length === 0) return 0;
      const rows = await tx.alert.findMany({
        where: { id: { in: claimed.map((row) => row.id) } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, branchId: true, assigneeId: true, assignee: { select: { firstName: true, lastName: true } } },
      });
      const managers = await holdersByBranch(PERMISSIONS.ALERT_MANAGE);

      const inbox = new Map<string, typeof rows>();
      for (const alert of rows) {
        // Markaz bo'yicha umumiy (filialsiz) ogohlantirish — barcha sozlovchilarga
        const recipients = alert.branchId ? [...managers.everywhere, ...(managers.byBranch.get(alert.branchId) ?? [])] : [...managers.everywhere, ...[...managers.byBranch.values()].flat()];
        for (const userId of new Set(recipients)) {
          if (userId === alert.assigneeId) continue;
          inbox.set(userId, [...(inbox.get(userId) ?? []), alert]);
        }
      }
      const notifications: NotificationInput[] = [...inbox].map(([userId, items]) => {
        const first = items[0]!;
        const single = items.length === 1;
        return {
          userId,
          type: 'TASK_UPDATE',
          title: single ? 'Ogohlantirish hal qilinmayapti' : `${items.length} ta ogohlantirish hal qilinmayapti`,
          message: single ? `${first.title} — mas’ul: ${first.assignee ? `${first.assignee.firstName} ${first.assignee.lastName}` : '—'}` : summary(items.map((item) => item.title)),
          entityType: 'alert',
          entityId: first.id,
          actionUrl: '/alerts',
          dedupeKey: `alert:escalated:${userId}:${stamp}`,
        };
      });
      await notificationService.createManyInTransaction(tx, notifications);
      return rows.length;
    });

    return { tasks, alerts };
  },
};
