import { prisma } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Cheksiz o'sadigan xizmat jadvallarini saqlash muddati bo'yicha tozalash (CRM 4.0, 1-faza).
 *
 * Faqat **o'z vazifasini bajarib bo'lgan** yozuvlar o'chiriladi:
 *  - muddati tugagan refresh tokenlar (ular bilan baribir kirib bo'lmaydi);
 *  - Telegram hodisalari, AI so'rovlari, avtomatlashtirish yurishlari — texnik jurnal;
 *  - yakunlangan (yuborilgan / xato / o'tkazilgan) yetkazish yozuvlari — navbatdagi PENDING ga tegilmaydi;
 *  - eski bildirishnomalar — o'qilgani ertaroq, o'qilmagani ancha keyin.
 *
 * Tegilmaydi: audit jurnali (o'z sozlamasi va jobi bor), XP tranzaksiyalari (ball shulardan yig'iladi),
 * moliya, davomat, baholar va boshqa biznes ma'lumotlari.
 *
 * O'chirish bo'laklab bajariladi: bitta katta `DELETE` jadvalni uzoq band qilmasin.
 */
export const RETENTION_DAYS = {
  /** Muddati tugaganidan keyin yana shuncha kun (xavfsizlik tekshiruvi uchun iz qoladi) */
  refreshTokens: 30,
  telegramEvents: 90,
  aiQueries: 180,
  automationRuns: 90,
  notificationDeliveries: 90,
  notificationsRead: 180,
  notificationsUnread: 365,
  riskSnapshots: 400,
} as const;

const DAY_MS = 86_400_000;
const BATCH = 5_000;
/** Bitta yurishda bitta jadvaldan eng ko'pi (BATCH × shu) qator — birinchi tozalash ham jobni soatlab band qilmasin */
const MAX_BATCHES = 40;

export interface RetentionResult {
  refreshTokens: number;
  telegramEvents: number;
  aiQueries: number;
  automationRuns: number;
  notificationDeliveries: number;
  notifications: number;
  riskSnapshots: number;
}

/** `DELETE … WHERE ctid IN (SELECT … LIMIT n)` ni qator qolmaguncha (yoki chegaragacha) takrorlaydi */
async function deleteInBatches(table: string, condition: Prisma.Sql): Promise<number> {
  const name = Prisma.raw(`"${table}"`);
  let total = 0;
  for (let round = 0; round < MAX_BATCHES; round += 1) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM ${name} WHERE ctid IN (SELECT ctid FROM ${name} WHERE ${condition} LIMIT ${BATCH})
    `;
    total += deleted;
    if (deleted < BATCH) break;
  }
  return total;
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export async function cleanupRetention(now: Date = new Date()): Promise<RetentionResult> {
  const refreshTokens = await deleteInBatches('refresh_tokens', Prisma.sql`"expiresAt" < ${daysBefore(now, RETENTION_DAYS.refreshTokens)}`);
  const telegramEvents = await deleteInBatches('telegram_events', Prisma.sql`"createdAt" < ${daysBefore(now, RETENTION_DAYS.telegramEvents)}`);
  const aiQueries = await deleteInBatches('ai_queries', Prisma.sql`"createdAt" < ${daysBefore(now, RETENTION_DAYS.aiQueries)}`);
  const automationRuns = await deleteInBatches('automation_runs', Prisma.sql`"startedAt" < ${daysBefore(now, RETENTION_DAYS.automationRuns)}`);
  const notificationDeliveries = await deleteInBatches(
    'notification_deliveries',
    Prisma.sql`"createdAt" < ${daysBefore(now, RETENTION_DAYS.notificationDeliveries)} AND "status" <> 'PENDING'`,
  );
  const notifications = await deleteInBatches(
    'notifications',
    Prisma.sql`("readAt" IS NOT NULL AND "createdAt" < ${daysBefore(now, RETENTION_DAYS.notificationsRead)})
      OR "createdAt" < ${daysBefore(now, RETENTION_DAYS.notificationsUnread)}`,
  );
  const riskSnapshots = await deleteInBatches('risk_snapshots', Prisma.sql`"date" < ${daysBefore(now, RETENTION_DAYS.riskSnapshots)}`);

  return { refreshTokens, telegramEvents, aiQueries, automationRuns, notificationDeliveries, notifications, riskSnapshots };
}
