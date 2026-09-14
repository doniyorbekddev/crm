import { AUDIT_CRITICAL_ACTIONS, auditActionLabel, auditEntityLabel } from '../config/auditLabels.js';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { logger } from '../utils/logger.js';
import { toSkipTake } from '../utils/pagination.js';
import type { AuditListQuery } from '../validators/audit.validator.js';
import { EXPORT_ROW_LIMIT, exportSubtitle } from '../utils/tableExport.js';
import type { ExportTable } from '../utils/tableExport.js';

export interface AuditEntry {
  userId?: string | null;
  /** Masalan: auth.login, lead.status_changed, payment.created */
  action: string;
  entityType: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

function toCreateData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
  };
}

export const auditService = {
  /**
   * Tranzaksiyadan tashqarida audit yozuvi. Hech qachon xatolik tashlamaydi —
   * audit yozilmay qolsa ham asosiy amal (masalan, login) buzilmasligi kerak.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({ data: toCreateData(entry) });
    } catch (error) {
      logger.error({ err: error, action: entry.action }, 'Audit log yozilmadi');
    }
  },

  /** Tranzaksiya ichida: amal bilan birga yoziladi yoki birga bekor qilinadi. */
  async recordInTransaction(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: toCreateData(entry) });
  },
};

// ---------------------------------------------------------------------
// Audit jurnalini o‘qish (audit.view ruxsati bilan)
// ---------------------------------------------------------------------

const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  ip: true,
  userAgent: true,
  metadata: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type AuditRecord = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

export interface AuditLogDto {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityLabel: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue;
  isCritical: boolean;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface AuditFiltersDto {
  actions: Array<{ value: string; label: string; count: number }>;
  entityTypes: Array<{ value: string; label: string; count: number }>;
  users: Array<{ id: string; firstName: string; lastName: string; count: number }>;
}

function dayStartOf(date: string): Date {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() - env.APP_UTC_OFFSET_MINUTES * 60_000);
}

function toAuditDto(log: AuditRecord): AuditLogDto {
  return {
    id: log.id,
    action: log.action,
    actionLabel: auditActionLabel(log.action),
    entityType: log.entityType,
    entityLabel: auditEntityLabel(log.entityType),
    entityId: log.entityId,
    ip: log.ip,
    userAgent: log.userAgent,
    metadata: log.metadata ?? null,
    isCritical: AUDIT_CRITICAL_ACTIONS.includes(log.action),
    createdAt: log.createdAt.toISOString(),
    user: log.user,
  };
}

function buildAuditWhere(query: Partial<AuditListQuery>): Prisma.AuditLogWhereInput {
  const conditions: Prisma.AuditLogWhereInput[] = [];
  if (query.userId) conditions.push({ userId: query.userId });
  if (query.action) conditions.push({ action: query.action });
  if (query.entityType) conditions.push({ entityType: query.entityType });
  if (query.entityId) conditions.push({ entityId: query.entityId });
  if (query.criticalOnly) conditions.push({ action: { in: [...AUDIT_CRITICAL_ACTIONS] } });
  if (query.from) conditions.push({ createdAt: { gte: dayStartOf(query.from) } });
  if (query.to) conditions.push({ createdAt: { lt: new Date(dayStartOf(query.to).getTime() + 86_400_000) } });

  const search = query.search?.trim();
  if (search) {
    conditions.push({
      OR: [
        { action: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { ip: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }

  return { AND: conditions };
}

export const auditLogService = {
  async list(query: AuditListQuery): Promise<{ items: AuditLogDto[]; total: number }> {
    const where = buildAuditWhere(query);
    const items = await prisma.auditLog.findMany({
      where,
      select: auditSelect,
      orderBy: { createdAt: query.sortOrder },
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.auditLog.count({ where });
    return { items: items.map(toAuditDto), total };
  },

  /** Filtr ro‘yxatlari: mavjud amallar, obyekt turlari va xodimlar (soni bilan) */
  async filters(): Promise<AuditFiltersDto> {
    const actions = await prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true } });
    const entityTypes = await prisma.auditLog.groupBy({ by: ['entityType'], _count: { _all: true } });
    const userGroups = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: { userId: { not: null } },
      _count: { _all: true },
    });

    const userIds = userGroups.flatMap((row) => (row.userId ? [row.userId] : []));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const countByUser = new Map(userGroups.map((row) => [row.userId, row._count._all]));

    return {
      actions: actions
        .map((row) => ({ value: row.action, label: auditActionLabel(row.action), count: row._count._all }))
        .sort((a, b) => a.label.localeCompare(b.label, 'uz')),
      entityTypes: entityTypes
        .map((row) => ({ value: row.entityType, label: auditEntityLabel(row.entityType), count: row._count._all }))
        .sort((a, b) => a.label.localeCompare(b.label, 'uz')),
      users: users
        .map((user) => ({ ...user, count: countByUser.get(user.id) ?? 0 }))
        .sort((a, b) => b.count - a.count),
    };
  },
};

function exportTime(value: Date): string {
  const local = new Date(value.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000).toISOString();
  return `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(0, 4)} ${local.slice(11, 16)}`;
}

/** Audit jurnali eksporti: joriy filtrlar bo‘yicha, eng yangi yozuvlardan */
export async function exportAuditTable(query: AuditListQuery): Promise<ExportTable> {
  const where = buildAuditWhere(query);
  const records = await prisma.auditLog.findMany({
    where,
    select: auditSelect,
    orderBy: { createdAt: 'desc' },
    take: EXPORT_ROW_LIMIT,
  });
  const total = await prisma.auditLog.count({ where });
  return {
    title: 'Audit jurnali',
    subtitle: exportSubtitle(records.length, total),
    columns: [
      { key: 'time', label: 'Vaqt', type: 'text' },
      { key: 'user', label: 'Xodim', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'action', label: 'Amal', type: 'text' },
      { key: 'entity', label: 'Obyekt', type: 'text' },
      { key: 'entityId', label: 'Obyekt ID', type: 'text' },
      { key: 'ip', label: 'IP', type: 'text' },
      { key: 'critical', label: 'Muhim', type: 'text' },
      { key: 'details', label: 'Tafsilot', type: 'text' },
    ],
    rows: records.map((log) => ({
      time: exportTime(log.createdAt),
      user: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Tizim',
      email: log.user?.email ?? null,
      action: auditActionLabel(log.action),
      entity: auditEntityLabel(log.entityType),
      entityId: log.entityId,
      ip: log.ip,
      critical: AUDIT_CRITICAL_ACTIONS.includes(log.action) ? 'ha' : null,
      details: log.metadata ? JSON.stringify(log.metadata).slice(0, 1000) : null,
    })),
    totals: null,
  };
}
