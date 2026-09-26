import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { BroadcastAudience, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { detectFileType, resolveStoredPath, sanitizeFileName, saveFile } from '../utils/fileStorage.js';
import type { BroadcastButton, BroadcastInput } from '../validators/broadcast.validator.js';
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

/**
 * Statistika (TZ 3.1 GAP-15): `recipients` — mo'ljal (targeted); `sent` — Telegram qabul qildi;
 * `delivered` — Bot API "yetkazildi/o'qildi" tasdig'ini **bermaydi**, shuning uchun Telegram qabul qilgani
 * (= `sent`) hisoblanadi (hujjatlangan); `failed` — yetmadi (bloklagan, xato) + o'tkazib yuborilgan (bog'lanish uzilgan).
 */
export interface BroadcastDto extends BroadcastPreviewDto {
  id: string;
  message: string;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  pending: number;
  mediaKind: 'photo' | 'document' | null;
  buttons: BroadcastButton[];
  createdAt: string;
  createdBy: string | null;
}

/** Web'dan yuklangan fayl: yuborishda shu token bilan olinadi */
export interface BroadcastMediaDto {
  token: string;
  kind: 'photo' | 'document';
  fileName: string;
  size: number;
}

/** Bir xodim soatiga ko'pi bilan shuncha ommaviy xabar (tasodifiy takror va suiiste'moldan) */
export const BROADCASTS_PER_HOUR = env.BROADCAST_HOURLY_LIMIT;
const MEDIA_TOKEN_TTL_SECONDS = 3600;
/** Telegram: rasm 10 MB gacha (hujjat 50 MB) — CRM yuklash chegarasi (MAX_UPLOAD_MB) undan kichik */
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Media tokeni alohida kalit bilan imzolanadi — access token o'rnida ishlatib bo'lmaydi */
function mediaSecret(): string {
  return createHash('sha256').update(`${env.JWT_SECRET}:broadcast-media`).digest('hex');
}

interface MediaClaims {
  p: string;
  k: 'photo' | 'document';
  n: string;
  u: string;
}

async function resolveMediaToken(actor: AuthUser, token: string): Promise<{ path: string; kind: 'photo' | 'document'; fileName: string }> {
  let claims: MediaClaims;
  try {
    claims = jwt.verify(token, mediaSecret(), { algorithms: ['HS256'], audience: 'broadcast-media' }) as MediaClaims;
  } catch {
    throw AppError.unprocessable('Fayl muddati o‘tgan yoki noto‘g‘ri — qaytadan yuklang', [{ field: 'mediaToken', message: 'Faylni qaytadan yuklang' }]);
  }
  // Boshqa xodim yuklagan faylni ishlatib bo'lmaydi
  if (claims.u !== actor.id) throw AppError.forbidden('Bu fayl sizga tegishli emas');
  try {
    await access(resolveStoredPath(claims.p));
  } catch {
    throw AppError.unprocessable('Fayl topilmadi — qaytadan yuklang', [{ field: 'mediaToken', message: 'Faylni qaytadan yuklang' }]);
  }
  return { path: claims.p, kind: claims.k, fileName: claims.n };
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
  mediaKind: true,
  buttons: true,
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
    delivered: count('SENT'),
    failed: count('FAILED') + count('SKIPPED'),
    skipped: count('SKIPPED'),
    pending: count('PENDING'),
    mediaKind: row.mediaKind === 'photo' || row.mediaKind === 'document' ? row.mediaKind : null,
    buttons: Array.isArray(row.buttons) ? (row.buttons as BroadcastButton[]) : [],
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

  /**
   * Web: rasm (PNG/JPG/WEBP) yoki PDF hujjatni CRM xotirasiga saqlaydi va yuborishda ishlatiladigan
   * tokenni qaytaradi (1 soat, faqat shu xodim uchun). Tur baytlar bo'yicha aniqlanadi.
   */
  async uploadMedia(actor: AuthUser, buffer: unknown, rawName: string | undefined): Promise<BroadcastMediaDto> {
    await requireBroadcastPermission(actor);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw AppError.unprocessable('Fayl yuborilmadi', [{ field: 'file', message: 'Faylni tanlang' }]);
    const type = detectFileType(buffer);
    if (!type) throw AppError.unprocessable('Faqat rasm (PNG, JPG, WEBP) yoki PDF hujjat', [{ field: 'file', message: 'Fayl turi qo‘llab-quvvatlanmaydi' }]);
    const kind = type.ext === 'pdf' ? 'document' : 'photo';
    if (kind === 'photo' && buffer.length > PHOTO_MAX_BYTES) throw AppError.unprocessable('Rasm 10 MB dan oshmasin', [{ field: 'file', message: 'Rasm juda katta' }]);
    const fileName = sanitizeFileName(rawName, type.ext);
    const path = await saveFile(buffer, type.ext);
    const claims: MediaClaims = { p: path, k: kind, n: fileName, u: actor.id };
    const token = jwt.sign(claims, mediaSecret(), { algorithm: 'HS256', audience: 'broadcast-media', expiresIn: MEDIA_TOKEN_TTL_SECONDS });
    return { token, kind, fileName, size: buffer.length };
  },

  /** Yozuv + navbat — bitta tranzaksiyada; audit bilan */
  /**
   * `media` — botdan yuborilgan rasm/hujjat (Telegram file_id): har bir chatga shu fayl izoh bilan
   * qayta yuboriladi (TZ 3.0 §43 "Broadcast Media"). Web'dan — `input.mediaToken` (CRM xotirasidagi fayl:
   * birinchi chatga yuklanadi, keyin olingan file_id bilan).
   */
  async send(actor: AuthUser, input: BroadcastInput, client: ClientInfo, media: { kind: 'photo' | 'document'; fileId: string } | null = null): Promise<BroadcastDto> {
    await requireBroadcastPermission(actor);
    const stored = input.mediaToken ? await resolveMediaToken(actor, input.mediaToken) : null;
    if (stored && media) throw AppError.unprocessable('Bitta xabarga bitta fayl');
    const since = new Date(Date.now() - 3_600_000);
    if ((await prisma.telegramBroadcast.count({ where: { createdById: actor.id, createdAt: { gte: since } } })) >= BROADCASTS_PER_HOUR) {
      throw AppError.tooManyRequests(`Soatiga ko‘pi bilan ${BROADCASTS_PER_HOUR} ta ommaviy xabar. Birozdan keyin urinib ko‘ring.`);
    }
    const { linkIds, label } = await resolveAudience(actor, input);
    if (linkIds.length === 0) {
      throw AppError.unprocessable('Bu auditoriyada Telegram ulagan hech kim yo‘q');
    }
    const buttons = input.buttons ?? [];
    const mediaKind = media?.kind ?? stored?.kind ?? null;

    const created = await prisma.$transaction(async (tx) => {
      const broadcast = await tx.telegramBroadcast.create({
        data: {
          createdById: actor.id,
          audience: input.audience,
          targetId: input.targetId ?? null,
          label,
          message: input.message,
          mediaKind,
          mediaFileId: media?.fileId ?? null,
          mediaPath: stored?.path ?? null,
          mediaFileName: stored?.fileName ?? null,
          ...(buttons.length ? { buttons } : {}),
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
          mediaKind,
          mediaFileId: media?.fileId ?? null,
          ...(buttons.length ? { buttons } : {}),
          dedupeKey: `broadcast:${broadcast.id}:TELEGRAM:${linkId}`.slice(0, 200),
        })),
        skipDuplicates: true,
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'broadcast.sent',
        entityType: 'settings',
        entityId: broadcast.id,
        metadata: { audience: input.audience, label, recipients: linkIds.length, preview: input.message.slice(0, 120), media: mediaKind, buttons: buttons.map((button) => button.url) },
        ...client,
      });
      return broadcast;
    });

    return toDto(created);
  },

  /** So'nggi xabarlar va ularning yetkazilish statistikasi */
  async list(actor: AuthUser, limit = 10): Promise<BroadcastDto[]> {
    await requireBroadcastPermission(actor);
    // Filial admini — faqat o'z filiali xodimlari yuborganlar (auditoriya ham filial doirasida edi)
    const branch = branchFilter(await getBranchAccess(actor));
    const rows = await prisma.telegramBroadcast.findMany({
      where: 'branchId' in branch ? { createdBy: { branchId: branch.branchId } } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: broadcastSelect,
    });
    return Promise.all(rows.map(toDto));
  },

  async getById(actor: AuthUser, id: string): Promise<BroadcastDto> {
    await requireBroadcastPermission(actor);
    const branch = branchFilter(await getBranchAccess(actor));
    const row = await prisma.telegramBroadcast.findFirst({ where: { id, ...('branchId' in branch ? { createdBy: { branchId: branch.branchId } } : {}) }, select: broadcastSelect });
    if (!row) throw AppError.notFound('Xabar topilmadi');
    return toDto(row);
  },
};
