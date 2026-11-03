import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AttendanceStatus, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { businessDateString, businessMonthRange } from '../utils/dates.js';
import type { ExportTable } from '../utils/tableExport.js';
import { findVisibleGroup, getAttendanceAccess } from './attendance.service.js';
import { ACTIVE_MEMBERSHIP, studentInGroup } from './groupMembership.js';
import { studentStatesAt } from './history.service.js';

/**
 * Guruhning oylik davomat jurnali — qog'oz jurnal ko'rinishi: o'quvchilar × dars kunlari.
 * Kunlar: jadval bo'yicha dars kunlari + shu oyda haqiqatda belgilangan yoki bekor qilingan kunlar.
 * O'quvchilar: hozirgi a'zolar (asosiy va qo'shimcha) + shu oyda belgisi bor, keyin ketganlar ("former").
 * Kirish — kunlik varaq bilan bir xil (o'qituvchi faqat o'z guruhi, qolganlar filial doirasida).
 */

const WEEK_DAYS: WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MARKABLE = ['ACTIVE', 'FROZEN'] as const;

/** Jurnal va eksportda belgilar (qog'oz jurnaldagidek) */
export const JOURNAL_MARKS: Record<AttendanceStatus, string> = { PRESENT: '+', LATE: 'K', EXCUSED: 'S', ABSENT: 'Y' };

type Totals = Record<AttendanceStatus, number> & { marked: number; rate: number | null };

export interface AttendanceJournalDto {
  group: { id: string; name: string; courseName: string; teacher: string | null };
  year: number;
  month: number;
  today: string;
  days: Array<{ date: string; weekday: WeekDay; scheduled: boolean; session: 'HELD' | 'CANCELLED' | 'PLANNED' | null; marked: number; absent: number }>;
  students: Array<{
    id: string;
    code: string;
    name: string;
    /** Qo'shimcha guruh a'zosi (asosiy guruhi boshqa) */
    extraMember: boolean;
    /** Hozir guruhda emas — faqat shu oydagi belgilari uchun ko'rsatiladi */
    former: boolean;
    cells: Record<string, AttendanceStatus>;
    totals: Totals;
  }>;
  totals: Totals;
}

function emptyTotals(): Totals {
  return { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0, marked: 0, rate: null };
}

function finish(totals: Totals): Totals {
  totals.marked = totals.PRESENT + totals.LATE + totals.EXCUSED + totals.ABSENT;
  // Davomat foizi kunlik taxta va statistika bilan bir xil: kelgan + kechikkan / barcha belgilar
  totals.rate = totals.marked === 0 ? null : Math.round(((totals.PRESENT + totals.LATE) / totals.marked) * 100);
  return totals;
}

/**
 * `at` paytida guruhda bo'lganlar (tarixiy ma'lumot D15): asosiy guruhi shu va faol bo'lgan (holat va guruh tarixidan)
 * yoki qo'shimcha a'zo bo'lgan. Nomzodlar — hozirgi a'zolar va shu guruhga tegishli keyingi o'tkazmalar.
 */
async function membersAt(groupId: string, at: Date): Promise<{ ids: string[]; extra: Set<string> }> {
  const [current, moved, memberships] = await Promise.all([
    prisma.student.findMany({ where: { groupId, deletedAt: null }, select: { id: true } }),
    prisma.studentGroupChange.findMany({ where: { changedAt: { gte: at }, OR: [{ fromGroupId: groupId }, { toGroupId: groupId }] }, select: { studentId: true } }),
    prisma.studentGroupMembership.findMany({
      where: { groupId, joinedAt: { lt: at }, OR: [{ leftAt: null }, { leftAt: { gte: at } }] },
      select: { studentId: true },
    }),
  ]);
  const candidates = [...new Set([...current.map((row) => row.id), ...moved.map((row) => row.studentId)])];
  const states = await studentStatesAt(at, { branchId: null }, candidates);
  const primary = states.filter((state) => state.groupId === groupId && (MARKABLE as readonly string[]).includes(state.status)).map((state) => state.id);
  const extra = new Set(memberships.map((row) => row.studentId));
  return { ids: [...new Set([...primary, ...extra])], extra };
}

export const attendanceJournalService = {
  async month(actor: AuthUser, groupId: string, year: number, month: number): Promise<AttendanceJournalDto> {
    const access = await getAttendanceAccess(actor);
    const visible = await findVisibleGroup(access, groupId);
    const group = await prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { startDate: true, endDate: true, scheduleDays: true },
    });

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    // O'tgan oy: tarkib oy oxiridagi holat bo'yicha (keyin qo'shilganlar ko'rinmaydi, keyin chiqqanlar "sobiq" emas)
    const monthEnd = businessMonthRange(year, month).end;
    const membership = monthEnd.getTime() <= Date.now() ? await membersAt(groupId, monthEnd) : null;
    const [sessions, records, roster] = await Promise.all([
      prisma.attendanceSession.findMany({ where: { groupId, date: { gte: start, lt: end } }, select: { date: true, status: true } }),
      prisma.attendance.findMany({ where: { groupId, date: { gte: start, lt: end } }, select: { studentId: true, date: true, status: true } }),
      prisma.student.findMany({
        where: membership
          ? { id: { in: membership.ids }, deletedAt: null }
          : { ...studentInGroup(groupId), deletedAt: null, status: { in: [...MARKABLE] } },
        select: { id: true, number: true, firstName: true, lastName: true, groupId: true },
      }),
    ]);

    // Kunlar: jadval bo'yicha (guruh boshlanish/tugash oralig'ida) + seans yoki belgi bor kunlar
    const days = new Map<string, AttendanceJournalDto['days'][number]>();
    for (let day = new Date(start); day < end; day = new Date(day.getTime() + 86_400_000)) {
      const weekday = WEEK_DAYS[day.getUTCDay()]!;
      const inRange = day >= group.startDate && (!group.endDate || day <= group.endDate);
      if (inRange && group.scheduleDays.includes(weekday)) {
        days.set(day.toISOString().slice(0, 10), { date: day.toISOString().slice(0, 10), weekday, scheduled: true, session: null, marked: 0, absent: 0 });
      }
    }
    const ensureDay = (date: Date) => {
      const key = date.toISOString().slice(0, 10);
      if (!days.has(key)) days.set(key, { date: key, weekday: WEEK_DAYS[date.getUTCDay()]!, scheduled: false, session: null, marked: 0, absent: 0 });
      return days.get(key)!;
    };
    for (const session of sessions) ensureDay(session.date).session = session.status;

    // O'quvchilar: hozirgilar + shu oyda belgisi bor sobiq a'zolar
    const formerIds = [...new Set(records.map((record) => record.studentId))].filter((id) => !roster.some((student) => student.id === id));
    const former = formerIds.length
      ? await prisma.student.findMany({ where: { id: { in: formerIds } }, select: { id: true, number: true, firstName: true, lastName: true, groupId: true } })
      : [];
    const extra = membership
      ? membership.extra
      : new Set((await prisma.studentGroupMembership.findMany({ where: { groupId, ...ACTIVE_MEMBERSHIP }, select: { studentId: true } })).map((row) => row.studentId));

    const rows = new Map<string, AttendanceJournalDto['students'][number]>();
    for (const [list, isFormer] of [[roster, false], [former, true]] as const) {
      for (const student of list) {
        rows.set(student.id, {
          id: student.id,
          code: formatStudentNumber(student.number),
          name: `${student.lastName} ${student.firstName}`,
          extraMember: extra.has(student.id),
          former: isFormer,
          cells: {},
          totals: emptyTotals(),
        });
      }
    }
    const totals = emptyTotals();
    for (const record of records) {
      const row = rows.get(record.studentId);
      if (!row) continue;
      const day = ensureDay(record.date);
      row.cells[day.date] = record.status;
      row.totals[record.status] += 1;
      totals[record.status] += 1;
      day.marked += 1;
      if (record.status === 'ABSENT') day.absent += 1;
    }

    const students = [...rows.values()]
      .map((row) => ({ ...row, totals: finish(row.totals) }))
      .sort((a, b) => Number(a.former) - Number(b.former) || a.name.localeCompare(b.name, 'uz'));
    return {
      group: {
        id: visible.id,
        name: visible.name,
        courseName: visible.course.name,
        teacher: visible.teacher ? `${visible.teacher.firstName} ${visible.teacher.lastName}` : null,
      },
      year,
      month,
      today: businessDateString(new Date()),
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      students,
      totals: finish(totals),
    };
  },

  /** Excel/CSV: o'quvchi qatorlari, har dars kuni ustuni (+, K, S, Y) va jami */
  toExport(journal: AttendanceJournalDto): ExportTable {
    const dayColumns = journal.days.map((day) => ({ key: day.date, label: `${day.date.slice(8, 10)}.${day.date.slice(5, 7)}`, type: 'text' as const }));
    return {
      title: `${journal.group.name} — davomat jurnali ${String(journal.month).padStart(2, '0')}.${journal.year}`,
      subtitle: `${journal.group.courseName}${journal.group.teacher ? ` · ${journal.group.teacher}` : ''} · Belgilar: + keldi, K kechikdi, S sababli, Y kelmadi`,
      columns: [
        { key: 'index', label: '№', type: 'number' },
        { key: 'name', label: 'O‘quvchi', type: 'text' },
        { key: 'code', label: 'ID', type: 'text' },
        ...dayColumns,
        { key: 'present', label: 'Keldi', type: 'number' },
        { key: 'late', label: 'Kechikdi', type: 'number' },
        { key: 'excused', label: 'Sababli', type: 'number' },
        { key: 'absent', label: 'Kelmadi', type: 'number' },
        { key: 'rate', label: 'Davomat %', type: 'percent' },
      ],
      rows: journal.students.map((student, index) => ({
        index: index + 1,
        name: `${student.name}${student.former ? ' (guruhdan chiqqan)' : ''}`,
        code: student.code,
        ...Object.fromEntries(journal.days.map((day) => [day.date, student.cells[day.date] ? JOURNAL_MARKS[student.cells[day.date]!] : day.session === 'CANCELLED' ? 'bekor' : ''])),
        present: student.totals.PRESENT,
        late: student.totals.LATE,
        excused: student.totals.EXCUSED,
        absent: student.totals.ABSENT,
        rate: student.totals.rate,
      })),
      totals: null,
    };
  },
};
