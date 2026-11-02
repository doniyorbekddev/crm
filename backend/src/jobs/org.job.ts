import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { notificationService } from '../services/notification.service.js';
import type { NotificationInput } from '../services/notification.service.js';
import { reportJobFailure, reportJobSuccess } from '../services/observability.js';
import { businessToday, daysBetween, fullName, permissionHolders, toDateOnly } from '../services/org/common.js';
import { addDays } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { withJobLease } from './jobLease.js';

const INTERVAL_MS = 60 * 60_000;
/** Sinov muddati tugashidan necha kun oldin eslatiladi */
export const PROBATION_NOTICE_DAYS = 7;

/**
 * ORG tizimi fon tekshiruvlari (soatiga bir marta).
 *
 * Sinov muddati (ORG §3.2): tugashiga 7 kun qolganda va tugagan kuni rahbarga (xodim kartasini boshqaradiganlarga)
 * bir martadan eslatma — qaror (davom ettirish yoki to'xtatish) o'z vaqtida qabul qilinsin.
 * Takrorlanmasligi bildirishnomaning `dedupeKey` i bilan (sana kalitda — sana o'zgarsa yangi eslatma).
 */
export async function notifyProbationEnds(now: Date): Promise<number> {
  const today = businessToday(now);
  const horizon = addDays(today, PROBATION_NOTICE_DAYS);
  const window = { gte: today, lte: horizon };
  const [employees, teachers] = await Promise.all([
    prisma.employee.findMany({
      where: { probationEndDate: window, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      select: { id: true, firstName: true, lastName: true, branchId: true, probationEndDate: true },
    }),
    prisma.teacherProfile.findMany({
      where: { probationEndDate: window, employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] }, user: { deletedAt: null } },
      select: { id: true, userId: true, probationEndDate: true, user: { select: { firstName: true, lastName: true, branchId: true } } },
    }),
  ]);

  const subjects = [
    ...employees.map((row) => ({ key: `employee:${row.id}`, name: fullName(row), branchId: row.branchId, end: row.probationEndDate!, link: `/employees?employee=${row.id}`, permission: PERMISSIONS.EMPLOYEE_MANAGE })),
    ...teachers.map((row) => ({ key: `teacher:${row.id}`, name: fullName(row.user), branchId: row.user.branchId, end: row.probationEndDate!, link: `/teachers/${row.id}`, permission: PERMISSIONS.TEACHER_MANAGE })),
  ];

  let sent = 0;
  for (const subject of subjects) {
    const left = daysBetween(today, subject.end);
    // Ikki nuqta: "bir hafta qoldi" (oynaga kirgan birinchi kun) va "bugun tugaydi"
    const stage = left === 0 ? 'due' : 'week';
    const recipients = await permissionHolders(subject.permission, subject.branchId);
    if (recipients.length === 0) continue;
    const date = toDateOnly(subject.end);
    const notifications: NotificationInput[] = recipients.map((userId) => ({
      userId,
      type: 'HR_UPDATE',
      title: stage === 'due' ? 'Sinov muddati bugun tugaydi' : 'Sinov muddati tugashiga oz qoldi',
      message:
        stage === 'due'
          ? `⏳ ${subject.name}: sinov muddati bugun (${date}) tugaydi — natijalarni ko‘rib, qaror qabul qiling.`
          : `⏳ ${subject.name}: sinov muddati ${date} da tugaydi (${left} kun qoldi).`,
      actionUrl: subject.link,
      dedupeKey: `probation:${subject.key}:${date}:${stage}:${userId}`,
    }));
    await prisma.$transaction((tx) => notificationService.createManyInTransaction(tx, notifications));
    sent += 1;
  }
  return sent;
}

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withJobLease('org', async () => {
      const probation = await notifyProbationEnds(new Date());
      if (probation > 0) logger.info({ probation }, 'ORG eslatmalari yuborildi');
    });
    reportJobSuccess('org');
  } catch (error) {
    reportJobFailure('org', error, 'ORG jobida xatolik');
  } finally {
    running = false;
  }
}

export function startOrgJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
