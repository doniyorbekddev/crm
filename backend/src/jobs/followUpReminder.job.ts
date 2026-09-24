import { prisma } from '../config/database.js';
import { formatLeadNumber } from '../config/leadLabels.js';
import { logger } from '../utils/logger.js';

const INTERVAL_MS = 60_000;
const BATCH_SIZE = 50;

const followUpSelect = {
  id: true,
  title: true,
  dueAt: true,
  assignedToId: true,
  lead: { select: { id: true, number: true, firstName: true, lastName: true, status: true } },
} as const;

function leadLabel(lead: { number: number; firstName: string; lastName: string | null }): string {
  return `${[lead.firstName, lead.lastName].filter(Boolean).join(' ')} (${formatLeadNumber(lead.number)})`;
}

/** Eslatma vaqti kelgan follow-uplar bo‘yicha bildirishnoma yuboradi. */
export async function sendDueReminders(now: Date): Promise<number> {
  const items = await prisma.followUp.findMany({
    where: { status: 'PENDING', reminderSentAt: null, remindAt: { lte: now }, assignedToId: { not: null } },
    select: followUpSelect,
    orderBy: { remindAt: 'asc' },
    take: BATCH_SIZE,
  });

  for (const item of items) {
    const userId = item.assignedToId;
    if (!userId) continue;
    // Lead sinov darsiga yozilgan bo'lsa — eslatma aynan sinov darsi haqida. Shu sababli
    // alohida tur ishlatiladi: bildirishnomalar ro'yxatida uni ajratib ko'rish va filtrlash mumkin.
    const isTrial = item.lead.status === 'TRIAL_BOOKED';
    await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: [
          {
            userId,
            type: isTrial ? 'TRIAL_LESSON_REMINDER' : 'FOLLOW_UP_REMINDER',
            title: isTrial ? 'Sinov darsi eslatmasi' : 'Follow-up eslatmasi',
            message: `${leadLabel(item.lead)}: ${item.title}`,
            entityType: 'followUp',
            entityId: item.id,
            dedupeKey: `followup-remind:${item.id}`,
          },
        ],
        skipDuplicates: true,
      });
      await tx.followUp.update({ where: { id: item.id }, data: { reminderSentAt: now } });
    });
  }
  return items.length;
}

/** Muddati o‘tib ketgan follow-uplar bo‘yicha bir marta ogohlantiradi. */
export async function sendOverdueAlerts(now: Date): Promise<number> {
  const items = await prisma.followUp.findMany({
    where: { status: 'PENDING', overdueNotifiedAt: null, dueAt: { lt: now }, assignedToId: { not: null } },
    select: followUpSelect,
    orderBy: { dueAt: 'asc' },
    take: BATCH_SIZE,
  });

  for (const item of items) {
    const userId = item.assignedToId;
    if (!userId) continue;
    await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: [
          {
            userId,
            type: 'FOLLOW_UP_OVERDUE',
            title: 'Follow-up muddati o‘tdi',
            message: `${leadLabel(item.lead)}: ${item.title}`,
            entityType: 'followUp',
            entityId: item.id,
            dedupeKey: `followup-overdue:${item.id}`,
          },
        ],
        skipDuplicates: true,
      });
      await tx.followUp.update({ where: { id: item.id }, data: { overdueNotifiedAt: now } });
    });
  }
  return items.length;
}

let running = false;

async function runOnce(): Promise<void> {
  // Oldingi ishlov tugamagan bo‘lsa, yangisini boshlamaymiz
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const reminders = await sendDueReminders(now);
    const overdue = await sendOverdueAlerts(now);
    if (reminders > 0 || overdue > 0) {
      logger.info({ reminders, overdue }, 'Follow-up eslatmalari yuborildi');
    }
  } catch (error) {
    logger.error({ err: error }, 'Follow-up eslatmalari jobida xatolik');
  } finally {
    running = false;
  }
}

/**
 * Har daqiqada follow-up eslatmalari va kechikish ogohlantirishlarini yuboradi.
 * Bir nechta server nusxasi ishlaganda `dedupeKey` takroriy bildirishnomalarni bloklaydi.
 */
export function startFollowUpReminderJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
