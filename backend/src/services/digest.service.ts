import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { AlertSeverity, TransactionType } from '../generated/prisma/client.js';
import { addDays, businessDateString, startOfBusinessDay } from '../utils/dates.js';
import { getAlertSettings } from './alert.service.js';
import { OPERATING_LEDGER_WHERE } from './ledger.js';

/**
 * Rahbar uchun kunlik xulosa: kechagi tushum, xarajat, yangi o‘quvchilar, davomat, sotuv,
 * qarzdorlik va muhim ogohlantirishlar.
 *
 * Yetkazish kanallari `DigestChannel` interfeysi orqali ulanadi. Hozir tizim ichidagi
 * bildirishnoma ishlaydi; email yoki Telegram kanali shu interfeysni amalga oshirib,
 * `sendDaily` ga uzatiladi — xulosani hisoblash kodi o‘zgarmaydi.
 */

export interface DailyDigestDto {
  /** Xulosa qaysi kun uchun (o‘quv markaz sanasi) */
  date: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  newStudents: number;
  newLeads: number;
  wonLeads: number;
  /** Davomat belgilanmagan bo‘lsa null */
  attendanceRate: number | null;
  attendanceMarks: number;
  totalDebt: number;
  debtors: number;
  openAlerts: number;
  criticalAlerts: number;
  importantAlerts: Array<{ id: string; title: string; severity: AlertSeverity }>;
}

export interface DigestMessage {
  title: string;
  message: string;
}

export interface DigestChannel {
  readonly name: string;
  /** true — yetkazildi; false — allaqachon yuborilgan yoki yetkazib bo‘lmadi */
  deliver(userId: string, digest: DailyDigestDto, message: DigestMessage): Promise<boolean>;
}

export interface DigestSendResultDto {
  date: string | null;
  sent: number;
  /** disabled — sozlamada o‘chirilgan; too-early — belgilangan soat hali kelmagan */
  skipped: 'disabled' | 'too-early' | null;
}

/** Tizim ichidagi bildirishnoma — kuniga har bir xodimga bitta (dedupeKey) */
export const inAppDigestChannel: DigestChannel = {
  name: 'in-app',
  async deliver(userId, digest, message) {
    const result = await prisma.notification.createMany({
      data: [
        {
          userId,
          type: 'DAILY_DIGEST',
          title: message.title,
          message: message.message,
          entityType: 'digest',
          entityId: digest.date,
          dedupeKey: `digest:${digest.date}:${userId}`,
        },
      ],
      skipDuplicates: true,
    });
    return result.count > 0;
  },
};

function formatSum(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}${String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so‘m`;
}

function displayDate(value: string): string {
  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
}

export const digestService = {
  /** Berilgan kun (standart — kecha) uchun xulosa */
  async build(date?: string, now: Date = new Date()): Promise<DailyDigestDto> {
    const day = date ?? businessDateString(addDays(startOfBusinessDay(now), -1));
    const start = startOfBusinessDay(new Date(`${day}T12:00:00.000Z`));
    const end = addDays(start, 1);
    const range = { gte: start, lt: end };

    const ledger = await prisma.transaction.groupBy({
      by: ['type'],
      where: { ...OPERATING_LEDGER_WHERE, occurredAt: range },
      _sum: { amount: true },
    });
    const sumOf = (type: TransactionType) => ledger.find((row) => row.type === type)?._sum.amount?.toNumber() ?? 0;
    const revenue = sumOf('INCOME') - sumOf('REFUND');
    const expenses = sumOf('EXPENSE');

    const newStudents = await prisma.student.count({ where: { deletedAt: null, createdAt: range } });
    const newLeads = await prisma.lead.count({ where: { deletedAt: null, createdAt: range } });
    const wonLeads = await prisma.lead.count({ where: { deletedAt: null, status: 'WON', convertedAt: range } });

    // Davomat sanasi @db.Date — kun UTC yarim tun bilan saqlanadi
    const marks = await prisma.attendance.groupBy({
      by: ['status'],
      where: { date: new Date(`${day}T00:00:00.000Z`) },
      _count: { _all: true },
    });
    const attendanceMarks = marks.reduce((sum, row) => sum + row._count._all, 0);
    const attended = marks.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').reduce((sum, row) => sum + row._count._all, 0);

    const debt = await prisma.debt.aggregate({
      where: { remainingAmount: { gt: 0 }, student: { deletedAt: null } },
      _sum: { remainingAmount: true },
      _count: { _all: true },
    });

    const openAlerts = await prisma.alert.count({ where: { resolvedAt: null } });
    const criticalAlerts = await prisma.alert.count({ where: { resolvedAt: null, severity: 'CRITICAL' } });
    const importantAlerts = await prisma.alert.findMany({
      where: { resolvedAt: null, severity: { in: ['CRITICAL', 'WARNING'] } },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, severity: true },
    });

    return {
      date: day,
      revenue,
      expenses,
      netProfit: revenue - expenses,
      newStudents,
      newLeads,
      wonLeads,
      attendanceRate: attendanceMarks === 0 ? null : Math.round((attended / attendanceMarks) * 100),
      attendanceMarks,
      totalDebt: debt._sum.remainingAmount?.toNumber() ?? 0,
      debtors: debt._count._all,
      openAlerts,
      criticalAlerts,
      importantAlerts,
    };
  },

  /** Kanal uchun qisqa matn */
  format(digest: DailyDigestDto): DigestMessage {
    const parts = [
      `Tushum: ${formatSum(digest.revenue)}`,
      `Xarajat: ${formatSum(digest.expenses)}`,
      `Sof: ${formatSum(digest.netProfit)}`,
      `Yangi o‘quvchi: ${digest.newStudents}`,
      `Sotuv: ${digest.wonLeads} (${digest.newLeads} yangi lead)`,
      ...(digest.attendanceRate === null ? [] : [`Davomat: ${digest.attendanceRate}%`]),
      `Qarzdorlik: ${formatSum(digest.totalDebt)} (${digest.debtors} ta)`,
      `Kritik ogohlantirish: ${digest.criticalAlerts}`,
    ];
    const top = digest.importantAlerts.slice(0, 3).map((alert) => alert.title);
    return {
      title: `Kunlik xulosa: ${displayDate(digest.date)}`,
      message: `${parts.join(' · ')}${top.length > 0 ? `. Muhim: ${top.join('; ')}` : ''}`,
    };
  },

  /** Belgilangan soatdan keyin analytics.view ruxsati bor xodimlarga bir marta yuboradi */
  async sendDaily(now: Date = new Date(), channels: readonly DigestChannel[] = [inAppDigestChannel]): Promise<DigestSendResultDto> {
    const settings = await getAlertSettings();
    if (!settings.digestEnabled) return { date: null, sent: 0, skipped: 'disabled' };
    const hour = new Date(now.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000).getUTCHours();
    if (hour < settings.digestHour) return { date: null, sent: 0, skipped: 'too-early' };

    const digest = await this.build(undefined, now);
    const message = this.format(digest);
    const recipients = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        role: { permissions: { some: { permission: { key: PERMISSIONS.ANALYTICS_VIEW } } } },
      },
      select: { id: true },
    });

    let sent = 0;
    for (const recipient of recipients) {
      for (const channel of channels) {
        if (await channel.deliver(recipient.id, digest, message)) sent += 1;
      }
    }
    return { date: digest.date, sent, skipped: null };
  },
};
