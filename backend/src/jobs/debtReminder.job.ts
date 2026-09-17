import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { PERMISSIONS } from '../config/permissions.js';
import { logger } from '../utils/logger.js';
import { moneyUz } from '../utils/money.js';

/** Har 30 daqiqada tekshiriladi, lekin bildirishnoma kuniga bir marta yuboriladi (dedupeKey orqali) */
const INTERVAL_MS = 30 * 60_000;

function businessDateString(value: Date): string {
  return new Date(value.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/**
 * Qarzdorlik bo‘yicha kunlik xulosa: `debt.view` ruxsati bor xodimlarga
 * (buxgalter, admin) kuniga bitta umumiy bildirishnoma yuboriladi.
 */
export async function sendDailyDebtSummary(now: Date): Promise<number> {
  const aggregate = await prisma.debt.aggregate({
    where: { student: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } }, remainingAmount: { gt: 0 } },
    _sum: { remainingAmount: true },
    _count: { _all: true },
  });

  const debtors = aggregate._count._all;
  if (debtors === 0) return 0;

  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      role: { permissions: { some: { permission: { key: PERMISSIONS.DEBT_VIEW } } } },
    },
    select: { id: true },
  });
  if (users.length === 0) return 0;

  const date = businessDateString(now);
  const total = aggregate._sum.remainingAmount?.toNumber() ?? 0;
  const result = await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: 'DEBT_REMINDER' as const,
      title: 'Qarzdorlik hisoboti',
      message: `${debtors} ta o‘quvchida jami ${moneyUz(total)} qarz bor.`,
      entityType: 'debt',
      dedupeKey: `debt-summary:${date}:${user.id}`,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const sent = await sendDailyDebtSummary(new Date());
    if (sent > 0) {
      logger.info({ sent }, 'Qarzdorlik bo‘yicha kunlik bildirishnoma yuborildi');
    }
  } catch (error) {
    logger.error({ err: error }, 'Qarzdorlik eslatmasi jobida xatolik');
  } finally {
    running = false;
  }
}

/** Kunlik qarzdorlik xulosasini yuboradi. Takrorlanish `dedupeKey` bilan bloklanadi. */
export function startDebtReminderJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
