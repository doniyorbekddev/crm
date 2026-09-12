import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { LEAD_STATUS_LABELS } from '../config/leadLabels.js';
import { PAYMENT_METHOD_LABELS } from '../config/paymentLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import { ATTENDANCE_STATUS_LABELS, STUDENT_STATUS_LABELS, formatStudentNumber } from '../config/studentLabels.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { Prisma, SalaryType, StudentStatus } from '../generated/prisma/client.js';
import { addDays, startOfBusinessDay } from '../utils/dates.js';
import type { ReportGroupBy, ReportQuery, ReportType } from '../validators/report.validator.js';
import { OPERATING_LEDGER_WHERE } from './ledger.js';

export type ReportColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export type ReportCell = string | number | null;

export interface ReportKpi {
  label: string;
  value: number;
  type: ReportColumnType;
}

export interface ReportDto {
  type: ReportType;
  title: string;
  description: string;
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
  /** Jadval oxiridagi "Jami" qatori (faqat yig‘iladigan ustunlar) */
  totals: Record<string, number> | null;
  kpis: ReportKpi[];
  /** Qatorlar cheklangan bo‘lsa — haqiqiy soni */
  truncatedFrom: number | null;
}

/** Bitta hisobotda ko‘rsatiladigan eng ko‘p qator (eksportda ham shu chegara) */
const MAX_ROWS = 1000;

const REPORT_TITLES: Record<ReportType, { title: string; description: string }> = {
  sales: { title: 'Sotuv hisoboti', description: 'Davr kesimida yangi leadlar, sotuvlar, konversiya va tushum' },
  managers: { title: 'Managerlar samaradorligi', description: 'Har bir manager bo‘yicha leadlar, sotuvlar va tushum' },
  courses: { title: 'Kurslar hisoboti', description: 'Kurslar bo‘yicha o‘quvchilar, shartnomalar, tushum va qarz' },
  groups: { title: 'Guruhlar hisoboti', description: 'Guruhlar bo‘yicha to‘ldirilganlik va davomat' },
  payments: { title: 'To‘lovlar hisoboti', description: 'Davr kesimida to‘lovlar va usullar bo‘yicha taqsimot' },
  debts: { title: 'Qarzdorlik hisoboti', description: 'O‘quvchilar bo‘yicha shartnoma, to‘langan va qolgan summa' },
  attendance: { title: 'Davomat hisoboti', description: 'Guruhlar bo‘yicha davomat foizi va belgilangan darslar' },
  sources: { title: 'Lead manbalari', description: 'Manbalar bo‘yicha leadlar, sotuvlar va konversiya' },
  teachers: {
    title: 'O‘qituvchilar samaradorligi',
    description: 'O‘quvchilar, darslar, davomat, imtihon o‘rtachasi, uy vazifasi, retention, tushum va maosh',
  },
  salaries: { title: 'Maosh hisoboti', description: 'Oylar bo‘yicha hisoblangan, to‘langan va qolgan maoshlar' },
  incomes: { title: 'Tushumlar hisoboti', description: 'Kategoriyalar bo‘yicha tushum va ulush (moliyaviy daftardan)' },
  expenses: { title: 'Xarajatlar hisoboti', description: 'Kategoriyalar bo‘yicha xarajat, ulush va budjet bajarilishi' },
  profit: { title: 'Foyda hisoboti', description: 'Davr kesimida tushum, xarajat, sof foyda va marja' },
  retention: {
    title: 'O‘quvchilar retention hisoboti',
    description: 'Davr kesimida yangi, ketgan va yakunlagan o‘quvchilar hamda saqlanish foizi',
  },
  gamification: { title: 'Gamification hisoboti', description: 'Davrda eng ko‘p XP to‘plagan o‘quvchilar, daraja va nishonlar' },
};

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function businessDateString(value: Date): string {
  return toDateOnly(new Date(value.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000));
}

/** "2026-10-01" → o‘quv markaz vaqtidagi kun boshlanishi (UTC nuqta) */
function dayStartOf(date: string): Date {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() - env.APP_UTC_OFFSET_MINUTES * 60_000);
}

/** Standart davr: oxirgi 30 kun */
function resolveRange(query: ReportQuery): { from: string; to: string; start: Date; end: Date } {
  const today = businessDateString(new Date());
  const to = query.to ?? today;
  const from = query.from ?? businessDateString(addDays(startOfBusinessDay(new Date()), -29));
  return { from, to, start: dayStartOf(from), end: addDays(dayStartOf(to), 1) };
}

const MONTH_LABELS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

/** Davrni kun/hafta/oy bo‘laklariga ajratadi (eng ko‘pi 120 ta bo‘lak) */
function buildBuckets(start: Date, end: Date, groupBy: ReportGroupBy): Array<{ start: Date; end: Date; label: string }> {
  const buckets: Array<{ start: Date; end: Date; label: string }> = [];
  let cursor = start;

  while (cursor < end && buckets.length < 120) {
    let next: Date;
    let label: string;

    if (groupBy === 'day') {
      next = addDays(cursor, 1);
      label = businessDateString(cursor);
    } else if (groupBy === 'week') {
      next = addDays(cursor, 7);
      // Oxirgi hafta davr tugashida kesiladi — yorliq ham shunga mos bo‘lsin
      const lastDay = addDays(next > end ? end : next, -1);
      label = `${businessDateString(cursor)} — ${businessDateString(lastDay)}`;
    } else {
      const shifted = new Date(cursor.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000);
      const monthStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
      next = new Date(monthStart - env.APP_UTC_OFFSET_MINUTES * 60_000);
      label = `${MONTH_LABELS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}`;
    }

    buckets.push({ start: cursor, end: next > end ? end : next, label });
    cursor = next;
  }

  return buckets;
}

/**
 * Yozuvlarni bucketlarga taqsimlaydi. Har bir bucket uchun alohida COUNT so‘rovi o‘rniga
 * bitta so‘rov bilan ma’lumot olinadi va shu yerda guruhlanadi (30 kunlik hisobot uchun
 * 120 ta so‘rov o‘rniga 4 ta so‘rov).
 */
function bucketize<T>(
  buckets: Array<{ start: Date; end: Date }>,
  items: readonly T[],
  getDate: (item: T) => Date | null,
  apply: (index: number, item: T) => void,
): void {
  if (buckets.length === 0) return;
  for (const item of items) {
    const date = getDate(item);
    if (!date) continue;
    const time = date.getTime();
    // Bucketlar ketma-ket va teng bo‘lmagani uchun oddiy binar qidiruv
    let low = 0;
    let high = buckets.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const bucket = buckets[mid]!;
      if (time < bucket.start.getTime()) high = mid - 1;
      else if (time >= bucket.end.getTime()) low = mid + 1;
      else {
        apply(mid, item);
        break;
      }
    }
  }
}

function sumColumns(rows: Array<Record<string, ReportCell>>, columns: ReportColumn[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of columns) {
    if (column.type !== 'number' && column.type !== 'money') continue;
    totals[column.key] = rows.reduce((sum, row) => sum + (typeof row[column.key] === 'number' ? (row[column.key] as number) : 0), 0);
  }
  return totals;
}

/** Hisobot quruvchisi natijasi; `totalsExclude` — "Jami" qatorida qo'shilmaydigan ustunlar (o'rin, seriya va h.k.) */
type BuilderResult = Pick<ReportDto, 'columns' | 'rows' | 'kpis'> & { totalsExclude?: string[] };

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

// ---------------------------------------------------------------------
// Hisobotlar
// ---------------------------------------------------------------------

async function salesReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const { start, end } = resolveRange(query);
  const buckets = buildBuckets(start, end, query.groupBy);
  const managerFilter: Prisma.LeadWhereInput = query.managerId ? { assignedToId: query.managerId } : {};

  const createdLeads = await prisma.lead.findMany({
    where: { deletedAt: null, ...managerFilter, createdAt: { gte: start, lt: end } },
    select: { createdAt: true },
  });
  const wonLeads = await prisma.lead.findMany({
    where: { deletedAt: null, ...managerFilter, status: 'WON', convertedAt: { gte: start, lt: end } },
    select: { convertedAt: true },
  });
  const lostLeads = await prisma.lead.findMany({
    where: { deletedAt: null, ...managerFilter, status: 'LOST', updatedAt: { gte: start, lt: end } },
    select: { updatedAt: true },
  });
  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      ...(query.managerId ? { managerId: query.managerId } : {}),
      paidAt: { gte: start, lt: end },
    },
    select: { paidAt: true, amount: true },
  });

  const rows: Array<Record<string, ReportCell>> = buckets.map((bucket) => ({
    period: bucket.label,
    leads: 0,
    won: 0,
    lost: 0,
    conversion: 0,
    revenue: 0,
  }));

  bucketize(buckets, createdLeads, (lead) => lead.createdAt, (index) => {
    rows[index]!.leads = (rows[index]!.leads as number) + 1;
  });
  bucketize(buckets, wonLeads, (lead) => lead.convertedAt, (index) => {
    rows[index]!.won = (rows[index]!.won as number) + 1;
  });
  bucketize(buckets, lostLeads, (lead) => lead.updatedAt, (index) => {
    rows[index]!.lost = (rows[index]!.lost as number) + 1;
  });
  bucketize(buckets, payments, (payment) => payment.paidAt, (index, payment) => {
    rows[index]!.revenue = (rows[index]!.revenue as number) + payment.amount.toNumber();
  });

  for (const row of rows) {
    row.conversion = percent(row.won as number, (row.won as number) + (row.lost as number));
  }

  const totalLeads = rows.reduce((sum, row) => sum + (row.leads as number), 0);
  const totalWon = rows.reduce((sum, row) => sum + (row.won as number), 0);
  const totalLost = rows.reduce((sum, row) => sum + (row.lost as number), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + (row.revenue as number), 0);

  return {
    columns: [
      { key: 'period', label: 'Davr', type: 'text' },
      { key: 'leads', label: 'Yangi leadlar', type: 'number' },
      { key: 'won', label: 'Sotildi', type: 'number' },
      { key: 'lost', label: 'Yo‘qotildi', type: 'number' },
      { key: 'conversion', label: 'Konversiya', type: 'percent' },
      { key: 'revenue', label: 'Tushum', type: 'money' },
    ],
    rows,
    kpis: [
      { label: 'Yangi leadlar', value: totalLeads, type: 'number' },
      { label: 'Sotildi', value: totalWon, type: 'number' },
      { label: 'Konversiya', value: percent(totalWon, totalWon + totalLost), type: 'percent' },
      { label: 'Tushum', value: totalRevenue, type: 'money' },
    ],
  };
}

async function managersReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const { start, end } = resolveRange(query);
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(query.managerId ? { id: query.managerId } : {}),
      role: { permissions: { some: { permission: { key: PERMISSIONS.LEAD_VIEW } } } },
    },
    orderBy: [{ firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
  });
  const ids = users.map((user) => user.id);
  const range = { gte: start, lt: end };

  // Har bir ko'rsatkich uchun bitta guruhlangan so'rov — managerlar soniga bog'liq emas
  const [leads, won, lost, calls, revenue] = await Promise.all([
    prisma.lead.groupBy({ by: ['assignedToId'], where: { deletedAt: null, assignedToId: { in: ids }, createdAt: range }, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ['assignedToId'],
      where: { deletedAt: null, assignedToId: { in: ids }, status: 'WON', convertedAt: range },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['assignedToId'],
      where: { deletedAt: null, assignedToId: { in: ids }, status: 'LOST', updatedAt: range },
      _count: { _all: true },
    }),
    prisma.call.groupBy({ by: ['managerId'], where: { managerId: { in: ids }, status: 'COMPLETED', calledAt: range }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['managerId'], where: { deletedAt: null, managerId: { in: ids }, paidAt: range }, _sum: { amount: true } }),
  ]);

  const rows: Array<Record<string, ReportCell>> = [];
  for (const user of users) {
    const leadCount = leads.find((row) => row.assignedToId === user.id)?._count._all ?? 0;
    const wonCount = won.find((row) => row.assignedToId === user.id)?._count._all ?? 0;
    const lostCount = lost.find((row) => row.assignedToId === user.id)?._count._all ?? 0;
    const callCount = calls.find((row) => row.managerId === user.id)?._count._all ?? 0;
    if (leadCount === 0 && wonCount === 0 && callCount === 0) continue;
    rows.push({
      manager: `${user.firstName} ${user.lastName}`,
      role: user.role.name,
      leads: leadCount,
      calls: callCount,
      won: wonCount,
      lost: lostCount,
      conversion: percent(wonCount, wonCount + lostCount),
      revenue: revenue.find((row) => row.managerId === user.id)?._sum.amount?.toNumber() ?? 0,
    });
  }

  rows.sort((a, b) => (b.revenue as number) - (a.revenue as number));
  const totalWon = rows.reduce((sum, row) => sum + (row.won as number), 0);
  const totalLeads = rows.reduce((sum, row) => sum + (row.leads as number), 0);

  return {
    columns: [
      { key: 'manager', label: 'Manager', type: 'text' },
      { key: 'role', label: 'Rol', type: 'text' },
      { key: 'leads', label: 'Leadlar', type: 'number' },
      { key: 'calls', label: 'Qo‘ng‘iroqlar', type: 'number' },
      { key: 'won', label: 'Sotildi', type: 'number' },
      { key: 'lost', label: 'Yo‘qotildi', type: 'number' },
      { key: 'conversion', label: 'Konversiya', type: 'percent' },
      { key: 'revenue', label: 'Tushum', type: 'money' },
    ],
    rows,
    kpis: [
      { label: 'Managerlar', value: rows.length, type: 'number' },
      { label: 'Jami leadlar', value: totalLeads, type: 'number' },
      { label: 'Jami sotuv', value: totalWon, type: 'number' },
      { label: 'Jami tushum', value: rows.reduce((sum, row) => sum + (row.revenue as number), 0), type: 'money' },
    ],
  };
}

async function coursesReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const { start, end } = resolveRange(query);
  const courses = await prisma.course.findMany({
    where: query.courseId ? { id: query.courseId } : {},
    orderBy: { name: 'asc' },
    select: { id: true, name: true, finalPrice: true, status: true },
  });
  const ids = courses.map((course) => course.id);

  const [students, active, fresh, groups, revenue, debts] = await Promise.all([
    prisma.student.groupBy({ by: ['courseId'], where: { courseId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
    prisma.student.groupBy({ by: ['courseId'], where: { courseId: { in: ids }, deletedAt: null, status: 'ACTIVE' }, _count: { _all: true } }),
    prisma.student.groupBy({
      by: ['courseId'],
      where: { courseId: { in: ids }, deletedAt: null, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.group.groupBy({ by: ['courseId'], where: { courseId: { in: ids } }, _count: { _all: true } }),
    prisma.payment.groupBy({
      by: ['courseId'],
      where: { courseId: { in: ids }, deletedAt: null, paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    // Qarz o'quvchi orqali kursga bog'lanadi — bitta so'rovda olib, shu yerda jamlanadi
    prisma.debt.findMany({
      where: { student: { courseId: { in: ids }, deletedAt: null } },
      select: { remainingAmount: true, student: { select: { courseId: true } } },
    }),
  ]);

  const countOf = (list: ReadonlyArray<{ courseId: string; _count: { _all: number } }>, id: string) =>
    list.find((row) => row.courseId === id)?._count._all ?? 0;
  const debtByCourse = new Map<string, number>();
  for (const debt of debts) {
    debtByCourse.set(debt.student.courseId, (debtByCourse.get(debt.student.courseId) ?? 0) + debt.remainingAmount.toNumber());
  }

  const rows: Array<Record<string, ReportCell>> = courses.map((course) => ({
    course: course.name,
    status: course.status,
    price: course.finalPrice.toNumber(),
    groups: countOf(groups, course.id),
    students: countOf(students, course.id),
    activeStudents: countOf(active, course.id),
    newStudents: countOf(fresh, course.id),
    revenue: revenue.find((row) => row.courseId === course.id)?._sum.amount?.toNumber() ?? 0,
    debt: debtByCourse.get(course.id) ?? 0,
  }));

  rows.sort((a, b) => (b.revenue as number) - (a.revenue as number));

  return {
    columns: [
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'price', label: 'Narx', type: 'money' },
      { key: 'groups', label: 'Guruhlar', type: 'number' },
      { key: 'students', label: 'O‘quvchilar', type: 'number' },
      { key: 'activeStudents', label: 'Faol', type: 'number' },
      { key: 'newStudents', label: 'Davrda qo‘shilgan', type: 'number' },
      { key: 'revenue', label: 'Davr tushumi', type: 'money' },
      { key: 'debt', label: 'Qarz', type: 'money' },
    ],
    rows,
    kpis: [
      { label: 'Kurslar', value: rows.length, type: 'number' },
      { label: 'O‘quvchilar', value: rows.reduce((sum, row) => sum + (row.students as number), 0), type: 'number' },
      { label: 'Davr tushumi', value: rows.reduce((sum, row) => sum + (row.revenue as number), 0), type: 'money' },
      { label: 'Qarzdorlik', value: rows.reduce((sum, row) => sum + (row.debt as number), 0), type: 'money' },
    ],
  };
}

async function groupsReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const { start, end } = resolveRange(query);
  const groups = await prisma.group.findMany({
    where: {
      ...(query.groupId ? { id: query.groupId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      capacity: true,
      status: true,
      course: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  const ids = groups.map((group) => group.id);
  const [students, attendance] = await Promise.all([
    prisma.student.groupBy({ by: ['groupId'], where: { groupId: { in: ids }, deletedAt: null, status: 'ACTIVE' }, _count: { _all: true } }),
    prisma.attendance.groupBy({
      by: ['groupId', 'status'],
      where: { groupId: { in: ids }, date: { gte: start, lt: end } },
      _count: { _all: true },
    }),
  ]);

  const rows: Array<Record<string, ReportCell>> = groups.map((group) => {
    const studentCount = students.find((row) => row.groupId === group.id)?._count._all ?? 0;
    const marks = attendance.filter((row) => row.groupId === group.id);
    const total = marks.reduce((sum, row) => sum + row._count._all, 0);
    const present = marks.filter((row) => row.status !== 'ABSENT').reduce((sum, row) => sum + row._count._all, 0);
    return {
      group: group.name,
      course: group.course.name,
      teacher: group.teacher ? `${group.teacher.firstName} ${group.teacher.lastName}` : '—',
      status: group.status,
      capacity: group.capacity,
      students: studentCount,
      fill: percent(studentCount, group.capacity),
      marks: total,
      attendance: percent(present, total),
    };
  });

  return {
    columns: [
      { key: 'group', label: 'Guruh', type: 'text' },
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'teacher', label: 'O‘qituvchi', type: 'text' },
      { key: 'capacity', label: 'Sig‘im', type: 'number' },
      { key: 'students', label: 'O‘quvchilar', type: 'number' },
      { key: 'fill', label: 'To‘lganlik', type: 'percent' },
      { key: 'marks', label: 'Belgilangan davomat', type: 'number' },
      { key: 'attendance', label: 'Davomat', type: 'percent' },
    ],
    rows,
    kpis: [
      { label: 'Guruhlar', value: rows.length, type: 'number' },
      { label: 'O‘quvchilar', value: rows.reduce((sum, row) => sum + (row.students as number), 0), type: 'number' },
      {
        label: 'O‘rtacha to‘lganlik',
        value: rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + (row.fill as number), 0) / rows.length),
        type: 'percent',
      },
    ],
  };
}

async function paymentsReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const { start, end } = resolveRange(query);
  const where: Prisma.PaymentWhereInput = {
    deletedAt: null,
    paidAt: { gte: start, lt: end },
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.managerId ? { managerId: query.managerId } : {}),
    ...(query.groupId ? { student: { groupId: query.groupId } } : {}),
  };

  const buckets = buildBuckets(start, end, query.groupBy);
  const methods = await prisma.payment.groupBy({ by: ['method'], where, _sum: { amount: true }, _count: { _all: true } });
  const methodKeys = methods.map((row) => row.method);

  // Barcha to‘lovlar bitta so‘rovda olinadi va shu yerda davrlarga taqsimlanadi
  const payments = await prisma.payment.findMany({ where, select: { paidAt: true, method: true, amount: true } });

  const rows: Array<Record<string, ReportCell>> = buckets.map((bucket) => {
    const row: Record<string, ReportCell> = { period: bucket.label };
    for (const method of methodKeys) row[`method_${method}`] = 0;
    row.count = 0;
    row.total = 0;
    return row;
  });

  bucketize(buckets, payments, (payment) => payment.paidAt, (index, payment) => {
    const row = rows[index]!;
    const amount = payment.amount.toNumber();
    const key = `method_${payment.method}`;
    row[key] = ((row[key] as number) ?? 0) + amount;
    row.count = (row.count as number) + 1;
    row.total = (row.total as number) + amount;
  });

  return {
    columns: [
      { key: 'period', label: 'Davr', type: 'text' },
      ...methodKeys.map((method) => ({ key: `method_${method}`, label: PAYMENT_METHOD_LABELS[method], type: 'money' as const })),
      { key: 'count', label: 'To‘lovlar soni', type: 'number' },
      { key: 'total', label: 'Jami', type: 'money' },
    ],
    rows,
    kpis: [
      { label: 'Jami tushum', value: methods.reduce((sum, row) => sum + (row._sum.amount?.toNumber() ?? 0), 0), type: 'money' },
      { label: 'To‘lovlar soni', value: methods.reduce((sum, row) => sum + row._count._all, 0), type: 'number' },
      ...methods
        .map((row) => ({
          label: PAYMENT_METHOD_LABELS[row.method],
          value: row._sum.amount?.toNumber() ?? 0,
          type: 'money' as const,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 2),
    ],
  };
}

async function debtsReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const where: Prisma.DebtWhereInput = {
    student: {
      deletedAt: null,
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
    },
  };

  const debts = await prisma.debt.findMany({
    where,
    orderBy: { remainingAmount: 'desc' },
    take: MAX_ROWS,
    select: {
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      status: true,
      student: {
        select: {
          number: true,
          firstName: true,
          lastName: true,
          phone: true,
          parentPhone: true,
          status: true,
          course: { select: { name: true } },
          group: { select: { name: true } },
        },
      },
    },
  });

  const rows = debts.map((debt) => ({
    code: formatStudentNumber(debt.student.number),
    student: `${debt.student.firstName} ${debt.student.lastName}`,
    phone: debt.student.phone,
    parentPhone: debt.student.parentPhone ?? '—',
    course: debt.student.course.name,
    group: debt.student.group?.name ?? '—',
    studentStatus: STUDENT_STATUS_LABELS[debt.student.status],
    total: debt.totalAmount.toNumber(),
    paid: debt.paidAmount.toNumber(),
    remaining: debt.remainingAmount.toNumber(),
  }));

  const debtors = rows.filter((row) => row.remaining > 0).length;

  return {
    columns: [
      { key: 'code', label: 'ID', type: 'text' },
      { key: 'student', label: 'O‘quvchi', type: 'text' },
      { key: 'phone', label: 'Telefon', type: 'text' },
      { key: 'parentPhone', label: 'Ota-ona', type: 'text' },
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'group', label: 'Guruh', type: 'text' },
      { key: 'studentStatus', label: 'Holat', type: 'text' },
      { key: 'total', label: 'Shartnoma', type: 'money' },
      { key: 'paid', label: 'To‘langan', type: 'money' },
      { key: 'remaining', label: 'Qolgan', type: 'money' },
    ],
    rows,
    kpis: [
      { label: 'Qarzdorlar', value: debtors, type: 'number' },
      { label: 'Umumiy qarz', value: rows.reduce((sum, row) => sum + row.remaining, 0), type: 'money' },
      { label: 'To‘langan', value: rows.reduce((sum, row) => sum + row.paid, 0), type: 'money' },
      { label: 'Shartnomalar', value: rows.reduce((sum, row) => sum + row.total, 0), type: 'money' },
    ],
  };
}

async function attendanceReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const { start, end } = resolveRange(query);
  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'FROZEN'] },
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
    },
    orderBy: [{ firstName: 'asc' }],
    take: MAX_ROWS,
    select: {
      id: true,
      number: true,
      firstName: true,
      lastName: true,
      course: { select: { name: true } },
      group: { select: { name: true } },
    },
  });

  // Barcha o'quvchilar uchun bitta guruhlangan so'rov (avval har bir o'quvchiga alohida edi)
  const grouped = await prisma.attendance.groupBy({
    by: ['studentId', 'status'],
    where: { studentId: { in: students.map((student) => student.id) }, date: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const countsByStudent = new Map<string, Map<string, number>>();
  for (const row of grouped) {
    const counts = countsByStudent.get(row.studentId) ?? new Map<string, number>();
    counts.set(row.status, row._count._all);
    countsByStudent.set(row.studentId, counts);
  }

  const rows: Array<Record<string, ReportCell>> = [];
  for (const student of students) {
    const counts = countsByStudent.get(student.id);
    if (!counts) continue;
    const present = counts.get('PRESENT') ?? 0;
    const late = counts.get('LATE') ?? 0;
    const excused = counts.get('EXCUSED') ?? 0;
    const absent = counts.get('ABSENT') ?? 0;
    const total = present + late + excused + absent;
    if (total === 0) continue;

    rows.push({
      code: formatStudentNumber(student.number),
      student: `${student.firstName} ${student.lastName}`,
      course: student.course.name,
      group: student.group?.name ?? '—',
      present,
      late,
      excused,
      absent,
      lessons: total,
      rate: percent(present + late + excused, total),
    });
  }

  rows.sort((a, b) => (a.rate as number) - (b.rate as number));
  const lessons = rows.reduce((sum, row) => sum + (row.lessons as number), 0);
  const absences = rows.reduce((sum, row) => sum + (row.absent as number), 0);

  return {
    columns: [
      { key: 'code', label: 'ID', type: 'text' },
      { key: 'student', label: 'O‘quvchi', type: 'text' },
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'group', label: 'Guruh', type: 'text' },
      { key: 'present', label: ATTENDANCE_STATUS_LABELS.PRESENT, type: 'number' },
      { key: 'late', label: ATTENDANCE_STATUS_LABELS.LATE, type: 'number' },
      { key: 'excused', label: ATTENDANCE_STATUS_LABELS.EXCUSED, type: 'number' },
      { key: 'absent', label: ATTENDANCE_STATUS_LABELS.ABSENT, type: 'number' },
      { key: 'lessons', label: 'Darslar', type: 'number' },
      { key: 'rate', label: 'Davomat', type: 'percent' },
    ],
    rows,
    kpis: [
      { label: 'O‘quvchilar', value: rows.length, type: 'number' },
      { label: 'Belgilangan darslar', value: lessons, type: 'number' },
      { label: 'Sababsiz qoldirilgan', value: absences, type: 'number' },
      { label: 'O‘rtacha davomat', value: percent(lessons - absences, lessons), type: 'percent' },
    ],
  };
}

async function sourcesReport(query: ReportQuery): Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>> {
  const { start, end } = resolveRange(query);
  const sources = await prisma.source.findMany({ orderBy: [{ sortOrder: 'asc' }], select: { id: true, name: true } });

  const ids = sources.map((source) => source.id);
  const base: Prisma.LeadWhereInput = {
    deletedAt: null,
    sourceId: { in: ids },
    ...(query.managerId ? { assignedToId: query.managerId } : {}),
  };
  const range = { gte: start, lt: end };
  const [leads, won, lost, payments] = await Promise.all([
    prisma.lead.groupBy({ by: ['sourceId'], where: { ...base, createdAt: range }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['sourceId'], where: { ...base, status: 'WON', convertedAt: range }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['sourceId'], where: { ...base, status: 'LOST', updatedAt: range }, _count: { _all: true } }),
    // To'lov manbaga o'quvchining leadi orqali bog'lanadi — yig'indi bazada hisoblanadi
    // (Prisma relation maydoni bo'yicha groupBy qila olmaydi; qatorlarni JS'ga yuklash sekinroq edi)
    prisma.$queryRaw<Array<{ sourceId: string; total: unknown }>>`
      SELECT l."sourceId" AS "sourceId", SUM(p."amount") AS "total"
      FROM "payments" p
      JOIN "students" s ON s."id" = p."studentId"
      JOIN "leads" l ON l."id" = s."leadId"
      WHERE p."deletedAt" IS NULL AND p."paidAt" >= ${start} AND p."paidAt" < ${end}
      GROUP BY l."sourceId"
    `,
  ]);
  const revenueBySource = new Map(payments.map((row) => [row.sourceId, Number(row.total ?? 0)]));

  const rows: Array<Record<string, ReportCell>> = [];
  for (const source of sources) {
    const leadCount = leads.find((row) => row.sourceId === source.id)?._count._all ?? 0;
    const wonCount = won.find((row) => row.sourceId === source.id)?._count._all ?? 0;
    const lostCount = lost.find((row) => row.sourceId === source.id)?._count._all ?? 0;
    if (leadCount === 0 && wonCount === 0) continue;
    rows.push({
      source: source.name,
      leads: leadCount,
      won: wonCount,
      lost: lostCount,
      conversion: percent(wonCount, wonCount + lostCount),
      revenue: revenueBySource.get(source.id) ?? 0,
    });
  }

  rows.sort((a, b) => (b.leads as number) - (a.leads as number));
  const totalLeads = rows.reduce((sum, row) => sum + (row.leads as number), 0);
  const totalWon = rows.reduce((sum, row) => sum + (row.won as number), 0);

  return {
    columns: [
      { key: 'source', label: 'Manba', type: 'text' },
      { key: 'leads', label: 'Leadlar', type: 'number' },
      { key: 'won', label: 'Sotildi', type: 'number' },
      { key: 'lost', label: 'Yo‘qotildi', type: 'number' },
      { key: 'conversion', label: 'Konversiya', type: 'percent' },
      { key: 'revenue', label: 'Tushum', type: 'money' },
    ],
    rows,
    kpis: [
      { label: 'Manbalar', value: rows.length, type: 'number' },
      { label: 'Jami leadlar', value: totalLeads, type: 'number' },
      { label: 'Sotildi', value: totalWon, type: 'number' },
      { label: 'Umumiy konversiya', value: percent(totalWon, totalLeads), type: 'percent' },
    ],
  };
}


// ---------------------------------------------------------------------
// O'quv markaz hisobotlari (PHASE 10)
// ---------------------------------------------------------------------

/** Moliyaviy natijaga o'tkazma va boshlang'ich qoldiq kirmaydi */
const LEDGER_WHERE: Prisma.TransactionWhereInput = OPERATING_LEDGER_WHERE;

const SALARY_TYPE_TITLES: Record<SalaryType, string> = {
  FIXED: 'Belgilangan',
  PER_LESSON: 'Dars uchun',
  PER_STUDENT: 'O‘quvchi uchun',
  PERCENTAGE: 'Ulush',
  MIXED: 'Aralash',
};

const FINISHED_STATUSES: readonly StudentStatus[] = ['COMPLETED', 'GRADUATED'];

/** "2026-08-15".."2026-10-02" → [{2026,8},{2026,9},{2026,10}] */
function monthsInRange(from: string, to: string): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endKey = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  while (year * 12 + month <= endKey && months.length < 120) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** @db.Date maydonlari UTC yarim tunda saqlanadi */
function dateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function teachersReport(query: ReportQuery): Promise<BuilderResult> {
  const { from, to, start, end } = resolveRange(query);
  const sessionFrom = dateOnlyUtc(from);
  const sessionTo = dateOnlyUtc(to);

  const profiles = await prisma.teacherProfile.findMany({
    where: { user: { deletedAt: null } },
    select: { id: true, userId: true, specialization: true, user: { select: { firstName: true, lastName: true } } },
    orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
  });
  const userIds = profiles.map((profile) => profile.userId);

  const groups = await prisma.group.findMany({
    where: { teacherId: { in: userIds }, ...(query.courseId ? { courseId: query.courseId } : {}) },
    select: { id: true, teacherId: true },
  });
  const teacherOfGroup = new Map(groups.map((group) => [group.id, group.teacherId]));
  const groupIds = groups.map((group) => group.id);

  // Barcha o'qituvchilar uchun ~10 ta so'rov (avval har bir o'qituvchiga ~11 ta edi)
  const [active, dropped, sessions, attendance, exams, homework, revenueByStudent, salaries] = await Promise.all([
    prisma.student.groupBy({ by: ['groupId'], where: { groupId: { in: groupIds }, deletedAt: null, status: 'ACTIVE' }, _count: { _all: true } }),
    prisma.student.groupBy({
      by: ['groupId'],
      where: { groupId: { in: groupIds }, deletedAt: null, status: 'DROPPED', statusChangedAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.attendanceSession.groupBy({
      by: ['teacherId', 'groupId'],
      where: {
        status: 'HELD',
        date: { gte: sessionFrom, lte: sessionTo },
        OR: [{ teacherId: { in: userIds } }, { teacherId: null, groupId: { in: groupIds } }],
      },
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ['groupId', 'status'],
      where: { groupId: { in: groupIds }, date: { gte: sessionFrom, lte: sessionTo } },
      _count: { _all: true },
    }),
    prisma.exam.findMany({
      where: { groupId: { in: groupIds }, date: { gte: sessionFrom, lte: sessionTo }, status: { not: 'CANCELLED' } },
      select: { id: true, groupId: true },
    }),
    prisma.homework.findMany({
      where: { groupId: { in: groupIds }, status: { not: 'DRAFT' }, deadline: { gte: start, lt: end } },
      select: { id: true, groupId: true },
    }),
    prisma.payment.groupBy({
      by: ['studentId'],
      where: { deletedAt: null, paidAt: { gte: start, lt: end }, student: { groupId: { in: groupIds } } },
      _sum: { amount: true },
    }),
    prisma.teacherSalaryPeriod.groupBy({
      by: ['teacherProfileId'],
      where: { teacherProfileId: { in: profiles.map((profile) => profile.id) }, OR: monthsInRange(from, to) },
      _sum: { totalAmount: true },
    }),
  ]);

  const [examResults, submissions, paidStudents] = await Promise.all([
    prisma.examResult.groupBy({
      by: ['examId'],
      where: { examId: { in: exams.map((exam) => exam.id) } },
      _sum: { percentage: true },
      _count: { _all: true },
    }),
    prisma.homeworkSubmission.groupBy({
      by: ['homeworkId', 'status'],
      where: { homeworkId: { in: homework.map((item) => item.id) } },
      _count: { _all: true },
    }),
    prisma.student.findMany({
      where: { id: { in: revenueByStudent.map((row) => row.studentId) } },
      select: { id: true, groupId: true },
    }),
  ]);

  // Guruh bo'yicha natijalarni o'qituvchiga yig'ish
  interface TeacherTotals {
    groups: number;
    students: number;
    dropped: number;
    lessons: number;
    marks: number;
    attended: number;
    examSum: number;
    examCount: number;
    homeworkTotal: number;
    homeworkDone: number;
    revenue: number;
  }
  const totals = new Map<string, TeacherTotals>();
  const bucket = (teacherId: string | null | undefined): TeacherTotals | null => {
    if (!teacherId) return null;
    let entry = totals.get(teacherId);
    if (!entry) {
      entry = { groups: 0, students: 0, dropped: 0, lessons: 0, marks: 0, attended: 0, examSum: 0, examCount: 0, homeworkTotal: 0, homeworkDone: 0, revenue: 0 };
      totals.set(teacherId, entry);
    }
    return entry;
  };

  for (const group of groups) {
    const entry = bucket(group.teacherId);
    if (entry) entry.groups += 1;
  }
  for (const row of active) {
    const entry = bucket(row.groupId ? teacherOfGroup.get(row.groupId) : null);
    if (entry) entry.students += row._count._all;
  }
  for (const row of dropped) {
    const entry = bucket(row.groupId ? teacherOfGroup.get(row.groupId) : null);
    if (entry) entry.dropped += row._count._all;
  }
  for (const row of sessions) {
    // Seansda o'qituvchi ko'rsatilgan bo'lsa — o'sha; kurs filtri bo'lsa, faqat filtrdagi guruhlar
    const inScope = teacherOfGroup.has(row.groupId);
    const owner = row.teacherId ? (query.courseId && !inScope ? null : row.teacherId) : teacherOfGroup.get(row.groupId);
    const entry = bucket(owner);
    if (entry) entry.lessons += row._count._all;
  }
  for (const row of attendance) {
    const entry = bucket(teacherOfGroup.get(row.groupId));
    if (!entry) continue;
    entry.marks += row._count._all;
    if (row.status === 'PRESENT' || row.status === 'LATE') entry.attended += row._count._all;
  }
  const examGroup = new Map(exams.map((exam) => [exam.id, exam.groupId]));
  for (const row of examResults) {
    const entry = bucket(teacherOfGroup.get(examGroup.get(row.examId) ?? ''));
    if (!entry) continue;
    entry.examSum += row._sum.percentage ?? 0;
    entry.examCount += row._count._all;
  }
  const homeworkGroup = new Map(homework.map((item) => [item.id, item.groupId]));
  for (const row of submissions) {
    const entry = bucket(teacherOfGroup.get(homeworkGroup.get(row.homeworkId) ?? ''));
    if (!entry) continue;
    entry.homeworkTotal += row._count._all;
    if (row.status === 'SUBMITTED' || row.status === 'LATE' || row.status === 'GRADED') entry.homeworkDone += row._count._all;
  }
  const studentGroup = new Map(paidStudents.map((student) => [student.id, student.groupId]));
  for (const row of revenueByStudent) {
    const groupId = studentGroup.get(row.studentId);
    const entry = bucket(groupId ? teacherOfGroup.get(groupId) : null);
    if (entry) entry.revenue += row._sum.amount?.toNumber() ?? 0;
  }

  const rows: Array<Record<string, ReportCell>> = [];
  for (const profile of profiles) {
    const entry = totals.get(profile.userId);
    if (query.courseId && (!entry || entry.groups === 0)) continue;
    const value = entry ?? bucket(profile.userId)!;
    rows.push({
      teacher: `${profile.user.firstName} ${profile.user.lastName}`,
      specialization: profile.specialization ?? '—',
      groups: value.groups,
      students: value.students,
      lessons: value.lessons,
      attendance: value.marks === 0 ? null : percent(value.attended, value.marks),
      examAverage: value.examCount === 0 ? null : Math.round(value.examSum / value.examCount),
      homeworkRate: value.homeworkTotal === 0 ? null : percent(value.homeworkDone, value.homeworkTotal),
      retention: value.students + value.dropped === 0 ? null : percent(value.students, value.students + value.dropped),
      revenue: value.revenue,
      salary: salaries.find((row) => row.teacherProfileId === profile.id)?._sum.totalAmount?.toNumber() ?? 0,
    });
  }

  rows.sort((a, b) => (b.revenue as number) - (a.revenue as number));

  return {
    columns: [
      { key: 'teacher', label: 'O‘qituvchi', type: 'text' },
      { key: 'specialization', label: 'Mutaxassislik', type: 'text' },
      { key: 'groups', label: 'Guruhlar', type: 'number' },
      { key: 'students', label: 'Faol o‘quvchilar', type: 'number' },
      { key: 'lessons', label: 'O‘tkazilgan darslar', type: 'number' },
      { key: 'attendance', label: 'Davomat', type: 'percent' },
      { key: 'examAverage', label: 'Imtihon o‘rtachasi', type: 'percent' },
      { key: 'homeworkRate', label: 'Uy vazifasi', type: 'percent' },
      { key: 'retention', label: 'Retention', type: 'percent' },
      { key: 'revenue', label: 'Tushum', type: 'money' },
      { key: 'salary', label: 'Hisoblangan maosh', type: 'money' },
    ],
    rows,
    kpis: [
      { label: 'O‘qituvchilar', value: rows.length, type: 'number' },
      { label: 'O‘tkazilgan darslar', value: rows.reduce((sum, row) => sum + (row.lessons as number), 0), type: 'number' },
      { label: 'Guruhlar tushumi', value: rows.reduce((sum, row) => sum + (row.revenue as number), 0), type: 'money' },
      { label: 'Hisoblangan maosh', value: rows.reduce((sum, row) => sum + (row.salary as number), 0), type: 'money' },
    ],
  };
}

async function salariesReport(query: ReportQuery): Promise<BuilderResult> {
  const { from, to } = resolveRange(query);
  const periods = await prisma.teacherSalaryPeriod.findMany({
    where: { OR: monthsInRange(from, to) },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { totalAmount: 'desc' }],
    take: MAX_ROWS + 1,
    select: {
      year: true,
      month: true,
      salaryType: true,
      lessonsCount: true,
      studentsCount: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      status: true,
      teacherProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  const rows = periods.map((period) => ({
    period: formatSalaryPeriod(period.year, period.month),
    teacher: `${period.teacherProfile.user.firstName} ${period.teacherProfile.user.lastName}`,
    salaryType: SALARY_TYPE_TITLES[period.salaryType],
    lessons: period.lessonsCount,
    students: period.studentsCount,
    total: period.totalAmount.toNumber(),
    paid: period.paidAmount.toNumber(),
    remaining: period.remainingAmount.toNumber(),
    status: period.status,
  }));

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);

  return {
    columns: [
      { key: 'period', label: 'Oy', type: 'text' },
      { key: 'teacher', label: 'O‘qituvchi', type: 'text' },
      { key: 'salaryType', label: 'Model', type: 'text' },
      { key: 'lessons', label: 'Darslar', type: 'number' },
      { key: 'students', label: 'O‘quvchilar', type: 'number' },
      { key: 'total', label: 'Hisoblangan', type: 'money' },
      { key: 'paid', label: 'To‘langan', type: 'money' },
      { key: 'remaining', label: 'Qolgan', type: 'money' },
      { key: 'status', label: 'Holat', type: 'text' },
    ],
    rows,
    kpis: [
      { label: 'Hisoblangan maosh', value: total, type: 'money' },
      { label: 'To‘langan', value: paid, type: 'money' },
      { label: 'Qolgan', value: Math.max(total - paid, 0), type: 'money' },
      { label: 'To‘lov bajarilishi', value: percent(paid, total), type: 'percent' },
    ],
    totalsExclude: ['lessons', 'students'],
  };
}

/** Moliyaviy daftardan kategoriya kesimi */
async function ledgerByCategory(
  types: Array<'INCOME' | 'EXPENSE' | 'REFUND'>,
  start: Date,
  end: Date,
): Promise<Array<{ category: string; count: number; total: number }>> {
  const grouped = await prisma.transaction.groupBy({
    by: ['categoryName'],
    where: { ...LEDGER_WHERE, type: { in: types }, occurredAt: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return grouped
    .map((row) => ({ category: row.categoryName ?? 'Boshqa', count: row._count._all, total: row._sum.amount?.toNumber() ?? 0 }))
    .sort((a, b) => b.total - a.total);
}

async function incomesReport(query: ReportQuery): Promise<BuilderResult> {
  const { start, end } = resolveRange(query);
  const categories = await ledgerByCategory(['INCOME'], start, end);
  const total = categories.reduce((sum, row) => sum + row.total, 0);
  const studentPayments = categories.find((row) => row.category === 'O‘quvchi to‘lovi')?.total ?? 0;

  return {
    columns: [
      { key: 'category', label: 'Kategoriya', type: 'text' },
      { key: 'count', label: 'Yozuvlar', type: 'number' },
      { key: 'total', label: 'Summa', type: 'money' },
      { key: 'share', label: 'Ulush', type: 'percent' },
    ],
    rows: categories.map((row) => ({ ...row, share: percent(row.total, total) })),
    kpis: [
      { label: 'Jami tushum', value: total, type: 'money' },
      { label: 'Yozuvlar', value: categories.reduce((sum, row) => sum + row.count, 0), type: 'number' },
      { label: 'O‘quv to‘lovlari', value: studentPayments, type: 'money' },
      { label: 'O‘quv to‘lovi ulushi', value: percent(studentPayments, total), type: 'percent' },
    ],
  };
}

async function expensesReport(query: ReportQuery): Promise<BuilderResult> {
  const { from, to, start, end } = resolveRange(query);
  const categories = await ledgerByCategory(['EXPENSE', 'REFUND'], start, end);
  const total = categories.reduce((sum, row) => sum + row.total, 0);

  // Budjet: davrga tushgan oylarning rejalari kategoriya nomi bo'yicha jamlanadi
  const lines = await prisma.budgetLine.findMany({
    where: { budget: { OR: monthsInRange(from, to) } },
    select: { plannedAmount: true, category: { select: { name: true } } },
  });
  const plannedByName = new Map<string, number>();
  for (const line of lines) {
    plannedByName.set(line.category.name, (plannedByName.get(line.category.name) ?? 0) + line.plannedAmount.toNumber());
  }
  const names = new Set([...categories.map((row) => row.category), ...plannedByName.keys()]);

  const rows = [...names]
    .map((name) => {
      const actual = categories.find((row) => row.category === name);
      const planned = plannedByName.get(name) ?? 0;
      const spent = actual?.total ?? 0;
      return {
        category: name,
        count: actual?.count ?? 0,
        total: spent,
        share: percent(spent, total),
        planned,
        usage: planned === 0 ? null : percent(spent, planned),
      };
    })
    .sort((a, b) => b.total - a.total);

  const planned = rows.reduce((sum, row) => sum + row.planned, 0);

  return {
    columns: [
      { key: 'category', label: 'Kategoriya', type: 'text' },
      { key: 'count', label: 'Yozuvlar', type: 'number' },
      { key: 'total', label: 'Xarajat', type: 'money' },
      { key: 'share', label: 'Ulush', type: 'percent' },
      { key: 'planned', label: 'Budjet', type: 'money' },
      { key: 'usage', label: 'Bajarilish', type: 'percent' },
    ],
    rows,
    kpis: [
      { label: 'Jami xarajat', value: total, type: 'money' },
      { label: 'Budjet', value: planned, type: 'money' },
      { label: 'Budjet bajarilishi', value: percent(total, planned), type: 'percent' },
      { label: 'Yozuvlar', value: rows.reduce((sum, row) => sum + row.count, 0), type: 'number' },
    ],
  };
}

async function profitReport(query: ReportQuery): Promise<BuilderResult> {
  const { start, end } = resolveRange(query);
  const buckets = buildBuckets(start, end, query.groupBy);
  const rows = buckets.map((bucket) => ({ period: bucket.label, income: 0, expense: 0, profit: 0, margin: null as number | null }));

  const transactions = await prisma.transaction.findMany({
    where: { ...LEDGER_WHERE, occurredAt: { gte: start, lt: end } },
    select: { type: true, amount: true, occurredAt: true },
  });
  bucketize(buckets, transactions, (item) => item.occurredAt, (index, item) => {
    const row = rows[index]!;
    if (item.type === 'INCOME') row.income += item.amount.toNumber();
    else if (item.type === 'EXPENSE' || item.type === 'REFUND') row.expense += item.amount.toNumber();
  });
  for (const row of rows) {
    row.profit = row.income - row.expense;
    row.margin = row.income === 0 ? null : Math.round((row.profit / row.income) * 100);
  }

  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const expense = rows.reduce((sum, row) => sum + row.expense, 0);

  return {
    columns: [
      { key: 'period', label: 'Davr', type: 'text' },
      { key: 'income', label: 'Tushum', type: 'money' },
      { key: 'expense', label: 'Xarajat', type: 'money' },
      { key: 'profit', label: 'Sof foyda', type: 'money' },
      { key: 'margin', label: 'Marja', type: 'percent' },
    ],
    rows,
    kpis: [
      { label: 'Tushum', value: income, type: 'money' },
      { label: 'Xarajat', value: expense, type: 'money' },
      { label: 'Sof foyda', value: income - expense, type: 'money' },
      { label: 'Marja', value: income === 0 ? 0 : Math.round(((income - expense) / income) * 100), type: 'percent' },
    ],
  };
}

async function retentionReport(query: ReportQuery): Promise<BuilderResult> {
  const { start, end } = resolveRange(query);
  const buckets = buildBuckets(start, end, query.groupBy);
  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      createdAt: { lt: end },
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
    },
    select: { createdAt: true, status: true, statusChangedAt: true },
  });

  /** O'quvchi shu vaqtda o'qishni to'xtatganmi (ketgan yoki yakunlagan) */
  const leftBefore = (student: (typeof students)[number], moment: Date) =>
    student.status !== 'ACTIVE' &&
    student.status !== 'FROZEN' &&
    student.statusChangedAt !== null &&
    student.statusChangedAt < moment;

  const rows = buckets.map((bucket) => {
    const activeAtStart = students.filter((student) => student.createdAt < bucket.start && !leftBefore(student, bucket.start));
    const inBucket = (date: Date | null) => date !== null && date >= bucket.start && date < bucket.end;
    const dropped = students.filter((student) => student.status === 'DROPPED' && inBucket(student.statusChangedAt)).length;
    const droppedFromStart = activeAtStart.filter(
      (student) => student.status === 'DROPPED' && inBucket(student.statusChangedAt),
    ).length;

    return {
      period: bucket.label,
      activeAtStart: activeAtStart.length,
      newStudents: students.filter((student) => inBucket(student.createdAt)).length,
      dropped,
      finished: students.filter((student) => FINISHED_STATUSES.includes(student.status) && inBucket(student.statusChangedAt)).length,
      retention: activeAtStart.length === 0 ? null : percent(activeAtStart.length - droppedFromStart, activeAtStart.length),
    };
  });

  const newStudents = rows.reduce((sum, row) => sum + row.newStudents, 0);
  const dropped = rows.reduce((sum, row) => sum + row.dropped, 0);
  const activeNow = students.filter((student) => student.status === 'ACTIVE').length;

  return {
    columns: [
      { key: 'period', label: 'Davr', type: 'text' },
      { key: 'activeAtStart', label: 'Davr boshida', type: 'number' },
      { key: 'newStudents', label: 'Yangi', type: 'number' },
      { key: 'dropped', label: 'Ketgan', type: 'number' },
      { key: 'finished', label: 'Yakunlagan', type: 'number' },
      { key: 'retention', label: 'Retention', type: 'percent' },
    ],
    rows,
    kpis: [
      { label: 'Yangi o‘quvchilar', value: newStudents, type: 'number' },
      { label: 'Ketgan o‘quvchilar', value: dropped, type: 'number' },
      { label: 'Faol o‘quvchilar (hozir)', value: activeNow, type: 'number' },
      { label: 'Ketish foizi', value: percent(dropped, activeNow + dropped), type: 'percent' },
    ],
    totalsExclude: ['activeAtStart'],
  };
}

async function gamificationReport(query: ReportQuery): Promise<BuilderResult> {
  const { start, end } = resolveRange(query);
  const studentFilter: Prisma.StudentWhereInput = {
    deletedAt: null,
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.groupId ? { groupId: query.groupId } : {}),
  };

  const grouped = await prisma.xpTransaction.groupBy({
    by: ['studentId'],
    where: { createdAt: { gte: start, lt: end }, student: studentFilter },
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: MAX_ROWS,
  });
  const ids = grouped.map((row) => row.studentId);

  const students = await prisma.student.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      number: true,
      firstName: true,
      lastName: true,
      course: { select: { name: true } },
      group: { select: { name: true } },
      gamification: { select: { totalXp: true, levelNumber: true } },
      streak: { select: { current: true } },
      _count: { select: { badges: { where: { awardedAt: { gte: start, lt: end } } } } },
    },
  });
  const levels = await prisma.level.findMany({ select: { number: true, name: true } });
  const levelName = new Map(levels.map((level) => [level.number, level.name]));
  const byId = new Map(students.map((student) => [student.id, student]));

  const rows = grouped.flatMap((row, index) => {
    const student = byId.get(row.studentId);
    if (!student) return [];
    const level = student.gamification?.levelNumber ?? 1;
    return [
      {
        rank: index + 1,
        code: formatStudentNumber(student.number),
        student: `${student.firstName} ${student.lastName}`,
        course: student.course.name,
        group: student.group?.name ?? '—',
        xp: row._sum.points ?? 0,
        totalXp: student.gamification?.totalXp ?? 0,
        level: `${level} · ${levelName.get(level) ?? ''}`.trim(),
        badges: student._count.badges,
        streak: student.streak?.current ?? 0,
      },
    ];
  });

  const xp = rows.reduce((sum, row) => sum + row.xp, 0);

  return {
    columns: [
      { key: 'rank', label: 'O‘rin', type: 'number' },
      { key: 'code', label: 'ID', type: 'text' },
      { key: 'student', label: 'O‘quvchi', type: 'text' },
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'group', label: 'Guruh', type: 'text' },
      { key: 'xp', label: 'Davrdagi XP', type: 'number' },
      { key: 'totalXp', label: 'Jami XP', type: 'number' },
      { key: 'level', label: 'Daraja', type: 'text' },
      { key: 'badges', label: 'Yangi nishonlar', type: 'number' },
      { key: 'streak', label: 'Seriya', type: 'number' },
    ],
    rows,
    kpis: [
      { label: 'Faol o‘quvchilar', value: rows.length, type: 'number' },
      { label: 'Berilgan XP', value: xp, type: 'number' },
      { label: 'O‘rtacha XP', value: rows.length === 0 ? 0 : Math.round(xp / rows.length), type: 'number' },
      { label: 'Yangi nishonlar', value: rows.reduce((sum, row) => sum + row.badges, 0), type: 'number' },
    ],
    totalsExclude: ['rank', 'totalXp', 'streak'],
  };
}

const BUILDERS: Record<ReportType, (query: ReportQuery) => Promise<BuilderResult>> = {
  sales: salesReport,
  managers: managersReport,
  courses: coursesReport,
  groups: groupsReport,
  payments: paymentsReport,
  debts: debtsReport,
  attendance: attendanceReport,
  sources: sourcesReport,
  teachers: teachersReport,
  salaries: salariesReport,
  incomes: incomesReport,
  expenses: expensesReport,
  profit: profitReport,
  retention: retentionReport,
  gamification: gamificationReport,
};

/** Statuslar kabi kodlarni o‘zbekcha yozuvga aylantiradi */
const CODE_LABELS: Record<string, string> = {
  ACTIVE: 'Faol',
  INACTIVE: 'Nofaol',
  ARCHIVED: 'Arxivlangan',
  PLANNED: 'Rejalashtirilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
  CALCULATED: 'Hisoblandi',
  APPROVED: 'Tasdiqlandi',
  PARTIALLY_PAID: 'Qisman to‘langan',
  PAID: 'To‘langan',
  ...LEAD_STATUS_LABELS,
};

function localizeCodes(rows: Array<Record<string, ReportCell>>): Array<Record<string, ReportCell>> {
  return rows.map((row) => {
    const copy: Record<string, ReportCell> = { ...row };
    if (typeof copy.status === 'string') {
      copy.status = CODE_LABELS[copy.status] ?? copy.status;
    }
    return copy;
  });
}

export const reportService = {
  async build(type: ReportType, query: ReportQuery): Promise<ReportDto> {
    const { from, to } = resolveRange(query);
    const result = await BUILDERS[type](query);
    const rows = localizeCodes(result.rows);
    const truncated = rows.length > MAX_ROWS;

    return {
      type,
      title: REPORT_TITLES[type].title,
      description: REPORT_TITLES[type].description,
      from,
      to,
      columns: result.columns,
      rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
      totals:
        rows.length > 0
          ? sumColumns(
              rows,
              result.columns.filter((column) => !result.totalsExclude?.includes(column.key)),
            )
          : null,
      kpis: result.kpis,
      truncatedFrom: truncated ? rows.length : null,
    };
  },
};

/** CSV: Excel uchun BOM bilan, qiymatlar qo‘shtirnoq ichida */
/**
 * CSV formula injection himoyasi: foydalanuvchi kiritgan matn (ism, izoh) `=`, `+`, `-`, `@`,
 * tab yoki CR bilan boshlansa Excel uni formula sifatida ishga tushiradi (masalan `=HYPERLINK(...)`).
 * Bunday matn oldiga apostrof qo‘yiladi. Raqamlar (manfiy foyda ham) o‘zgarmaydi.
 */
export function neutralizeFormula(value: string | number): string {
  if (typeof value !== 'string') return String(value);
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Excel UTF-8 ni tanishi uchun fayl boshiga qo‘yiladigan BOM belgisi */
const BOM = String.fromCharCode(0xfeff);

export function toCsv(report: ReportDto): string {
  const escape = (value: ReportCell): string => {
    if (value === null || value === undefined) return '""';
    return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
  };

  const lines: string[] = [];
  lines.push(escape(`${report.title} (${report.from} — ${report.to})`));
  lines.push('');
  lines.push(report.columns.map((column) => escape(column.label)).join(','));
  for (const row of report.rows) {
    lines.push(report.columns.map((column) => escape(row[column.key] ?? '')).join(','));
  }

  if (report.totals) {
    lines.push(
      report.columns
        .map((column, index) => (index === 0 ? escape('Jami') : escape(report.totals?.[column.key] ?? '')))
        .join(','),
    );
  }

  return `${BOM}${lines.join('\r\n')}\r\n`;
}
