import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { EmployeePosition, KnowledgeCategory, KnowledgeStatus, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { KnowledgeListQuery, KnowledgeSaveInput } from '../../validators/org.validator.js';
import { auditService } from '../audit.service.js';
import { notificationService } from '../notification.service.js';
import { permissionService } from '../permission.service.js';
import { personSelect, staffRoleWhere } from './common.js';
import type { Person } from './common.js';

/**
 * Bilimlar bazasi (ORG §14): lavozim yo'riqnomalari, ichki qoidalar, video qo'llanmalar, savdo skriptlari,
 * dars standartlari va o'quv materiallari.
 *
 *  - Xodim faqat **e'lon qilingan** va o'z roliga ochilgan hujjatlarni ko'radi (auditoriya bo'sh — hamma xodim).
 *  - Har saqlash yangi versiya: eski matn o'zgarmas tarixda qoladi, kim va nima o'zgartirgani bilan.
 *  - "Tanishish majburiy" hujjatni xodim tasdiqlaydi; yangi versiya chiqsa tasdiq qayta so'raladi.
 * Ko'rish huquqi bo'lmagan hujjat uchun javob — 404.
 */

const articleSelect = {
  id: true,
  title: true,
  category: true,
  status: true,
  body: true,
  videoUrl: true,
  audienceRoleIds: true,
  position: true,
  version: true,
  requiresAck: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  updatedBy: personSelect,
} satisfies Prisma.KnowledgeArticleSelect;

type ArticleRow = Prisma.KnowledgeArticleGetPayload<{ select: typeof articleSelect }>;

export interface KnowledgeItemDto {
  id: string;
  title: string;
  category: KnowledgeCategory;
  status: KnowledgeStatus;
  position: EmployeePosition | null;
  version: number;
  requiresAck: boolean;
  /** Joriy foydalanuvchi joriy versiya bilan tanishganmi */
  acknowledged: boolean;
  audience: Array<{ id: string; name: string }>;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: Person | null;
}

export interface KnowledgeDetailDto extends KnowledgeItemDto {
  body: string;
  videoUrl: string | null;
  versions: Array<{ version: number; title: string; changeNote: string | null; editor: Person | null; createdAt: string }>;
  /** Faqat boshqaruvchiga: joriy versiya bilan tanishganlar */
  acknowledgements: Array<{ user: Person; acknowledgedAt: string }> | null;
  can: { manage: boolean };
}

async function canManage(actor: AuthUser): Promise<boolean> {
  return (await permissionService.getRolePermissions(actor.roleId)).has(PERMISSIONS.KNOWLEDGE_MANAGE);
}

/** Xodim ko'ra oladigan hujjatlar: e'lon qilingan va auditoriyasi bo'sh yoki uning rolini o'z ichiga oladi */
function readableWhere(actor: AuthUser, manage: boolean): Prisma.KnowledgeArticleWhereInput {
  if (manage) return {};
  return { status: 'PUBLISHED', OR: [{ audienceRoleIds: { isEmpty: true } }, { audienceRoleIds: { has: actor.roleId } }] };
}

async function roleNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const roles = await prisma.role.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(roles.map((role) => [role.id, role.name]));
}

function toItem(row: ArticleRow, names: Map<string, string>, acknowledged: Set<string>): KnowledgeItemDto {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    position: row.position,
    version: row.version,
    requiresAck: row.requiresAck,
    acknowledged: acknowledged.has(`${row.id}:${row.version}`),
    audience: row.audienceRoleIds.filter((roleId) => names.has(roleId)).map((roleId) => ({ id: roleId, name: names.get(roleId)! })),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

async function acknowledgedSet(userId: string, articleIds: string[]): Promise<Set<string>> {
  if (articleIds.length === 0) return new Set();
  const rows = await prisma.knowledgeAcknowledgement.findMany({ where: { userId, articleId: { in: articleIds } }, select: { articleId: true, version: true } });
  return new Set(rows.map((row) => `${row.articleId}:${row.version}`));
}

async function assertRoles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await prisma.role.count({ where: { id: { in: ids }, ...staffRoleWhere } });
  if (found !== new Set(ids).size) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'audienceRoleIds', message: 'Rol topilmadi yoki kabinet roli' }]);
}

/** Hujjat auditoriyasidagi faol xodimlar (tanishish so'rovi uchun) */
async function audienceUsers(roleIds: string[], exceptUserId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE', id: { not: exceptUserId }, role: roleIds.length > 0 ? { id: { in: roleIds } } : staffRoleWhere },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function askToRead(tx: Prisma.TransactionClient, row: { id: string; title: string; version: number; audienceRoleIds: string[] }, actorId: string): Promise<void> {
  const recipients = await audienceUsers(row.audienceRoleIds, actorId);
  await notificationService.createManyInTransaction(
    tx,
    recipients.map((userId) => ({
      userId,
      type: 'HR_UPDATE' as const,
      title: row.version === 1 ? 'Yangi hujjat: tanishib chiqing' : 'Hujjat yangilandi: qayta tanishib chiqing',
      message: `📘 ${row.title} (v${row.version})`,
      entityType: 'knowledge',
      entityId: row.id,
      actionUrl: `/knowledge?id=${row.id}`,
      dedupeKey: `knowledge:${row.id}:v${row.version}:${userId}`,
    })),
  );
}

export const knowledgeService = {
  /** Auditoriya tanlash uchun xodim rollari (o'quvchi va ota-ona kabinetlarisiz) */
  async roles(): Promise<Array<{ id: string; name: string }>> {
    return prisma.role.findMany({ where: staffRoleWhere, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  },

  async list(actor: AuthUser, query: KnowledgeListQuery): Promise<{ items: KnowledgeItemDto[]; pendingAck: number; manage: boolean }> {
    const manage = await canManage(actor);
    const readable = readableWhere(actor, manage);
    const filters: Prisma.KnowledgeArticleWhereInput[] = [readable];
    if (query.category) filters.push({ category: query.category });
    if (query.status && manage) filters.push({ status: query.status });
    if (!query.status && manage) filters.push({ status: { not: 'ARCHIVED' } });
    if (query.search) filters.push({ OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { body: { contains: query.search, mode: 'insensitive' } }] });
    const rows = await prisma.knowledgeArticle.findMany({
      where: { AND: filters },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      take: 500,
      select: articleSelect,
    });
    const acknowledged = await acknowledgedSet(actor.id, rows.map((row) => row.id));
    const names = await roleNames([...new Set(rows.flatMap((row) => row.audienceRoleIds))]);
    // Tanishish kutilayotganlar — faqat o'zi o'qiy oladigan e'lon qilinganlar ichidan
    const own = manage ? rows.filter((row) => row.status === 'PUBLISHED' && (row.audienceRoleIds.length === 0 || row.audienceRoleIds.includes(actor.roleId))) : rows;
    const pending = own.filter((row) => row.requiresAck && !acknowledged.has(`${row.id}:${row.version}`));
    const items = (query.pendingAck ? pending : rows).map((row) => toItem(row, names, acknowledged));
    return { items, pendingAck: pending.length, manage };
  },

  async getById(actor: AuthUser, id: string): Promise<KnowledgeDetailDto> {
    const manage = await canManage(actor);
    const row = await prisma.knowledgeArticle.findFirst({ where: { AND: [{ id }, readableWhere(actor, manage)] }, select: articleSelect });
    if (!row) throw AppError.notFound('Hujjat topilmadi');
    const [versions, acks, acknowledged, names] = await Promise.all([
      prisma.knowledgeArticleVersion.findMany({
        where: { articleId: id },
        orderBy: { version: 'desc' },
        select: { version: true, title: true, changeNote: true, createdAt: true, editor: personSelect },
      }),
      manage
        ? prisma.knowledgeAcknowledgement.findMany({ where: { articleId: id, version: row.version }, orderBy: { acknowledgedAt: 'asc' }, select: { acknowledgedAt: true, user: personSelect } })
        : Promise.resolve(null),
      acknowledgedSet(actor.id, [id]),
      roleNames(row.audienceRoleIds),
    ]);
    return {
      ...toItem(row, names, acknowledged),
      body: row.body,
      videoUrl: row.videoUrl,
      versions: versions.map((version) => ({ ...version, createdAt: version.createdAt.toISOString() })),
      acknowledgements: acks ? acks.map((ack) => ({ user: ack.user, acknowledgedAt: ack.acknowledgedAt.toISOString() })) : null,
      can: { manage },
    };
  },

  /** Eski versiyaning matni (tarix) */
  async version(actor: AuthUser, id: string, version: number): Promise<{ version: number; title: string; body: string; videoUrl: string | null; changeNote: string | null; createdAt: string }> {
    const manage = await canManage(actor);
    const readable = await prisma.knowledgeArticle.count({ where: { AND: [{ id }, readableWhere(actor, manage)] } });
    if (readable === 0) throw AppError.notFound('Hujjat topilmadi');
    const row = await prisma.knowledgeArticleVersion.findUnique({ where: { articleId_version: { articleId: id, version } }, select: { version: true, title: true, body: true, videoUrl: true, changeNote: true, createdAt: true } });
    if (!row) throw AppError.notFound('Versiya topilmadi');
    return { ...row, createdAt: row.createdAt.toISOString() };
  },

  async create(actor: AuthUser, input: KnowledgeSaveInput, client: ClientInfo): Promise<KnowledgeDetailDto> {
    await assertRoles(input.audienceRoleIds);
    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.knowledgeArticle.create({
        data: {
          title: input.title,
          category: input.category,
          body: input.body,
          videoUrl: input.videoUrl ?? null,
          audienceRoleIds: [...new Set(input.audienceRoleIds)],
          position: input.position ?? null,
          requiresAck: input.requiresAck,
          createdById: actor.id,
          updatedById: actor.id,
          versions: { create: { version: 1, title: input.title, body: input.body, videoUrl: input.videoUrl ?? null, changeNote: input.changeNote ?? 'Birinchi versiya', editorId: actor.id } },
        },
        select: { id: true },
      });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'knowledge.created', entityType: 'knowledge', entityId: row.id, metadata: { title: input.title, category: input.category }, ...client });
      return row.id;
    });
    return this.getById(actor, id);
  },

  /** Har saqlash — yangi versiya; e'lon qilingan va tanishish majburiy bo'lsa auditoriya qayta xabar oladi */
  async update(actor: AuthUser, id: string, input: KnowledgeSaveInput, client: ClientInfo): Promise<KnowledgeDetailDto> {
    await assertRoles(input.audienceRoleIds);
    const before = await prisma.knowledgeArticle.findUnique({ where: { id }, select: { version: true, title: true, status: true, audienceRoleIds: true, requiresAck: true } });
    if (!before) throw AppError.notFound('Hujjat topilmadi');
    await prisma.$transaction(async (tx) => {
      // Versiya raqami shartli oshiriladi — ikki tahrir bir vaqtda kelsa, ikkinchisi eski versiya ustidan yozmaydi
      const claimed = await tx.knowledgeArticle.updateMany({
        where: { id, version: before.version },
        data: {
          title: input.title,
          category: input.category,
          body: input.body,
          videoUrl: input.videoUrl ?? null,
          audienceRoleIds: [...new Set(input.audienceRoleIds)],
          position: input.position ?? null,
          requiresAck: input.requiresAck,
          version: before.version + 1,
          updatedById: actor.id,
        },
      });
      if (claimed.count === 0) throw AppError.conflict('Hujjat hozirgina boshqa xodim tomonidan o‘zgartirildi — sahifani yangilang');
      const version = before.version + 1;
      await tx.knowledgeArticleVersion.create({ data: { articleId: id, version, title: input.title, body: input.body, videoUrl: input.videoUrl ?? null, changeNote: input.changeNote ?? null, editorId: actor.id } });
      if (before.status === 'PUBLISHED' && input.requiresAck) await askToRead(tx, { id, title: input.title, version, audienceRoleIds: input.audienceRoleIds }, actor.id);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'knowledge.updated',
        entityType: 'knowledge',
        entityId: id,
        before: { version: before.version, title: before.title },
        after: { version, title: input.title, changeNote: input.changeNote ?? null },
        ...client,
      });
    });
    return this.getById(actor, id);
  },

  async setStatus(actor: AuthUser, id: string, status: KnowledgeStatus, client: ClientInfo): Promise<KnowledgeDetailDto> {
    const row = await prisma.knowledgeArticle.findUnique({ where: { id }, select: { id: true, title: true, status: true, version: true, audienceRoleIds: true, requiresAck: true, publishedAt: true } });
    if (!row) throw AppError.notFound('Hujjat topilmadi');
    if (row.status === status) throw AppError.unprocessable('Hujjat allaqachon shu holatda');
    await prisma.$transaction(async (tx) => {
      await tx.knowledgeArticle.update({ where: { id }, data: { status, ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}) } });
      if (status === 'PUBLISHED' && row.requiresAck) await askToRead(tx, row, actor.id);
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'knowledge.status_changed', entityType: 'knowledge', entityId: id, metadata: { title: row.title, from: row.status, to: status }, ...client });
    });
    return this.getById(actor, id);
  },

  /** "Tanishdim" — joriy versiya uchun, takror bosilsa xato emas */
  async acknowledge(actor: AuthUser, id: string): Promise<KnowledgeDetailDto> {
    const manage = await canManage(actor);
    const row = await prisma.knowledgeArticle.findFirst({ where: { AND: [{ id }, readableWhere(actor, manage), { status: 'PUBLISHED' }] }, select: { id: true, version: true } });
    if (!row) throw AppError.notFound('Hujjat topilmadi');
    await prisma.knowledgeAcknowledgement.createMany({ data: [{ articleId: id, userId: actor.id, version: row.version }], skipDuplicates: true });
    return this.getById(actor, id);
  },
};
