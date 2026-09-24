import { prisma } from '../config/database.js';
import { escapeHtml } from './telegram.service.js';
import { paymentScheduleService } from './paymentSchedule.service.js';
import { moneyUz } from '../utils/money.js';

/**
 * Telegram botning interaktiv buyruqlari.
 *
 * Nega kerak: bot avval faqat xabar **yuborardi**. Ota-ona "qarzim qancha?" yoki "ertaga dars
 * bormi?" degan savolga javob olish uchun kabinetga kirishi kerak edi — telefonda bu og'ir.
 * Endi shu savollarga botning o'zi javob beradi.
 *
 * Xavfsizlik qoidalari:
 *  - javob **faqat tasdiqlangan** (`verifiedAt`, `isActive`) chatga beriladi;
 *  - ma'lumot doirasi chatning egasiga qattiq bog'langan: o'quvchi — o'zi, ota-ona — faqat
 *    o'z farzandlari. Chatdan hech qanday ID qabul qilinmaydi, shuning uchun begona yozuvni
 *    so'rashning yo'li yo'q;
 *  - xodim hisobiga bog'langan chatga o'quvchi ma'lumotlari berilmaydi — CRM'dagi ruxsatlar
 *    bu yerda takrorlanmaydi, chalkashlik bo'lmasin.
 */

/** Chat egasi va u ko'ra oladigan o'quvchilar */
export interface CommandScope {
  kind: 'STUDENT' | 'PARENT' | 'STAFF';
  label: string;
  studentIds: string[];
}

const STUDENT_COMMANDS = [
  '/qarz — qarz va keyingi to‘lov muddati',
  '/darslar — yaqin 7 kundagi darslar',
  '/davomat — oxirgi 10 dars davomati',
];

const COMMON_COMMANDS = ['/holat — bog‘lanish holati', '/uzish — bog‘lanishni uzish', '/help — shu ro‘yxat'];

function helpText(scope: CommandScope): string {
  const lines = ['<b>Mavjud buyruqlar</b>', ''];
  if (scope.kind === 'STAFF') {
    lines.push('Bu chat xodim hisobiga bog‘langan — eslatmalar shu yerga keladi.', '');
  } else {
    lines.push(...STUDENT_COMMANDS);
  }
  lines.push(...COMMON_COMMANDS);
  return lines.join('\n');
}

/** Bog'langan yozuvdan ko'rish doirasini aniqlaydi */
export async function resolveCommandScope(link: {
  userId: string | null;
  studentId: string | null;
  parentId: string | null;
}): Promise<CommandScope | null> {
  if (link.studentId) {
    const student = await prisma.student.findFirst({
      where: { id: link.studentId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) return null;
    return { kind: 'STUDENT', label: `${student.firstName} ${student.lastName}`, studentIds: [student.id] };
  }

  if (link.parentId) {
    const parent = await prisma.parent.findUnique({
      where: { id: link.parentId },
      select: { firstName: true, lastName: true, students: { select: { studentId: true } } },
    });
    if (!parent) return null;
    // Farzandlar ro'yxati har safar qayta o'qiladi — yangi farzand qo'shilsa darrov ko'rinadi
    const students = await prisma.student.findMany({
      where: { id: { in: parent.students.map((row) => row.studentId) }, deletedAt: null },
      select: { id: true },
    });
    return { kind: 'PARENT', label: `${parent.firstName} ${parent.lastName}`, studentIds: students.map((row) => row.id) };
  }

  if (link.userId) {
    const user = await prisma.user.findFirst({
      where: { id: link.userId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    if (!user) return null;
    return { kind: 'STAFF', label: `${user.firstName} ${user.lastName}`, studentIds: [] };
  }

  return null;
}

async function studentName(studentId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  });
  return `${student.firstName} ${student.lastName}`;
}

/** Bir nechta farzand bo'lsa har biri alohida sarlavha bilan chiqadi */
async function perStudent(scope: CommandScope, build: (studentId: string) => Promise<string>): Promise<string> {
  if (scope.studentIds.length === 0) {
    return 'Bu buyruq o‘quvchi va ota-onalar uchun.';
  }
  const blocks: string[] = [];
  for (const studentId of scope.studentIds) {
    const body = await build(studentId);
    blocks.push(scope.studentIds.length > 1 ? `<b>${escapeHtml(await studentName(studentId))}</b>\n${body}` : body);
  }
  return blocks.join('\n\n');
}

async function debtText(studentId: string): Promise<string> {
  const schedule = await paymentScheduleService.get(studentId);
  const remaining = schedule.contractTotal - schedule.paid;

  const lines = [
    `Shartnoma: ${moneyUz(schedule.contractTotal)}`,
    `To‘langan: ${moneyUz(schedule.paid)}`,
    `Qoldiq: <b>${moneyUz(remaining)}</b>`,
  ];
  if (schedule.overdueAmount > 0) {
    lines.push(`⚠️ Kechikkan: <b>${moneyUz(schedule.overdueAmount)}</b> (${schedule.overdueDays} kun)`);
  }
  if (schedule.nextDue) {
    lines.push(`Keyingi muddat: ${schedule.nextDue.dueDate} — ${moneyUz(schedule.nextDue.amount)}`);
  } else if (remaining <= 0) {
    lines.push('Qarz yo‘q ✅');
  }
  return lines.join('\n');
}

const WEEKDAY_ORDER = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

async function lessonsText(studentId: string, now: Date): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      group: {
        select: { id: true, name: true, scheduleDays: true, startTime: true, endTime: true, status: true, endDate: true, room: true },
      },
    },
  });
  const group = student.group;
  if (!group || group.status !== 'ACTIVE') return 'Faol guruh yo‘q.';

  const lines: string[] = [];
  for (let offset = 0; offset < 7 && lines.length < 7; offset += 1) {
    const date = new Date(now.getTime() + offset * 86_400_000);
    const weekday = WEEKDAY_ORDER[date.getDay()]!;
    if (!group.scheduleDays.includes(weekday)) continue;
    if (group.endDate && date > group.endDate) break;

    const iso = date.toISOString().slice(0, 10);
    // Bekor qilingan dars alohida belgilanadi — o'quvchi bekorga kelmasin
    const session = await prisma.attendanceSession.findFirst({
      where: { groupId: group.id, date: new Date(`${iso}T00:00:00.000Z`) },
      select: { status: true },
    });
    const mark = session?.status === 'CANCELLED' ? ' — ❌ bekor qilingan' : '';
    lines.push(`${iso} (${WEEKDAY_LABELS[weekday]}) ${group.startTime}–${group.endTime}${group.room ? ` · ${escapeHtml(group.room)}` : ''}${mark}`);
  }

  if (lines.length === 0) return `${escapeHtml(group.name)}: yaqin 7 kunda dars yo‘q.`;
  return [`<b>${escapeHtml(group.name)}</b>`, ...lines].join('\n');
}

const ATTENDANCE_MARKS: Record<string, string> = {
  PRESENT: '✅ keldi',
  ABSENT: '❌ kelmadi',
  LATE: '🕒 kechikdi',
  EXCUSED: '📝 sababli',
};

async function attendanceText(studentId: string): Promise<string> {
  const rows = await prisma.attendance.findMany({
    where: { studentId },
    orderBy: { date: 'desc' },
    take: 10,
    select: { date: true, status: true },
  });
  if (rows.length === 0) return 'Davomat yozuvi yo‘q.';

  const present = rows.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').length;
  const lines = rows.map((row) => `${row.date.toISOString().slice(0, 10)} — ${ATTENDANCE_MARKS[row.status] ?? row.status}`);
  return [`Oxirgi ${rows.length} dars: <b>${Math.round((present / rows.length) * 100)}%</b>`, ...lines].join('\n');
}

/**
 * Telegram menyusida ko'rinadigan buyruqlar.
 *
 * Menyu hamma uchun bitta (Telegram uni chat turiga qarab ajratmaydi), shuning uchun
 * o'quvchi buyruqlari ham turadi — xodim ularni bossa "bu buyruq o'quvchilar uchun" javobi keladi.
 */
export const BOT_COMMAND_MENU: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'qarz', description: 'Qarz va keyingi to‘lov muddati' },
  { command: 'darslar', description: 'Yaqin 7 kundagi darslar' },
  { command: 'davomat', description: 'Oxirgi 10 dars davomati' },
  { command: 'holat', description: 'Bog‘lanish holati' },
  { command: 'uzish', description: 'Bog‘lanishni uzish' },
  { command: 'help', description: 'Buyruqlar ro‘yxati' },
];

/**
 * Buyruqqa javob matnini tayyorlaydi.
 *
 * Bog'lashning o'zi (`/start <kod>`) bu yerda emas — u `telegramLink.service.ts` da, chunki
 * u tasdiqlanmagan chatdan ham keladi.
 */
export async function buildCommandReply(
  scope: CommandScope,
  text: string,
  now: Date = new Date(),
): Promise<{ reply: string; unlink: boolean }> {
  const command = text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

  switch (command) {
    case '/help':
    case '/start':
    case '/buyruqlar':
      return { reply: helpText(scope), unlink: false };

    case '/holat': {
      const who =
        scope.kind === 'PARENT'
          ? `ota-ona: ${escapeHtml(scope.label)} (${scope.studentIds.length} ta farzand)`
          : scope.kind === 'STUDENT'
            ? `o‘quvchi: ${escapeHtml(scope.label)}`
            : `xodim: ${escapeHtml(scope.label)}`;
      return { reply: `Bog‘langan — ${who}.\nUzish uchun: /uzish`, unlink: false };
    }

    case '/uzish':
      return {
        reply: 'Bog‘lanish uzildi. Eslatmalar endi bu chatga kelmaydi.\nQayta ulash uchun CRM’dan yangi havola oling.',
        unlink: true,
      };

    case '/qarz':
      return { reply: await perStudent(scope, debtText), unlink: false };

    case '/darslar':
      return { reply: await perStudent(scope, (studentId) => lessonsText(studentId, now)), unlink: false };

    case '/davomat':
      return { reply: await perStudent(scope, attendanceText), unlink: false };

    default:
      return { reply: `Bunday buyruq yo‘q.\n\n${helpText(scope)}`, unlink: false };
  }
}
