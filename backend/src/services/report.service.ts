import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { LEAD_STATUS_LABELS } from '../config/leadLabels.js';
import { PAYMENT_METHOD_LABELS } from '../config/paymentLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import { ATTENDANCE_STATUS_LABELS, STUDENT_STATUS_LABELS, formatStudentNumber } from '../config/studentLabels.js';
import type { Prisma } from '../generated/prisma/client.js';
import { addDays, startOfBusinessDay } from '../utils/dates.js';
import type { ReportGroupBy, ReportQuery, ReportType } from '../validators/report.validator.js';

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

  const rows: Array<Record<string, ReportCell>> = [];
  for (const user of users) {
    const leads = await prisma.lead.count({
      where: { deletedAt: null, assignedToId: user.id, createdAt: { gte: start, lt: end } },
    });
    const won = await prisma.lead.count({
      where: { deletedAt: null, assignedToId: user.id, status: 'WON', convertedAt: { gte: start, lt: end } },
    });
    const lost = await prisma.lead.count({
      where: { deletedAt: null, assignedToId: user.id, status: 'LOST', updatedAt: { gte: start, lt: end } },
    });
    const calls = await prisma.call.count({
      where: { managerId: user.id, status: 'COMPLETED', calledAt: { gte: start, lt: end } },
    });
    const revenue = await prisma.payment.aggregate({
      where: { deletedAt: null, managerId: user.id, paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    if (leads === 0 && won === 0 && calls === 0) continue;
    rows.push({
      manager: `${user.firstName} ${user.lastName}`,
      role: user.role.name,
      leads,
      calls,
      won,
      lost,
      conversion: percent(won, won + lost),
      revenue: revenue._sum.amount?.toNumber() ?? 0,
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

  const rows: Array<Record<string, ReportCell>> = [];
  for (const course of courses) {
    const students = await prisma.student.count({ where: { courseId: course.id, deletedAt: null } });
    const activeStudents = await prisma.student.count({ where: { courseId: course.id, deletedAt: null, status: 'ACTIVE' } });
    const newStudents = await prisma.student.count({
      where: { courseId: course.id, deletedAt: null, createdAt: { gte: start, lt: end } },
    });
    const groups = await prisma.group.count({ where: { courseId: course.id } });
    const revenue = await prisma.payment.aggregate({
      where: { deletedAt: null, courseId: course.id, paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    const debt = await prisma.debt.aggregate({
      where: { student: { courseId: course.id, deletedAt: null } },
      _sum: { remainingAmount: true },
    });

    rows.push({
      course: course.name,
      status: course.status,
      price: course.finalPrice.toNumber(),
      groups,
      students,
      activeStudents,
      newStudents,
      revenue: revenue._sum.amount?.toNumber() ?? 0,
      debt: debt._sum.remainingAmount?.toNumber() ?? 0,
    });
  }

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

  const rows: Array<Record<string, ReportCell>> = [];
  for (const group of groups) {
    const students = await prisma.student.count({ where: { groupId: group.id, deletedAt: null, status: 'ACTIVE' } });
    const attendance = await prisma.attendance.groupBy({
      by: ['status'],
      where: { groupId: group.id, date: { gte: start, lt: end } },
      _count: { _all: true },
    });

    const marks = attendance.reduce((sum, row) => sum + row._count._all, 0);
    const present = attendance
      .filter((row) => row.status !== 'ABSENT')
      .reduce((sum, row) => sum + row._count._all, 0);

    rows.push({
      group: group.name,
      course: group.course.name,
      teacher: group.teacher ? `${group.teacher.firstName} ${group.teacher.lastName}` : '—',
      status: group.status,
      capacity: group.capacity,
      students,
      fill: percent(students, group.capacity),
      marks,
      attendance: percent(present, marks),
    });
  }

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

  const rows: Array<Record<string, ReportCell>> = [];
  for (const student of students) {
    const grouped = await prisma.attendance.groupBy({
      by: ['status'],
      where: { studentId: student.id, date: { gte: start, lt: end } },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
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

  const rows: Array<Record<string, ReportCell>> = [];
  for (const source of sources) {
    const base: Prisma.LeadWhereInput = {
      deletedAt: null,
      sourceId: source.id,
      ...(query.managerId ? { assignedToId: query.managerId } : {}),
    };
    const leads = await prisma.lead.count({ where: { ...base, createdAt: { gte: start, lt: end } } });
    const won = await prisma.lead.count({ where: { ...base, status: 'WON', convertedAt: { gte: start, lt: end } } });
    const lost = await prisma.lead.count({ where: { ...base, status: 'LOST', updatedAt: { gte: start, lt: end } } });
    const revenue = await prisma.payment.aggregate({
      where: { deletedAt: null, paidAt: { gte: start, lt: end }, student: { lead: { sourceId: source.id } } },
      _sum: { amount: true },
    });

    if (leads === 0 && won === 0) continue;
    rows.push({
      source: source.name,
      leads,
      won,
      lost,
      conversion: percent(won, won + lost),
      revenue: revenue._sum.amount?.toNumber() ?? 0,
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

const BUILDERS: Record<ReportType, (query: ReportQuery) => Promise<Pick<ReportDto, 'columns' | 'rows' | 'kpis'>>> = {
  sales: salesReport,
  managers: managersReport,
  courses: coursesReport,
  groups: groupsReport,
  payments: paymentsReport,
  debts: debtsReport,
  attendance: attendanceReport,
  sources: sourcesReport,
};

/** Statuslar kabi kodlarni o‘zbekcha yozuvga aylantiradi */
const CODE_LABELS: Record<string, string> = {
  ACTIVE: 'Faol',
  INACTIVE: 'Nofaol',
  ARCHIVED: 'Arxivlangan',
  PLANNED: 'Rejalashtirilgan',
  COMPLETED: 'Yakunlangan',
  CANCELLED: 'Bekor qilingan',
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
      totals: rows.length > 0 ? sumColumns(rows, result.columns) : null,
      kpis: result.kpis,
      truncatedFrom: truncated ? rows.length : null,
    };
  },
};

/** CSV: Excel uchun BOM bilan, qiymatlar qo‘shtirnoq ichida */
/** Excel UTF-8 ni tanishi uchun fayl boshiga qo‘yiladigan BOM belgisi */
const BOM = String.fromCharCode(0xfeff);

export function toCsv(report: ReportDto): string {
  const escape = (value: ReportCell): string => {
    if (value === null || value === undefined) return '""';
    return `"${String(value).replace(/"/g, '""')}"`;
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
