import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import type { NotificationType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { startOfBusinessDay } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { eskizService, isSmsConfigured, normalizeSmsPhone, toSmsText } from './eskiz.service.js';

/**
 * SMS zaxira kanali sozlamasi (Eskiz.uz).
 *
 * SMS pulli, shuning uchun hammasi standart **o'chiq** va faqat tanlangan turlar uchun: xabar faqat
 * qabul qiluvchida tasdiqlangan Telegram chati bo'lmaganda SMS bo'lib ketadi (ikkalasi birga emas).
 * Kunlik limit va tungi vaqt (21:00–08:00) himoyasi navbatda (notificationDelivery.service.ts).
 */

export const SMS_SETTINGS_KEY = 'sms.settings';

/** SMS bo'lib ketishi mumkin bo'lgan turlar — qisqa va muhim xabarlar (vazifa, XP, hisobot emas) */
export const SMS_NOTIFICATION_TYPES = [
  { type: 'CHILD_ABSENT', label: 'Darsga kelmadi', example: 'Ali Valiyev - FE-1 guruhidagi 2026-10-21 kungi darsga kelmadi.' },
  { type: 'ATTENDANCE_LATE', label: 'Darsga kechikdi', example: 'FE-1 guruhidagi 21.10.2026 kungi darsga kechikib keldi.' },
  { type: 'DEBT_REMINDER', label: 'Muddati o‘tgan to‘lov', example: 'Ali Valiyev: 450 000 so‘m to‘lov muddati 3 kun oldin o‘tgan.' },
  { type: 'PAYMENT_DUE_SOON', label: 'To‘lov muddati yaqin', example: 'Ali Valiyev: 450 000 so‘m to‘lov muddati yaqinlashdi (3 kun ichida).' },
  { type: 'EXAM_SCHEDULED', label: 'Imtihon rejalashtirildi', example: 'FE-1: «Oraliq nazorat» - 25.10.2026 14:00.' },
  { type: 'EXAM_RESULT', label: 'Imtihon natijasi', example: '«Oraliq nazorat»: 42/50 ball (84%).' },
] as const satisfies ReadonlyArray<{ type: NotificationType; label: string; example: string }>;

export type SmsNotificationType = (typeof SMS_NOTIFICATION_TYPES)[number]['type'];
export type SmsRecipients = 'PARENTS' | 'PARENTS_AND_STUDENTS';

export interface SmsSettings {
  enabled: boolean;
  types: SmsNotificationType[];
  /** Kimga: faqat ota-onalarga (standart) yoki o'quvchilarga ham */
  recipients: SmsRecipients;
  /** Bir kunda yuboriladigan SMS chegarasi (xarajat himoyasi) */
  dailyLimit: number;
}

export const DEFAULT_SMS_SETTINGS: SmsSettings = { enabled: false, types: ['CHILD_ABSENT', 'DEBT_REMINDER'], recipients: 'PARENTS', dailyLimit: 200 };

const SMS_TYPE_SET = new Set<string>(SMS_NOTIFICATION_TYPES.map((item) => item.type));
/** Har bir xabarda sozlama o'qilmasin (davomatda o'nlab xabar bir tranzaksiyada) */
const CACHE_TTL_MS = 30_000;
let cache: { value: SmsSettings; at: number } | null = null;

function parse(value: unknown): SmsSettings {
  const saved = (value ?? {}) as Partial<SmsSettings>;
  const types = Array.isArray(saved.types) ? saved.types.filter((type): type is SmsNotificationType => SMS_TYPE_SET.has(type)) : DEFAULT_SMS_SETTINGS.types;
  const limit = typeof saved.dailyLimit === 'number' && Number.isFinite(saved.dailyLimit) ? Math.min(Math.max(Math.round(saved.dailyLimit), 1), 5000) : DEFAULT_SMS_SETTINGS.dailyLimit;
  return {
    enabled: saved.enabled === true,
    types: [...new Set(types)],
    recipients: saved.recipients === 'PARENTS_AND_STUDENTS' ? 'PARENTS_AND_STUDENTS' : 'PARENTS',
    dailyLimit: limit,
  };
}

export async function loadSmsSettings(): Promise<SmsSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: SMS_SETTINGS_KEY }, select: { value: true } });
  const value = parse(row?.value);
  cache = { value, at: Date.now() };
  return value;
}

/** Shu tur va qabul qiluvchi uchun SMS zaxirasi ishlaydimi (Eskiz sozlangan, yoqilgan, tur tanlangan) */
export async function smsFallbackAllowed(type: NotificationType, recipient: 'student' | 'parent'): Promise<boolean> {
  if (!isSmsConfigured()) return false;
  const settings = await loadSmsSettings();
  if (!settings.enabled || !settings.types.includes(type as SmsNotificationType)) return false;
  return recipient === 'parent' || settings.recipients === 'PARENTS_AND_STUDENTS';
}

/** Bugun (o'quv markaz kuni) yuborilgan SMS soni — kunlik limit uchun */
export async function smsSentToday(now: Date = new Date()): Promise<number> {
  return prisma.notificationDelivery.count({ where: { channel: 'SMS', status: 'SENT', sentAt: { gte: startOfBusinessDay(now) } } });
}

export interface SmsSettingsDto extends SmsSettings {
  /** Serverda ESKIZ_EMAIL/ESKIZ_PASSWORD bormi (qiymatlarning o'zi hech qachon qaytarilmaydi) */
  configured: boolean;
  sender: string;
  availableTypes: Array<{ type: SmsNotificationType; label: string; example: string }>;
  today: { sent: number; failed: number; skipped: number; pending: number };
  updatedAt: string | null;
}

export const smsSettingsService = {
  async get(now: Date = new Date()): Promise<SmsSettingsDto> {
    const [row, settings] = await Promise.all([
      prisma.setting.findUnique({ where: { key: SMS_SETTINGS_KEY }, select: { updatedAt: true } }),
      loadSmsSettings(),
    ]);
    const since = startOfBusinessDay(now);
    const grouped = await prisma.notificationDelivery.groupBy({
      by: ['status'],
      where: { channel: 'SMS', OR: [{ status: 'PENDING' }, { updatedAt: { gte: since } }] },
      _count: { _all: true },
    });
    const count = (status: string) => grouped.find((item) => item.status === status)?._count._all ?? 0;
    return {
      ...settings,
      configured: isSmsConfigured(),
      sender: env.ESKIZ_FROM,
      availableTypes: SMS_NOTIFICATION_TYPES.map((item) => ({ ...item, example: toSmsText(item.example) })),
      today: { sent: await smsSentToday(now), failed: count('FAILED'), skipped: count('SKIPPED'), pending: count('PENDING') },
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  },

  async save(actor: AuthUser, input: SmsSettings, client: ClientInfo): Promise<SmsSettingsDto> {
    if (input.enabled && !isSmsConfigured()) {
      throw AppError.unprocessable('Eskiz kalitlari serverda sozlanmagan — avval ESKIZ_EMAIL va ESKIZ_PASSWORD kiritilishi kerak');
    }
    if (input.enabled && input.types.length === 0) throw AppError.unprocessable('Kamida bitta xabar turini tanlang');
    const before = await loadSmsSettings();
    const value = parse(input);
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: SMS_SETTINGS_KEY },
        update: { value: value as unknown as Prisma.InputJsonValue, updatedById: actor.id },
        create: { key: SMS_SETTINGS_KEY, value: value as unknown as Prisma.InputJsonValue, description: 'SMS zaxira kanali (Eskiz)', updatedById: actor.id },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'sms.settings_updated',
        entityType: 'settings',
        entityId: SMS_SETTINGS_KEY,
        before: { ...before },
        after: { ...value },
        ...client,
      });
    });
    cache = null;
    return this.get();
  },

  /** Sinov SMS — darhol (navbatsiz). Eskiz sinov rejimida faqat "Bu Eskiz dan test" matni o'tadi */
  async test(actor: AuthUser, input: { phone: string; message: string }, client: ClientInfo): Promise<{ providerMessageId: string }> {
    if (!isSmsConfigured()) throw AppError.unprocessable('Eskiz kalitlari serverda sozlanmagan');
    const phone = normalizeSmsPhone(input.phone);
    if (!phone) throw AppError.unprocessable('Telefon raqami noto‘g‘ri (O‘zbekiston mobil raqami: +998 XX XXX XX XX)');
    const result = await eskizService.send(phone, toSmsText(input.message));
    await auditService.record({
      userId: actor.id,
      action: 'sms.test_sent',
      entityType: 'settings',
      entityId: SMS_SETTINGS_KEY,
      metadata: { phone: `${phone.slice(0, 5)}****${phone.slice(-3)}`, ok: result.ok, ...(result.error ? { error: result.error } : {}) },
      ...client,
    });
    if (!result.ok) throw AppError.badRequest(result.error ?? 'SMS yuborilmadi');
    return { providerMessageId: result.providerMessageId ?? '' };
  },

  balance(): Promise<number | null> {
    return eskizService.balance();
  },

  /** Testlar uchun */
  resetCache(): void {
    cache = null;
  },
};
