import { prisma } from '../../config/database.js';
import { addDays, businessDateString } from '../../utils/dates.js';
import { logger } from '../../utils/logger.js';
import { atBusinessTime, parseTime } from '../../utils/staffAttendance.js';
import { lockDay, recomputeDay } from './common.js';
import { loadPlanner, loadSubjects } from './planning.js';

/**
 * Avtomatik davomat (jadvalida `autoMark` yoqilgan xodimlar): jadval vaqti kelganda "keldi", tugaganda "ketdi"
 * hodisasi tizim nomidan (`source = AUTO`) yoziladi.
 *
 * Qoidalar:
 *  - FIXED — jadvaldagi soatlar (masalan 08:00–17:30); LESSONS — birinchi dars − `lessonLeadMinutes`, oxirgi dars tugashi;
 *    bekor qilingan dars, bayram, dam olish istisnosi, ta'til va "kelmayman" ruxsati bo'lgan kun yozilmaydi;
 *    "kech kelaman" / "erta ketaman" ruxsati bo'lsa — o'sha vaqt;
 *  - QR ustun: xodim o'zi skanerlagan bo'lsa (yoki rahbar tuzatgan) shu turdagi avtomatik hodisa yozilmaydi;
 *  - rahbar avtomatik hodisani bekor qilgan bo'lsa (tuzatish) — qayta yozilmaydi (bekor qilingan hodisa ham hisobga olinadi);
 *  - tanaffusda qolgan yoki jadval tugaganidan keyin QR hodisasi bo'lgan kun — "ketdi" yozilmaydi (tekshiruvga tushadi).
 * Bugun to'liq; kechagi kun faqat yopiladi ("ketdi") — server kechqurun to'xtab qolgan bo'lsa ham. O'tgan kunga yangi "keldi"
 * yozilmaydi: jadval yoqilganda oldingi kunlar o'ylab topilgan ma'lumot bilan to'lmasin.
 */
export async function recordAutoAttendance(now: Date = new Date()): Promise<{ checkIns: number; checkOuts: number }> {
  const today = businessDateString(now);
  const yesterday = businessDateString(addDays(now, -1));
  const autoUsers = await prisma.staffWorkSchedule.findMany({ where: { autoMark: true }, distinct: ['userId'], select: { userId: true } });
  if (autoUsers.length === 0) return { checkIns: 0, checkOuts: 0 };
  const subjects = await loadSubjects(null, { id: { in: autoUsers.map((row) => row.userId) } });
  if (subjects.length === 0) return { checkIns: 0, checkOuts: 0 };
  const planner = await loadPlanner(subjects, yesterday, today);

  let checkIns = 0;
  let checkOuts = 0;
  for (const date of [yesterday, today]) {
    for (const subject of subjects) {
      const schedule = planner.schedule(subject.id, date);
      if (!schedule?.autoMark) continue;
      const plan = planner.plan(subject.id, date);
      if (plan.kind !== 'WORK' || !plan.startTime || !plan.endTime) continue;
      const excuse = planner.excuse(subject.id, date);
      if (excuse.fullDay) continue;

      const inTime = excuse.lateUntil && parseTime(excuse.lateUntil) > parseTime(plan.startTime) ? excuse.lateUntil : plan.startTime;
      const outTime = excuse.earlyFrom && parseTime(excuse.earlyFrom) < parseTime(plan.endTime) ? excuse.earlyFrom : plan.endTime;
      const inAt = atBusinessTime(date, inTime);
      const outAt = atBusinessTime(date, outTime);
      if (now.getTime() < inAt.getTime() || outAt.getTime() <= inAt.getTime()) continue;

      try {
        const result = await prisma.$transaction(async (tx) => {
          const day = await lockDay(tx, subject, date);
          const events = await tx.staffAttendanceEvent.findMany({ where: { dayId: day.id }, select: { type: true, occurredAt: true, voidedAt: true } });
          let added = { in: 0, out: 0 };
          if (date === today && !events.some((event) => event.type === 'CHECK_IN')) {
            await tx.staffAttendanceEvent.create({ data: { dayId: day.id, userId: subject.id, type: 'CHECK_IN', occurredAt: inAt, source: 'AUTO' } });
            added = { ...added, in: 1 };
          }
          const current = await recomputeDay(tx, day.id);
          if (now.getTime() < outAt.getTime() || events.some((event) => event.type === 'CHECK_OUT')) return added;
          const live = events.filter((event) => event.voidedAt === null);
          const laterActivity = live.some((event) => event.occurredAt.getTime() >= outAt.getTime());
          if (current.phase !== 'WORKING' || !current.checkInAt || current.checkInAt.getTime() >= outAt.getTime() || laterActivity) return added;
          await tx.staffAttendanceEvent.create({ data: { dayId: day.id, userId: subject.id, type: 'CHECK_OUT', occurredAt: outAt, source: 'AUTO' } });
          await recomputeDay(tx, day.id);
          return { ...added, out: 1 };
        });
        checkIns += result.in;
        checkOuts += result.out;
      } catch (error) {
        // Bitta xodimdagi nomuvofiqlik (masalan, tuzatishdagi ketma-ketlik) qolganlarini to'xtatmasin
        logger.warn({ err: error, userId: subject.id, date }, 'Avtomatik davomat yozilmadi');
      }
    }
  }
  return { checkIns, checkOuts };
}
