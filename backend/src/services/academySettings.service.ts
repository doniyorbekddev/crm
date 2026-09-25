import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { detectFileType, removeStoredFile, resolveStoredPath, saveFile } from '../utils/fileStorage.js';
import { logger } from '../utils/logger.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { academySettingsSchema, WEEKDAYS } from '../validators/academySettings.validator.js';
import type { AcademySettingsInput } from '../validators/academySettings.validator.js';
import { auditService } from './audit.service.js';

/**
 * Umumiy "Markaz ma'lumotlari" (TZ 3.1 GAP-01) — mavjud `Setting` (key/value) modelida, bitta kalit.
 * Boshqa modul sozlamalari (audit, mastery, alert) o'z kalitlarida qoladi — bu yerda takrorlanmaydi.
 *
 * Qoidalar:
 *  - o'zgartirish — faqat `settings.manage` (OWNER, SUPER_ADMIN); ADMIN, o'qituvchi, sotuv — 403;
 *  - har o'zgarish auditga: kim, oldingi va yangi qiymat, vaqt, IP, brauzer (bitta tranzaksiyada);
 *  - vaqt mintaqasi **ko'rsatish** uchun: hisob-kitoblar `APP_UTC_OFFSET_MINUTES` bo'yicha qoladi
 *    (runtime o'zgarishi o'tgan hisobotlar sanasini siljitardi);
 *  - valyuta — summalar yonidagi belgi, konvertatsiya qilinmaydi.
 */
export const ACADEMY_SETTINGS_KEY = 'academy.profile';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

interface StoredLogo {
  path: string;
  mime: string;
  updatedAt: string;
}

interface StoredValue extends AcademySettingsInput {
  logo?: StoredLogo | null;
}

export interface AcademySettingsDto extends AcademySettingsInput {
  logoUrl: string | null;
  /** Hali saqlanmagan — standart qiymatlar ko'rsatilmoqda */
  configured: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; firstName: string; lastName: string } | null;
}

/** Kirishdan oldin ham kerak bo'ladigan minimal ma'lumot (login sahifasi, sarlavha, valyuta) */
export interface BrandingDto {
  name: string;
  logoUrl: string | null;
  currency: AcademySettingsInput['currency'];
  defaultLanguage: AcademySettingsInput['defaultLanguage'];
}

function defaultAcademicYear(now: Date): { start: string; end: string } {
  // O'quv yili sentabrdan: iyuldan oldin — o'tgan yilgi sentabr
  const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { start: `${startYear}-09-01`, end: `${startYear + 1}-06-30` };
}

export function defaultAcademySettings(now: Date = new Date()): AcademySettingsInput {
  return {
    name: 'IT-Academy',
    workingHours: WEEKDAYS.map((day) => ({ day, isOpen: day !== 'SUNDAY', from: '09:00', to: '18:00' })),
    currency: 'UZS',
    academicYear: defaultAcademicYear(now),
    timezone: 'Asia/Tashkent',
    defaultLanguage: 'uz',
  };
}

/**
 * Saqlangan qiymat eski yoki qo'lda buzilgan bo'lsa ham ilova ishlaydi: sxemadan o'tmagan
 * maydonlar standartga qaytadi (butun yozuv tashlab yuborilmaydi).
 */
function parseStored(raw: unknown): { settings: AcademySettingsInput; logo: StoredLogo | null } {
  const base = defaultAcademySettings();
  if (!raw || typeof raw !== 'object') return { settings: base, logo: null };
  const value = raw as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base) as Array<keyof AcademySettingsInput>) {
    if (value[key] === undefined) continue;
    const candidate = academySettingsSchema.shape[key].safeParse(value[key]);
    if (candidate.success) merged[key] = candidate.data;
  }
  for (const key of ['phone', 'email', 'address'] as const) {
    const candidate = academySettingsSchema.shape[key].safeParse(value[key]);
    if (candidate.success && candidate.data !== undefined) merged[key] = candidate.data;
  }
  const logo = value.logo && typeof value.logo === 'object' ? (value.logo as StoredLogo) : null;
  return { settings: merged as unknown as AcademySettingsInput, logo: logo?.path ? logo : null };
}

function logoUrl(logo: StoredLogo | null): string | null {
  // Versiya — keshlangan eski logo yangilanganda almashishi uchun
  return logo ? `/public/branding/logo?v=${encodeURIComponent(logo.updatedAt)}` : null;
}

async function loadRow() {
  return prisma.setting.findUnique({
    where: { key: ACADEMY_SETTINGS_KEY },
    select: { value: true, updatedAt: true, updatedBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

async function writeValue(tx: Prisma.TransactionClient, actorId: string, value: StoredValue): Promise<void> {
  await tx.setting.upsert({
    where: { key: ACADEMY_SETTINGS_KEY },
    update: { value: value as unknown as Prisma.InputJsonValue, updatedById: actorId },
    create: { key: ACADEMY_SETTINGS_KEY, value: value as unknown as Prisma.InputJsonValue, description: 'Markaz ma’lumotlari', updatedById: actorId },
  });
}

export const academySettingsService = {
  async get(): Promise<AcademySettingsDto> {
    const row = await loadRow();
    const { settings, logo } = parseStored(row?.value);
    return {
      ...settings,
      logoUrl: logoUrl(logo),
      configured: Boolean(row),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  },

  async branding(): Promise<BrandingDto> {
    const row = await prisma.setting.findUnique({ where: { key: ACADEMY_SETTINGS_KEY }, select: { value: true } });
    const { settings, logo } = parseStored(row?.value);
    return { name: settings.name, logoUrl: logoUrl(logo), currency: settings.currency, defaultLanguage: settings.defaultLanguage };
  },

  async save(actor: AuthUser, input: AcademySettingsInput, client: ClientInfo): Promise<AcademySettingsDto> {
    const row = await loadRow();
    const before = parseStored(row?.value);
    await prisma.$transaction(async (tx) => {
      // Logo alohida endpoint orqali — saqlashda o'zgarmaydi
      await writeValue(tx, actor.id, { ...input, logo: before.logo });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'settings.academy_updated',
        entityType: 'settings',
        entityId: ACADEMY_SETTINGS_KEY,
        // Birinchi saqlashda "oldingi" yo'q — standart qiymatlar audit izi emas
        ...(row ? { before: { ...before.settings } as Prisma.InputJsonValue } : {}),
        after: { ...input } as Prisma.InputJsonValue,
        ...client,
      });
    });
    return this.get();
  },

  async uploadLogo(actor: AuthUser, buffer: unknown, client: ClientInfo): Promise<AcademySettingsDto> {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw AppError.unprocessable('Fayl bo‘sh', [{ field: 'file', message: 'Rasmni tanlang' }]);
    }
    if (buffer.length > LOGO_MAX_BYTES) {
      throw AppError.unprocessable('Logo 2 MB dan oshmasin', [{ field: 'file', message: 'Fayl juda katta' }]);
    }
    const type = detectFileType(buffer);
    if (!type || type.mime === 'application/pdf') {
      throw AppError.unprocessable('Logo faqat PNG, JPG yoki WEBP bo‘lishi mumkin', [{ field: 'file', message: 'Fayl turi qo‘llanmaydi' }]);
    }
    const row = await loadRow();
    const current = parseStored(row?.value);
    const stored: StoredLogo = { path: await saveFile(buffer, type.ext), mime: type.mime, updatedAt: new Date().toISOString() };
    try {
      await prisma.$transaction(async (tx) => {
        await writeValue(tx, actor.id, { ...current.settings, logo: stored });
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'settings.academy_logo_updated',
          entityType: 'settings',
          entityId: ACADEMY_SETTINGS_KEY,
          before: { logo: current.logo ? { mime: current.logo.mime, updatedAt: current.logo.updatedAt } : null },
          after: { logo: { mime: stored.mime, updatedAt: stored.updatedAt, size: buffer.length } },
          ...client,
        });
      });
    } catch (error) {
      await removeStoredFile(stored.path).catch(() => undefined);
      throw error;
    }
    if (current.logo) await removeStoredFile(current.logo.path).catch((error: unknown) => logger.warn({ err: error }, 'Eski logo o‘chirilmadi'));
    return this.get();
  },

  async removeLogo(actor: AuthUser, client: ClientInfo): Promise<AcademySettingsDto> {
    const row = await loadRow();
    const current = parseStored(row?.value);
    if (!current.logo) return this.get();
    await prisma.$transaction(async (tx) => {
      await writeValue(tx, actor.id, { ...current.settings, logo: null });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'settings.academy_logo_removed',
        entityType: 'settings',
        entityId: ACADEMY_SETTINGS_KEY,
        before: { logo: { mime: current.logo!.mime, updatedAt: current.logo!.updatedAt } },
        after: { logo: null },
        ...client,
      });
    });
    await removeStoredFile(current.logo.path).catch((error: unknown) => logger.warn({ err: error }, 'Logo fayli o‘chirilmadi'));
    return this.get();
  },

  /** Ochiq endpoint uchun: logo fayli (yo'q bo'lsa — 404) */
  async logoFile(): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const row = await prisma.setting.findUnique({ where: { key: ACADEMY_SETTINGS_KEY }, select: { value: true } });
    const { logo } = parseStored(row?.value);
    if (!logo) throw AppError.notFound('Logo yuklanmagan');
    return { absolutePath: resolveStoredPath(logo.path), fileName: `logo.${logo.path.split('.').pop() ?? 'png'}`, mimeType: logo.mime };
  },
};
