import { prisma } from '../../config/database.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService } from '../audit.service.js';
import { ACTION_LABELS } from './attendance.service.js';
import { autoOnly, clockTime, recomputeDay, toDateString } from './common.js';

/**
 * 2026-11-10 gacha jadval bo'yicha avtomatik yozilgan, QR bilan tasdiqlanmagan "keldi"larni bekor qilish.
 *
 * Avtomatik davomat "keldi"ni xodim kelgan-kelmaganidan qat'i nazar yozardi. Kunda FAQAT avtomatik hodisalar bo'lsa —
 * kelish hech narsa bilan tasdiqlanmagan: hodisalar rahbar tuzatishi kabi bekor qilinadi (sabab, oldingi holat va audit
 * bilan; hech narsa o'chirilmaydi) va kun "kelmadi" bo'ladi. Avtomatik "keldi" bilan birga QR yoki tuzatish hodisasi bor
 * kun (xodim haqiqatan kelgan, lekin kelish vaqti noma'lum) tegilmaydi — faqat sanaladi, rahbar ko'rib chiqadi.
 *
 * `apply: false` — faqat sanaydi (hech narsa yozmaydi).
 */
export const AUTO_CLEANUP_REASON = 'Avtomatik “keldi” bekor qilindi: kelish QR bilan tasdiqlanmagan (2026-11-10 tuzatishi)';

export interface AutoCleanupSummary {
  apply: boolean;
  /** Faqat avtomatik hodisali kunlar (bekor qilinadigan / qilingan) */
  autoOnlyDays: number;
  autoOnlyUsers: number;
  voidedEvents: number;
  /** Sana bo'yicha kunlar soni (ism yo'q) */
  byDate: Record<string, number>;
  /** Avtomatik "keldi" + QR/tuzatish hodisasi bor kunlar — tegilmaydi */
  mixedDays: number;
}

export async function cleanupAutoCheckIns(options: { apply: boolean; from?: string; to?: string }): Promise<AutoCleanupSummary> {
  const date: Prisma.DateTimeFilter = {};
  if (options.from) date.gte = new Date(`${options.from}T00:00:00Z`);
  if (options.to) date.lte = new Date(`${options.to}T00:00:00Z`);
  const days = await prisma.staffAttendanceDay.findMany({
    where: { ...(options.from || options.to ? { date } : {}), events: { some: { type: 'CHECK_IN', source: 'AUTO', voidedAt: null } } },
    select: { id: true, userId: true, date: true, events: { where: { voidedAt: null }, select: { source: true } } },
    orderBy: { date: 'asc' },
  });

  const targets = days.filter((day) => autoOnly(day.events));
  const summary: AutoCleanupSummary = {
    apply: options.apply,
    autoOnlyDays: targets.length,
    autoOnlyUsers: new Set(targets.map((day) => day.userId)).size,
    voidedEvents: 0,
    byDate: {},
    mixedDays: days.length - targets.length,
  };
  for (const day of targets) {
    const key = toDateString(day.date);
    summary.byDate[key] = (summary.byDate[key] ?? 0) + 1;
  }
  if (!options.apply) {
    summary.voidedEvents = targets.reduce((sum, day) => sum + day.events.length, 0);
    return summary;
  }

  const now = new Date();
  for (const target of targets) {
    summary.voidedEvents += await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "staff_attendance_days" WHERE "id" = ${target.id} FOR UPDATE`;
      const live = await tx.staffAttendanceEvent.findMany({
        where: { dayId: target.id, voidedAt: null },
        orderBy: { occurredAt: 'asc' },
        select: { id: true, type: true, occurredAt: true, source: true },
      });
      // Tekshiruv va yozish orasida xodim QR skanerlagan bo'lishi mumkin — qayta tekshiriladi
      if (!autoOnly(live)) return 0;
      const before = live.map((event) => ({ id: event.id, type: event.type, label: ACTION_LABELS[event.type], time: clockTime(event.occurredAt), source: event.source }));
      const correction = await tx.staffAttendanceCorrection.create({
        data: { dayId: target.id, createdById: null, reason: AUTO_CLEANUP_REASON, before: before as unknown as Prisma.InputJsonValue, after: [] },
      });
      await tx.staffAttendanceEvent.updateMany({
        where: { id: { in: live.map((event) => event.id) } },
        data: { voidedAt: now, voidedByCorrectionId: correction.id },
      });
      await recomputeDay(tx, target.id);
      await auditService.recordInTransaction(tx, {
        userId: null,
        action: 'staff_attendance.auto_voided',
        entityType: 'staffAttendanceDay',
        entityId: target.id,
        metadata: { userId: target.userId, date: toDateString(target.date), reason: AUTO_CLEANUP_REASON, correctionId: correction.id },
        before: before as unknown as Prisma.InputJsonValue,
        after: [],
      });
      return live.length;
    });
  }
  return summary;
}
