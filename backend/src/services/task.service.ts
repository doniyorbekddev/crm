import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Prisma, TaskPriority, TaskSource, TaskStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { TaskAssignInput, TaskCommentInput, TaskCreateInput, TaskListQuery, TaskUpdateInput } from '../validators/task.validator.js';
import { auditService } from './audit.service.js';
import { getBranchAccess } from './branchAccess.js';
import type { BranchAccess } from './branchAccess.js';
import { notificationService } from './notification.service.js';
import { permissionService } from './permission.service.js';
import { taskNotificationButtons } from '../telegram/taskButtons.js';

/**
 * Xodim vazifalari (CRM 4.0, 2-faza "Vazifa 2.0").
 *
 * Kim nimani ko'radi:
 *  - har kim — o'ziga biriktirilgan va o'zi bergan vazifalarni;
 *  - `task.view_all` — o'z filiali doirasidagi (yoki `branch.view_all` bilan barcha) xodimlarning vazifalarini.
 * Kim nima qila oladi:
 *  - `task.create` — vazifa yaratish (o'zi uchun); boshqaga berish va qayta biriktirish — `task.assign`;
 *  - holatni ijrochi, muallif yoki rahbar o'zgartiradi; matn/muddat/ustuvorlikni — muallif yoki rahbar.
 * Ko'ra olmaydigan vazifa uchun javob har doim 404 (mavjudligi oshkor qilinmaydi).
 */

type Tx = Prisma.TransactionClient;
type Person = { id: string; firstName: string; lastName: string };

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  dueAt: string | null;
  overdue: boolean;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  assignee: Person;
  createdBy: Person | null;
  rule: { key: string; name: string } | null;
  alertId: string | null;
  commentCount: number;
  escalatedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskCommentDto {
  id: string;
  content: string;
  author: Person | null;
  createdAt: string;
}

export interface TaskAssignmentDto {
  id: string;
  from: Person | null;
  to: Person | null;
  changedBy: Person | null;
  note: string | null;
  createdAt: string;
}

export interface TaskDetailDto extends TaskDto {
  comments: TaskCommentDto[];
  assignments: TaskAssignmentDto[];
  /** Joriy foydalanuvchi nima qila oladi — tugmalarni ko'rsatish uchun */
  can: { edit: boolean; assign: boolean; changeStatus: boolean };
}

const person = { select: { id: true, firstName: true, lastName: true } } as const;

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  source: true,
  dueAt: true,
  link: true,
  entityType: true,
  entityId: true,
  alertId: true,
  escalatedAt: true,
  createdAt: true,
  completedAt: true,
  assigneeId: true,
  createdById: true,
  assignee: { select: { id: true, firstName: true, lastName: true, branchId: true } },
  createdBy: person,
  rule: { select: { key: true, name: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

function toDto(row: TaskRow, now = new Date()): TaskDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    source: row.source,
    dueAt: row.dueAt?.toISOString() ?? null,
    overdue: row.status === 'OPEN' && row.dueAt !== null && row.dueAt < now,
    link: row.link,
    entityType: row.entityType,
    entityId: row.entityId,
    assignee: { id: row.assignee.id, firstName: row.assignee.firstName, lastName: row.assignee.lastName },
    createdBy: row.createdBy,
    rule: row.rule,
    alertId: row.alertId,
    commentCount: row._count.comments,
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

interface Scope {
  permissions: ReadonlySet<string>;
  access: BranchAccess;
  viewAll: boolean;
  canAssign: boolean;
}

async function loadScope(actor: AuthUser): Promise<Scope> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return {
    permissions,
    access: await getBranchAccess(actor),
    viewAll: permissions.has(PERMISSIONS.TASK_VIEW_ALL),
    canAssign: permissions.has(PERMISSIONS.TASK_ASSIGN),
  };
}

/** Filial doirasi ijrochi orqali: vazifa ijrochisi qaysi filialda ishlasa, o'sha filialniki */
function branchOfAssignee(access: BranchAccess): Prisma.TaskWhereInput {
  return { assignee: { branchId: access.branchId } };
}

/** Joriy foydalanuvchi ko'ra oladigan vazifalar */
function visibleWhere(actor: AuthUser, scope: Scope): Prisma.TaskWhereInput {
  const own: Prisma.TaskWhereInput[] = [{ assigneeId: actor.id }, { createdById: actor.id }];
  if (!scope.viewAll) return { OR: own };
  // Barcha filiallar: shart yo'q. (`OR` ichidagi bo'sh `{}` Prisma'da "hech narsa" degani — shuning uchun alohida.)
  return scope.access.canViewAll ? {} : { OR: [...own, branchOfAssignee(scope.access)] };
}

async function findVisible(actor: AuthUser, scope: Scope, id: string): Promise<TaskRow> {
  const row = await prisma.task.findFirst({ where: { AND: [{ id }, visibleWhere(actor, scope)] }, select: taskSelect });
  if (!row) throw AppError.notFound('Vazifa topilmadi');
  return row;
}

function isManagerOf(row: TaskRow, scope: Scope): boolean {
  return scope.viewAll && (scope.access.canViewAll || row.assignee.branchId === scope.access.branchId);
}

/** Ijrochi bo'la oladigan xodim: faol, kabinet hisobi emas, chaqiruvchining filial doirasida */
async function resolveAssignee(db: Tx | typeof prisma, scope: Scope, assigneeId: string): Promise<Person> {
  const user = await db.user.findFirst({
    where: {
      id: assigneeId,
      deletedAt: null,
      status: 'ACTIVE',
      role: { permissions: { none: { permission: { key: { in: [PERMISSIONS.PORTAL_STUDENT, PERMISSIONS.PORTAL_PARENT] } } } } },
      ...(scope.access.canViewAll ? {} : { branchId: scope.access.branchId }),
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!user) throw AppError.unprocessable('Ijrochi topilmadi yoki unga vazifa berib bo‘lmaydi');
  return user;
}

const PRIORITY_MARK: Record<TaskPriority, string> = { LOW: '', NORMAL: '', HIGH: '❗ ', URGENT: '🔥 ' };

function fullName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export const taskService = {
  async list(actor: AuthUser, query: TaskListQuery): Promise<{ items: TaskDto[]; openCount: number; total: number; page: number; limit: number }> {
    const scope = await loadScope(actor);
    const now = new Date();
    // `all` ruxsatsiz so'ralsa — jimgina o'zinikiga tushadi (avvalgi xatti-harakat)
    const owner: Prisma.TaskWhereInput =
      query.scope === 'all' && scope.viewAll ? visibleWhere(actor, scope) : query.scope === 'created' ? { createdById: actor.id } : { assigneeId: actor.id };
    const filters: Prisma.TaskWhereInput[] = [owner];
    if (query.status) filters.push({ status: query.status });
    if (query.priority) filters.push({ priority: query.priority });
    if (query.assigneeId) filters.push({ assigneeId: query.assigneeId });
    if (query.overdue) filters.push({ status: 'OPEN', dueAt: { lt: now } });
    if (query.search) filters.push({ OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] });
    const where: Prisma.TaskWhereInput = { AND: filters };

    const [rows, total, openCount] = await Promise.all([
      prisma.task.findMany({
        where,
        // Ochiqlar birinchi; ular ichida muddati yaqini; muddatsizlar oxirida
        orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: taskSelect,
      }),
      prisma.task.count({ where }),
      prisma.task.count({ where: { AND: [owner, { status: 'OPEN' }] } }),
    ]);
    return { items: rows.map((row) => toDto(row, now)), openCount, total, page: query.page, limit: query.limit };
  },

  async getById(actor: AuthUser, id: string): Promise<TaskDetailDto> {
    const scope = await loadScope(actor);
    const row = await findVisible(actor, scope, id);
    const [comments, assignments] = await Promise.all([
      prisma.taskComment.findMany({ where: { taskId: id }, orderBy: { createdAt: 'asc' }, select: { id: true, content: true, createdAt: true, author: person } }),
      prisma.taskAssignment.findMany({
        where: { taskId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, note: true, createdAt: true, fromUser: person, toUser: person, changedBy: person },
      }),
    ]);
    const manager = isManagerOf(row, scope);
    const author = row.createdById === actor.id;
    return {
      ...toDto(row),
      comments: comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString() })),
      assignments: assignments.map((item) => ({ id: item.id, from: item.fromUser, to: item.toUser, changedBy: item.changedBy, note: item.note, createdAt: item.createdAt.toISOString() })),
      can: { edit: manager || author, assign: scope.canAssign && (manager || author), changeStatus: manager || author || row.assigneeId === actor.id },
    };
  },

  async create(actor: AuthUser, input: TaskCreateInput, client: ClientInfo, origin: { source?: TaskSource; alertId?: string; notificationId?: string } = {}): Promise<TaskDto> {
    const scope = await loadScope(actor);
    const assigneeId = input.assigneeId ?? actor.id;
    if (assigneeId !== actor.id && !scope.canAssign) throw AppError.forbidden('Boshqa xodimga vazifa berishga ruxsat yo‘q');

    const id = await prisma.$transaction(async (tx) => {
      // O'zi uchun bo'lsa filial tekshiruvi shart emas
      const assignee = assigneeId === actor.id ? null : await resolveAssignee(tx, scope, assigneeId);
      const task = await tx.task.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          assigneeId,
          dueAt: input.dueAt ?? null,
          priority: input.priority,
          source: origin.source ?? 'MANUAL',
          alertId: origin.alertId ?? null,
          notificationId: origin.notificationId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          link: input.link ?? null,
          createdById: actor.id,
          assignments: { create: { fromUserId: null, toUserId: assigneeId, changedById: actor.id } },
        },
        select: { id: true },
      });
      if (assignee) {
        await notificationService.createInTransaction(tx, {
          userId: assignee.id,
          type: 'TASK_UPDATE',
          title: 'Sizga vazifa berildi',
          message: `${PRIORITY_MARK[input.priority]}${input.title} — ${fullName(actor)}`,
          entityType: 'task',
          entityId: task.id,
          actionUrl: '/tasks',
          buttons: taskNotificationButtons(task.id),
          dedupeKey: `task:${task.id}:assigned:${assignee.id}`,
        });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'task.created',
        entityType: 'task',
        entityId: task.id,
        metadata: { title: input.title, assigneeId, priority: input.priority, source: origin.source ?? 'MANUAL' },
        ...client,
      });
      return task.id;
    });
    return toDto(await prisma.task.findUniqueOrThrow({ where: { id }, select: taskSelect }));
  },

  /** Holat va/yoki maydonlarni o'zgartirish */
  async update(actor: AuthUser, id: string, input: TaskUpdateInput, client: ClientInfo): Promise<TaskDto> {
    const scope = await loadScope(actor);
    const task = await findVisible(actor, scope, id);
    const manager = isManagerOf(task, scope);
    const author = task.createdById === actor.id;
    const editsFields = input.title !== undefined || input.description !== undefined || input.dueAt !== undefined || input.priority !== undefined;
    if (editsFields && !manager && !author) throw AppError.forbidden('Vazifani faqat uni bergan xodim yoki rahbar tahrirlaydi');
    if (input.status !== undefined && !manager && !author && task.assigneeId !== actor.id) throw AppError.forbidden('Bu vazifa holatini o‘zgartirishga ruxsat yo‘q');

    const data: Prisma.TaskUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.dueAt !== undefined) {
      data.dueAt = input.dueAt;
      // Muddat surilsa — yangi muddat bo'yicha qayta eskalatsiya qilinishi mumkin
      data.escalatedAt = null;
    }
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.status !== undefined && input.status !== task.status) {
      data.status = input.status;
      data.completedAt = input.status === 'DONE' ? new Date() : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.task.update({ where: { id }, data, select: taskSelect });
      if (input.status !== undefined && input.status !== task.status) {
        await auditService.recordInTransaction(tx, { userId: actor.id, action: 'task.status_changed', entityType: 'task', entityId: id, metadata: { from: task.status, to: input.status }, ...client });
        // Topshiriq bergan xodim natijani bilsin (o'zi yopmagan bo'lsa)
        if (input.status === 'DONE' && task.createdById && task.createdById !== actor.id) {
          await notificationService.createInTransaction(tx, {
            userId: task.createdById,
            type: 'TASK_UPDATE',
            title: 'Vazifa bajarildi',
            message: `${task.title} — ${fullName(actor)}`,
            entityType: 'task',
            entityId: id,
            actionUrl: '/tasks',
            dedupeKey: `task:${id}:done:${row.completedAt?.getTime() ?? 0}`,
          });
        }
      }
      if (editsFields) {
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'task.updated',
          entityType: 'task',
          entityId: id,
          before: { title: task.title, description: task.description, dueAt: task.dueAt?.toISOString() ?? null, priority: task.priority },
          after: { title: row.title, description: row.description, dueAt: row.dueAt?.toISOString() ?? null, priority: row.priority },
          ...client,
        });
      }
      return row;
    });
    return toDto(updated);
  },

  /** Avvalgi chaqiruv shakli (`PATCH /tasks/:id {status}`) uchun */
  async setStatus(actor: AuthUser, id: string, status: TaskStatus, client: ClientInfo): Promise<TaskDto> {
    return this.update(actor, id, { status }, client);
  },

  /** Qayta biriktirish: tarixga yoziladi, yangi ijrochi xabar oladi */
  async assign(actor: AuthUser, id: string, input: TaskAssignInput, client: ClientInfo): Promise<TaskDto> {
    const scope = await loadScope(actor);
    if (!scope.canAssign) throw AppError.forbidden('Vazifani biriktirishga ruxsat yo‘q');
    const task = await findVisible(actor, scope, id);
    if (!isManagerOf(task, scope) && task.createdById !== actor.id) throw AppError.forbidden('Bu vazifani qayta biriktirishga ruxsat yo‘q');
    if (task.status !== 'OPEN') throw AppError.unprocessable('Faqat ochiq vazifa qayta biriktiriladi');
    if (task.assigneeId === input.assigneeId) throw AppError.unprocessable('Vazifa allaqachon shu xodimda');

    const updated = await prisma.$transaction(async (tx) => {
      const assignee = await resolveAssignee(tx, scope, input.assigneeId);
      // Shartli yangilash: ikki rahbar bir vaqtda biriktirsa, ikkinchisi eski holat ustidan yozmaydi
      const claimed = await tx.task.updateMany({ where: { id, assigneeId: task.assigneeId, status: 'OPEN' }, data: { assigneeId: assignee.id, escalatedAt: null } });
      if (claimed.count === 0) throw AppError.conflict('Vazifa hozirgina o‘zgartirildi — sahifani yangilang');
      const record = await tx.taskAssignment.create({ data: { taskId: id, fromUserId: task.assigneeId, toUserId: assignee.id, changedById: actor.id, note: input.note ?? null }, select: { id: true } });
      if (assignee.id !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: assignee.id,
          type: 'TASK_UPDATE',
          title: 'Sizga vazifa biriktirildi',
          message: `${PRIORITY_MARK[task.priority]}${task.title} — ${fullName(actor)}${input.note ? `: ${input.note}` : ''}`,
          entityType: 'task',
          entityId: id,
          actionUrl: '/tasks',
          buttons: taskNotificationButtons(id),
          dedupeKey: `task:${id}:assigned:${assignee.id}:${record.id}`,
        });
      }
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'task.assigned', entityType: 'task', entityId: id, metadata: { from: task.assigneeId, to: assignee.id, note: input.note ?? null }, ...client });
      return tx.task.findUniqueOrThrow({ where: { id }, select: taskSelect });
    });
    return toDto(updated);
  },

  /** Izoh: vazifani ko'ra oladigan har kim yozadi; ikkinchi tomon (ijrochi / muallif) xabar oladi */
  async addComment(actor: AuthUser, id: string, input: TaskCommentInput): Promise<TaskCommentDto> {
    const scope = await loadScope(actor);
    const task = await findVisible(actor, scope, id);
    const comment = await prisma.$transaction(async (tx) => {
      const row = await tx.taskComment.create({ data: { taskId: id, authorId: actor.id, content: input.content }, select: { id: true, content: true, createdAt: true, author: person } });
      const recipients = [...new Set([task.assigneeId, task.createdById].filter((userId): userId is string => Boolean(userId) && userId !== actor.id))];
      await notificationService.createManyInTransaction(
        tx,
        recipients.map((userId) => ({
          userId,
          type: 'TASK_UPDATE' as const,
          title: 'Vazifaga izoh qoldirildi',
          message: `${task.title} — ${fullName(actor)}: ${input.content.slice(0, 200)}`,
          entityType: 'task',
          entityId: id,
          actionUrl: '/tasks',
          dedupeKey: `task:${id}:comment:${row.id}:${userId}`,
        })),
      );
      return row;
    });
    return { ...comment, createdAt: comment.createdAt.toISOString() };
  },

  /** Vazifa berish mumkin bo'lgan xodimlar (biriktirish ro'yxati uchun) */
  async assignees(actor: AuthUser): Promise<Array<Person & { role: string }>> {
    const scope = await loadScope(actor);
    if (!scope.canAssign) return [{ id: actor.id, firstName: actor.firstName, lastName: actor.lastName, role: '' }];
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        role: { permissions: { none: { permission: { key: { in: [PERMISSIONS.PORTAL_STUDENT, PERMISSIONS.PORTAL_PARENT] } } } } },
        ...(scope.access.canViewAll ? {} : { branchId: scope.access.branchId }),
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    });
    return users.map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role.name }));
  },
};
