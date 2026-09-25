import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Prisma, TaskStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';

/**
 * Xodim ishlari (TZ 3.0 §51 "Create Task"): avtomatlashtirish qoidasi yoki xodim yaratadi.
 * Har kim o'z ishlarini ko'radi va yopadi; rahbar (`alert.manage`) — hammaning ishlarini.
 */

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  overdue: boolean;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  assignee: { id: string; firstName: string; lastName: string };
  rule: { key: string; name: string } | null;
  createdAt: string;
  completedAt: string | null;
}

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueAt: true,
  link: true,
  entityType: true,
  entityId: true,
  createdAt: true,
  completedAt: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
  rule: { select: { key: true, name: true } },
} satisfies Prisma.TaskSelect;

function toDto(row: Prisma.TaskGetPayload<{ select: typeof taskSelect }>, now = new Date()): TaskDto {
  return {
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    overdue: row.status === 'OPEN' && row.dueAt !== null && row.dueAt < now,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function canSeeAll(actor: AuthUser): Promise<boolean> {
  return (await permissionService.getRolePermissions(actor.roleId)).has(PERMISSIONS.ALERT_MANAGE);
}

export const taskService = {
  async list(actor: AuthUser, query: { status?: TaskStatus | undefined; scope?: 'mine' | 'all' | undefined }): Promise<{ items: TaskDto[]; openCount: number }> {
    const all = query.scope === 'all' && (await canSeeAll(actor));
    const owner: Prisma.TaskWhereInput = all ? {} : { assigneeId: actor.id };
    const [rows, openCount] = await Promise.all([
      prisma.task.findMany({
        where: { ...owner, ...(query.status ? { status: query.status } : {}) },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 200,
        select: taskSelect,
      }),
      prisma.task.count({ where: { ...owner, status: 'OPEN' } }),
    ]);
    return { items: rows.map((row) => toDto(row)), openCount };
  },

  /** Holatni o'zgartirish: bajardi yoki bekor. Faqat ijrochi yoki rahbar */
  async setStatus(actor: AuthUser, id: string, status: Exclude<TaskStatus, 'OPEN'> | 'OPEN', client: ClientInfo): Promise<TaskDto> {
    const task = await prisma.task.findUnique({ where: { id }, select: { id: true, assigneeId: true, status: true } });
    if (!task || (task.assigneeId !== actor.id && !(await canSeeAll(actor)))) throw AppError.notFound('Ish topilmadi');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.task.update({ where: { id }, data: { status, completedAt: status === 'DONE' ? new Date() : null }, select: taskSelect });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'task.status_changed', entityType: 'task', entityId: id, metadata: { from: task.status, to: status }, ...client });
      return row;
    });
    return toDto(updated);
  },
};
