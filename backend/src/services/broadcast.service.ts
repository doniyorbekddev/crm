import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { BroadcastAudience, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { BroadcastInput } from '../validators/broadcast.validator.js';
import { auditService } from './audit.service.js';
import { branchFilter, getBranchAccess } from './branchAccess.js';
import { permissionService } from './permission.service.js';
import { escapeHtml } from './telegram.service.js';

/**
 * Ommaviy Telegram xabari.
 *
 * Xabar **to'g'ridan-to'g'ri yuborilmaydi** — mavjud yetkazish navbatiga tushadi
 * (`NotificationDelivery`): Telegram chegarasi, qayta urinish va "chat bloklagan" holatlari
 * o'sha yerda hal bo'ladi. 500 ta chatga bir zumda urish o'rniga navbat partiyalab yuboradi.
 *
 * Auditoriya **filial doirasida** (`branchAccess`): filial admini boshqa filial o'quvchilariga
 * yoza olmaydi. Faqat tasdiqlangan, faol chatlar hisobga olinadi.
 */

export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  STUDENTS: 'Barcha o‘quvchilar',
  PARENTS: 'Barcha ota-onalar',
  TEACHERS: 'O‘qituvchilar',
  STAFF: 'Barcha xodimlar',
  GROUP: 'Guruh',
  COURSE: 'Kurs',
};

export interface BroadcastPreviewDto {
  audience: BroadcastAudience;
  label: string;
  recipients: number;
}

export interface BroadcastDto extends BroadcastPreviewDto {
  id: string;
  message: string;
  sent: number;
  failed: number;
  pending: number;
  createdAt: string;
  createdBy: string | null;
}

const BROADCAST_TITLE = '📢 Xabar';

async function requireBroadcastPermission(actor: AuthUser): Promise<void> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  if (!permissions.has(PERMISSIONS.BROADCAST_SEND)) {
    throw AppError.forbidden('Ommaviy xabar yuborish huquqingiz yo‘q');
  }
}

/** Tasdiqlangan va faol chatlar — faqat shularga yuboriladi */
const LIVE_LINK: Prisma.TelegramLinkWhereInput = { verifiedAt: { not: null }, isActive: true, chatId: { not: null } };

/**
 * Auditoriyani chat ro'yxatiga aylantiradi.
 *
 * Guruh/kurs uchun `includeParents` bo'lsa o'quvchilarning ota-onalari ham qo'shiladi —
 * "ertaga dars yo'q" kabi xabar aynan ota-onaga kerak.
 */
async function resolveAudience(actor: AuthUser, input: BroadcastInput): Promise<{ linkIds: string[]; label: string }> {
  const access = await getBranchAccess(actor);
  const scope = branchFilter(access);
  const activeStudent: Prisma.StudentWhereInput = { deletedAt: null, status: 'ACTIVE', ...scope };

  const linksFor = async (where: Prisma.TelegramLinkWhereInput) =>
    (await prisma.telegramLink.findMany({ where: { ...LIVE_LINK, ...where }, select: { id: true } })).map((row) => row.id);

  const studentsAndParents = async (students: Prisma.StudentWhereInput, includeParents: boolean) => {
    const ids = (await prisma.student.findMany({ where: students, select: { id: true } })).map((row) => row.id);
    if (ids.length === 0) return [];
    const where: Prisma.TelegramLinkWhereInput[] = [{ studentId: { in: ids } }];
    if (includeParents) where.push({ parent: { students: { some: { studentId: { in: ids } } } } });
    return linksFor({ OR: where });
  };

  switch (input.audience) {
    case 'STUDENTS':
      return { linkIds: await studentsAndParents(activeStudent, false), label: AUDIENCE_LABELS.STUDENTS };
    case 'PARENTS':
      return {
        linkIds: await linksFor({ parent: { students: { some: { student: activeStudent } } } }),
        label: AUDIENCE_LABELS.PARENTS,
      };
    case 'TEACHERS':
      return {
        linkIds: await linksFor({ user: { deletedAt: null, status: 'ACTIVE', role: { key: 'TEACHER' }, ...scope } }),
        label: AUDIENCE_LABELS.TEACHERS,
      };
    case 'STAFF':
      return { linkIds: await linksFor({ user: { deletedAt: null, status: 'ACTIVE', ...scope } }), label: AUDIENCE_LABELS.STAFF };
    case 'GROUP': {
      const group = await prisma.group.findFirst({ where: { id: input.targetId ?? '', ...scope }, select: { id: true, name: true } });
      if (!group) throw AppError.notFound('Guruh topilmadi');
      return {
        linkIds: await studentsAndParents({ ...activeStudent, groupId: group.id }, input.includeParents),
        label: `${AUDIENCE_LABELS.GROUP}: ${group.name}${input.includeParents ? ' (+ ota-onalar)' : ''}`,
      };
    }
    case 'COURSE': {
      const course = await prisma.course.findFirst({ where: { id: input.targetId ?? '' }, select: { id: true, name: true } });
      if (!course) throw AppError.notFound('Kurs topilmadi');
      return {
        linkIds: await studentsAndParents({ ...activeStudent, courseId: course.id }, input.includeParents),
        label: `${AUDIENCE_LABELS.COURSE}: ${course.name}${input.includeParents ? ' (+ ota-onalar)' : ''}`,
      };
    }
  }
}

const broadcastSelect = {
  id: true,
  audience: true,
  label: true,
  message: true,
  recipients: true,
  createdAt: true,
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TelegramBroadcastSelect;

async function toDto(row: Prisma.TelegramBroadcastGetPayload<{ select: typeof broadcastSelect }>): Promise<BroadcastDto> {
  const grouped = await prisma.notificationDelivery.groupBy({ by: ['status'], where: { broadcastId: row.id }, _count: { _all: true } });
  const count = (status: string) => grouped.find((item) => item.status === status)?._count._all ?? 0;
  return {
    id: row.id,
    audience: row.audience,
    label: row.label,
    message: row.message,
    recipients: row.recipients,
    sent: count('SENT'),
    failed: count('FAILED') + count('SKIPPED'),
    pending: count('PENDING'),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : null,
  };
}

export const broadcastService = {
  /** Yuborishdan oldin: nechta chatga ketishini ko'rsatadi */
  async preview(actor: AuthUser, input: BroadcastInput): Promise<BroadcastPreviewDto> {
    await requireBroadcastPermission(actor);
    const { linkIds, label } = await resolveAudience(actor, input);
    return { audience: input.audience, label, recipients: linkIds.length };
  },

  /** Yozuv + navbat — bitta tranzaksiyada; audit bilan */
  /**
   * `media` — botdan yuborilgan rasm/hujjat (Telegram file_id): har bir chatga shu fayl izoh bilan
   * qayta yuboriladi (TZ 3.0 §43 "Broadcast Media"). Web'dan faqat matn.
   */
  async send(actor: AuthUser, input: BroadcastInput, client: ClientInfo, media: { kind: 'photo' | 'document'; fileId: string } | null = null): Promise<BroadcastDto> {
    await requireBroadcastPermission(actor);
    const { linkIds, label } = await resolveAudience(actor, input);
    if (linkIds.length === 0) {
      throw AppError.unprocessable('Bu auditoriyada Telegram ulagan hech kim yo‘q');
    }

    const created = await prisma.$transaction(async (tx) => {
      const broadcast = await tx.telegramBroadcast.create({
        data: {
          createdById: actor.id,
          audience: input.audience,
          targetId: input.targetId ?? null,
          label,
          message: input.message,
          mediaKind: media?.kind ?? null,
          mediaFileId: media?.fileId ?? null,
          recipients: linkIds.length,
        },
        select: broadcastSelect,
      });

      // Matn HTML rejimida yuboriladi — foydalanuvchi yozgan `<` belgisi xabarni buzmasin
      const body = escapeHtml(input.message);
      await tx.notificationDelivery.createMany({
        data: linkIds.map((linkId) => ({
          channel: 'TELEGRAM' as const,
          telegramLinkId: linkId,
          broadcastId: broadcast.id,
          title: BROADCAST_TITLE,
          body,
          mediaKind: media?.kind ?? null,
          mediaFileId: media?.fileId ?? null,
          dedupeKey: `broadcast:${broadcast.id}:TELEGRAM:${linkId}`.slice(0, 200),
        })),
        skipDuplicates: true,
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'broadcast.sent',
        entityType: 'settings',
        entityId: broadcast.id,
        metadata: { audience: input.audience, label, recipients: linkIds.length, preview: input.message.slice(0, 120), media: media?.kind ?? null },
        ...client,
      });
      return broadcast;
    });

    return toDto(created);
  },

  /** So'nggi xabarlar va ularning yetkazilish statistikasi */
  async list(actor: AuthUser, limit = 10): Promise<BroadcastDto[]> {
    await requireBroadcastPermission(actor);
    const rows = await prisma.telegramBroadcast.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: broadcastSelect });
    return Promise.all(rows.map(toDto));
  },

  async getById(actor: AuthUser, id: string): Promise<BroadcastDto> {
    await requireBroadcastPermission(actor);
    const row = await prisma.telegramBroadcast.findUnique({ where: { id }, select: broadcastSelect });
    if (!row) throw AppError.notFound('Xabar topilmadi');
    return toDto(row);
  },
};
