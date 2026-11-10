import { prisma } from '../../config/database.js';
import { addDays, businessDateString } from '../../utils/dates.js';
import { logger } from '../../utils/logger.js';
import { atBusinessTime, parseTime } from '../../utils/staffAttendance.js';
import { lockDay, recomputeDay } from './common.js';
import { loadPlanner, loadSubjects } from './planning.js';

/** Ketish belgilanmagan kun shu soatda avtomatik yopiladi (markaz vaqti); ishi kechroq tugasa — ish tugaganda */
export const AUTO_CHECKOUT_AT = '20:00';

/**
 * Avtomatik "ketdi" (jadvalida `autoMark` yoqilgan xodimlar): QR bilan kelib, ketishni belgilashni unutgan xodimning kuni
 * 20:00 da (ishi kechroq tugasa — ish tugaganda) tizim nomidan (`source = AUTO`) yopiladi. Ketish vaqti — jadval tugash
 * vaqti (20:00 emas): unutgan xodimga ortiqcha ish soati yozilmaydi (CEO qarori, 2026-11-10). Undan oldin xodimga eslatma,
 * 18:00 da rahbarlarga ro'yxat boradi (`staffAttendance.job.ts`).
 *
 * "Keldi" HECH QACHON avtomatik yozilmaydi — kelish faqat QR yoki rahbar tuzatishi bilan. Avval jadval vaqtida "keldi"
 * ham yozilardi va kelmagan xodim ham "keldi" bo'lib qolardi, QR esa haqiqiy kelish vaqtini yoza olmasdi (2026-11-10).
 *
 * Qoidalar:
 *  - faqat haqiqiy (QR yoki tuzatish) "keldi"si bor va hali ishda (`WORKING`) bo'lgan kun yopiladi;
 *  - ketish vaqti: FIXED — jadval tugash vaqti; LESSONS — oxirgi dars tugashi; "erta ketaman" ruxsati bo'lsa — o'sha vaqt;
 *    bayram, dam olish istisnosi, ta'til va "kelmayman" ruxsati bo'lgan kun yopilmaydi;
 *  - rahbar avtomatik "ketdi"ni bekor qilgan bo'lsa (tuzatish) — qayta yozilmaydi (bekor qilingan hodisa ham hisobga olinadi);
 *  - tanaffusda qolgan yoki jadval tugaganidan keyin QR hodisasi bo'lgan kun — yozilmaydi (tekshiruvga tushadi).
 * Bugun va kecha (server kechqurun to'xtab qolgan bo'lsa ham kecha yopiladi).
 */
export async function recordAutoAttendance(now: Date = new Date()): Promise<{ checkOuts: number }> {
  const today = businessDateString(now);
  const yesterday = businessDateString(addDays(now, -1));
  const autoUsers = await prisma.staffWorkSchedule.findMany({ where: { autoMark: true }, distinct: ['userId'], select: { userId: true } });
  if (autoUsers.length === 0) return { checkOuts: 0 };
  // Faqat ochiq kunlar — kelmagan xodimga kun yozuvi ham yaratilmaydi
  const open = await prisma.staffAttendanceDay.findMany({
    where: {
      userId: { in: autoUsers.map((row) => row.userId) },
      date: { in: [new Date(`${yesterday}T00:00:00Z`), new Date(`${today}T00:00:00Z`)] },
      phase: 'WORKING',
    },
    select: { userId: true, date: true },
  });
  if (open.length === 0) return { checkOuts: 0 };
  const subjects = await loadSubjects(null, { id: { in: [...new Set(open.map((row) => row.userId))] } });
  if (subjects.length === 0) return { checkOuts: 0 };
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const planner = await loadPlanner(subjects, yesterday, today);

  let checkOuts = 0;
  for (const row of open) {
    const subject = byId.get(row.userId);
    if (!subject) continue;
    const date = row.date.toISOString().slice(0, 10);
    const schedule = planner.schedule(subject.id, date);
    if (!schedule?.autoMark) continue;
    const plan = planner.plan(subject.id, date);
    if (plan.kind !== 'WORK' || !plan.startTime || !plan.endTime) continue;
    const excuse = planner.excuse(subject.id, date);
    if (excuse.fullDay) continue;

    const outTime = excuse.earlyFrom && parseTime(excuse.earlyFrom) < parseTime(plan.endTime) ? excuse.earlyFrom : plan.endTime;
    const outAt = atBusinessTime(date, outTime);
    const closeAt = Math.max(outAt.getTime(), atBusinessTime(date, AUTO_CHECKOUT_AT).getTime());
    if (now.getTime() < closeAt) continue;

    try {
      const added = await prisma.$transaction(async (tx) => {
        const day = await lockDay(tx, subject, date);
        if (day.phase !== 'WORKING' || !day.checkInAt || day.checkInAt.getTime() >= outAt.getTime()) return 0;
        const events = await tx.staffAttendanceEvent.findMany({ where: { dayId: day.id }, select: { type: true, source: true, occurredAt: true, voidedAt: true } });
        if (events.some((event) => event.type === 'CHECK_OUT')) return 0;
        const live = events.filter((event) => event.voidedAt === null);
        // Eski avtomatik "keldi" (tasdiqlanmagan kelish) yopilmaydi — u QR skanerlanganda yoki tuzatishda almashtiriladi
        if (!live.some((event) => event.type === 'CHECK_IN' && event.source !== 'AUTO')) return 0;
        if (live.some((event) => event.occurredAt.getTime() >= outAt.getTime())) return 0;
        await tx.staffAttendanceEvent.create({ data: { dayId: day.id, userId: subject.id, type: 'CHECK_OUT', occurredAt: outAt, source: 'AUTO' } });
        await recomputeDay(tx, day.id);
        return 1;
      });
      checkOuts += added;
    } catch (error) {
      // Bitta xodimdagi nomuvofiqlik (masalan, tuzatishdagi ketma-ketlik) qolganlarini to'xtatmasin
      logger.warn({ err: error, userId: subject.id, date }, 'Avtomatik "ketdi" yozilmadi');
    }
  }
  return { checkOuts };
}
