import { prisma } from '../config/database.js';
import { addDays, businessDateString, startOfBusinessDay, startOfBusinessMonth } from '../utils/dates.js';
import type {
  AnalyticsRangeQuery,
  CohortQuery,
  ProfitabilityDimension,
  ProfitabilityQuery,
} from '../validators/analytics.validator.js';
import type { ExportTable } from '../utils/tableExport.js';
import { OPERATING_LEDGER_WHERE } from './ledger.js';
import { refundTotal, refundsBy } from './revenue.js';

/**
 * Kengaytirilgan analitika: unit economics, rentabellik, kohortlar va lead manbalari.
 * Tushum hamma joyda sof (qaytarilgan to‘lov ayrilgan), sana chegaralari o‘quv markaz vaqti bo‘yicha.
 */

export interface UnitEconomicsDto {
  from: string;
  to: string;
  newStudents: number;
  leads: number;
  wonLeads: number;
  /** "Reklama" kategoriyasidagi xarajat */
  marketingSpend: number;
  /** Bitta yangi o‘quvchini jalb qilish narxi */
  cac: number | null;
  costPerLead: number | null;
  /** Haqiqiy LTV: to‘lov qilgan o‘quvchi boshiga butun davrdagi sof tushum */
  ltv: number | null;
  payingStudents: number;
  /** Ketgan/yakunlagan o‘quvchilarning o‘rtacha o‘qish muddati (oy) */
  avgLifetimeMonths: number | null;
  /** So‘nggi 90 kun: faol o‘quvchi boshiga oylik sof tushum */
  monthlyArpu: number | null;
  activeStudents: number;
  ltvToCac: number | null;
  /** CAC necha oyda qoplanadi */
  paybackMonths: number | null;
}

export interface ProfitabilityRowDto {
  id: string;
  name: string;
  subtitle: string | null;
  revenue: number;
  /** O‘qituvchi maoshidan shu qatorga tushgan ulush */
  teacherCost: number;
  /** Hissa: sof tushum − o‘qituvchi xarajati */
  contribution: number;
  margin: number | null;
  activeStudents: number;
  revenuePerStudent: number | null;
}

export interface ProfitabilityDto {
  from: string;
  to: string;
  dimension: ProfitabilityDimension;
  rows: ProfitabilityRowDto[];
  totals: {
    revenue: number;
    teacherCost: number;
    /** Davrda tushum keltirmagan o‘qituvchilar maoshi — kurs/guruhga taqsimlanmaydi */
    unallocatedCost: number;
    contribution: number;
    margin: number | null;
  };
}

export interface CohortRowDto {
  key: string;
  label: string;
  size: number;
  /** [0] — qo‘shilgan oy oxirida, [1] — keyingi oy oxirida... (%); kohort bo‘sh bo‘lsa null */
  retention: Array<number | null>;
  revenuePerStudent: number | null;
  dropped: number;
}

export interface CohortsDto {
  months: number;
  rows: CohortRowDto[];
  /** Har bir oy uchun o‘quvchilar soniga tortilgan o‘rtacha saqlanish */
  average: Array<number | null>;
}

export interface SourceAnalyticsRowDto {
  id: string;
  name: string;
  leads: number;
  won: number;
  lost: number;
  conversion: number;
  students: number;
  revenue: number;
  revenuePerLead: number | null;
  avgDaysToConvert: number | null;
}

export interface SourceAnalyticsDto {
  from: string;
  to: string;
  rows: SourceAnalyticsRowDto[];
  totals: { leads: number; won: number; students: number; revenue: number; conversion: number };
}

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.44;
const MARKETING_CATEGORY_KEY = 'ADVERTISEMENT';
const NONE = '__none__';
const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));
const round1 = (value: number) => Math.round(value * 10) / 10;

function businessDayStart(value: string): Date {
  return startOfBusinessDay(new Date(`${value}T12:00:00.000Z`));
}

/** Oraliq berilmasa — so‘nggi 3 oy (joriy oy bugungacha) */
export function resolveAnalyticsRange(query: AnalyticsRangeQuery, now: Date = new Date()) {
  const start = query.from ? businessDayStart(query.from) : startOfBusinessMonth(now, 2);
  const end = query.to ? addDays(businessDayStart(query.to), 1) : addDays(startOfBusinessDay(now), 1);
  return { start, end, from: businessDateString(start), to: businessDateString(addDays(end, -1)) };
}

function monthsBetween(start: Date, end: Date): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  const last = businessDateString(addDays(end, -1)).slice(0, 7);
  let cursor = businessDateString(start).slice(0, 7);
  while (cursor <= last && months.length < 13) {
    const [year, month] = cursor.split('-').map(Number) as [number, number];
    months.push({ year, month });
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  return months;
}

export const analyticsService = {
  async unitEconomics(query: AnalyticsRangeQuery): Promise<UnitEconomicsDto> {
    const now = new Date();
    const { start, end, from, to } = resolveAnalyticsRange(query, now);
    const range = { gte: start, lt: end };

    const newStudents = await prisma.student.count({ where: { deletedAt: null, createdAt: range } });
    const leads = await prisma.lead.count({ where: { deletedAt: null, createdAt: range } });
    const wonLeads = await prisma.lead.count({ where: { deletedAt: null, status: 'WON', convertedAt: range } });

    const marketingCategory = await prisma.expenseCategory.findUnique({ where: { key: MARKETING_CATEGORY_KEY }, select: { name: true } });
    const spend = marketingCategory
      ? await prisma.transaction.aggregate({
          where: { ...OPERATING_LEDGER_WHERE, type: 'EXPENSE', categoryName: marketingCategory.name, occurredAt: range },
          _sum: { amount: true },
        })
      : null;
    const marketingSpend = spend?._sum.amount?.toNumber() ?? 0;

    // Haqiqiy LTV — butun davr bo'yicha to'lov qilgan o'quvchi boshiga sof tushum
    const paid = await prisma.payment.aggregate({ where: { deletedAt: null }, _sum: { amount: true } });
    const payers = await prisma.payment.findMany({ where: { deletedAt: null }, distinct: ['studentId'], select: { studentId: true } });
    const lifetimeRevenue = (paid._sum.amount?.toNumber() ?? 0) - (await refundTotal(undefined));
    const ltv = payers.length > 0 ? Math.round(lifetimeRevenue / payers.length) : null;

    const finished = await prisma.student.findMany({
      where: { deletedAt: null, status: { in: ['DROPPED', 'COMPLETED', 'GRADUATED'] }, statusChangedAt: { not: null } },
      select: { startDate: true, statusChangedAt: true },
    });
    const lifetimes = finished.map((student) => Math.max((student.statusChangedAt!.getTime() - student.startDate.getTime()) / DAY_MS, 0) / AVG_MONTH_DAYS);
    const avgLifetimeMonths = lifetimes.length > 0 ? round1(lifetimes.reduce((sum, value) => sum + value, 0) / lifetimes.length) : null;

    const recentStart = addDays(startOfBusinessDay(now), -89);
    const recent = await prisma.payment.aggregate({ where: { deletedAt: null, paidAt: { gte: recentStart } }, _sum: { amount: true } });
    const recentRevenue = (recent._sum.amount?.toNumber() ?? 0) - (await refundTotal({ gte: recentStart }));
    const activeStudents = await prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE' } });
    const monthlyArpu = activeStudents > 0 ? Math.round(recentRevenue / 3 / activeStudents) : null;

    const cac = newStudents > 0 ? Math.round(marketingSpend / newStudents) : null;

    return {
      from,
      to,
      newStudents,
      leads,
      wonLeads,
      marketingSpend,
      cac,
      costPerLead: leads > 0 ? Math.round(marketingSpend / leads) : null,
      ltv,
      payingStudents: payers.length,
      avgLifetimeMonths,
      monthlyArpu,
      activeStudents,
      ltvToCac: ltv !== null && cac ? round1(ltv / cac) : null,
      paybackMonths: cac !== null && monthlyArpu ? round1(cac / monthlyArpu) : null,
    };
  },

  /**
   * Rentabellik: sof tushum − o‘qituvchi maoshi. Maosh o‘qituvchi bo‘yicha hisoblanadi, shuning uchun
   * kurs/guruhga o‘qituvchining shu davrdagi tushum ulushiga qarab taqsimlanadi.
   */
  async profitability(query: ProfitabilityQuery): Promise<ProfitabilityDto> {
    const { start, end, from, to } = resolveAnalyticsRange(query);
    const { dimension } = query;
    const range = { gte: start, lt: end };

    const payments = await prisma.payment.findMany({
      where: { deletedAt: null, paidAt: range },
      select: { amount: true, courseId: true, groupId: true, teacherId: true },
    });
    const refunds = await prisma.paymentRefund.findMany({
      where: { refundedAt: range, transaction: { status: 'COMPLETED' }, payment: { deletedAt: null } },
      select: { amount: true, payment: { select: { courseId: true, groupId: true, teacherId: true } } },
    });

    const keyOf = (row: { courseId: string; groupId: string | null; teacherId: string | null }) =>
      dimension === 'course' ? row.courseId : dimension === 'group' ? (row.groupId ?? NONE) : (row.teacherId ?? NONE);
    const revenue = new Map<string, number>();
    const teacherRevenue = new Map<string, Map<string, number>>();
    const addRevenue = (row: { courseId: string; groupId: string | null; teacherId: string | null }, amount: number) => {
      const key = keyOf(row);
      revenue.set(key, (revenue.get(key) ?? 0) + amount);
      if (!row.teacherId) return;
      const inner = teacherRevenue.get(row.teacherId) ?? new Map<string, number>();
      inner.set(key, (inner.get(key) ?? 0) + amount);
      teacherRevenue.set(row.teacherId, inner);
    };
    for (const payment of payments) addRevenue(payment, payment.amount.toNumber());
    for (const refund of refunds) addRevenue(refund.payment, -refund.amount.toNumber());

    const periods = await prisma.teacherSalaryPeriod.findMany({
      where: { teacherProfileId: { not: null }, OR: monthsBetween(start, end) },
      select: { totalAmount: true, teacherProfile: { select: { userId: true } } },
    });
    const salaryByTeacher = new Map<string, number>();
    for (const period of periods) {
      const userId = period.teacherProfile?.userId;
      if (userId) salaryByTeacher.set(userId, (salaryByTeacher.get(userId) ?? 0) + period.totalAmount.toNumber());
    }

    const cost = new Map<string, number>();
    let unallocatedCost = 0;
    for (const [teacherId, salary] of salaryByTeacher) {
      if (dimension === 'teacher') {
        cost.set(teacherId, (cost.get(teacherId) ?? 0) + salary);
        continue;
      }
      const shares = [...(teacherRevenue.get(teacherId) ?? new Map<string, number>()).entries()].filter(([, amount]) => amount > 0);
      const total = shares.reduce((sum, [, amount]) => sum + amount, 0);
      if (total === 0) {
        unallocatedCost += salary;
        continue;
      }
      for (const [key, amount] of shares) cost.set(key, (cost.get(key) ?? 0) + (salary * amount) / total);
    }

    const names = new Map<string, { name: string; subtitle: string | null }>();
    const active = new Map<string, number>();
    if (dimension === 'course') {
      const courses = await prisma.course.findMany({ select: { id: true, name: true } });
      for (const course of courses) names.set(course.id, { name: course.name, subtitle: null });
      const counts = await prisma.student.groupBy({ by: ['courseId'], where: { deletedAt: null, status: 'ACTIVE' }, _count: { _all: true } });
      for (const row of counts) active.set(row.courseId, row._count._all);
    } else {
      const groups = await prisma.group.findMany({
        select: {
          id: true,
          name: true,
          teacherId: true,
          course: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
      });
      const counts = await prisma.student.groupBy({
        by: ['groupId'],
        where: { deletedAt: null, status: 'ACTIVE', groupId: { not: null } },
        _count: { _all: true },
      });
      const activeByGroup = new Map(counts.map((row) => [row.groupId ?? NONE, row._count._all]));

      if (dimension === 'group') {
        for (const group of groups) {
          const teacher = group.teacher ? ` · ${group.teacher.firstName} ${group.teacher.lastName}` : '';
          names.set(group.id, { name: group.name, subtitle: `${group.course.name}${teacher}` });
          active.set(group.id, activeByGroup.get(group.id) ?? 0);
        }
        names.set(NONE, { name: 'Guruhsiz to‘lovlar', subtitle: null });
      } else {
        const profiles = await prisma.teacherProfile.findMany({
          select: { userId: true, specialization: true, user: { select: { firstName: true, lastName: true } } },
        });
        for (const profile of profiles) {
          names.set(profile.userId, { name: `${profile.user.firstName} ${profile.user.lastName}`, subtitle: profile.specialization });
        }
        // To'lovga yozilgan, lekin o'qituvchi profili o'chirilgan foydalanuvchilar
        const missing = [...revenue.keys()].filter((id) => id !== NONE && !names.has(id));
        if (missing.length > 0) {
          const users = await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, firstName: true, lastName: true } });
          for (const user of users) names.set(user.id, { name: `${user.firstName} ${user.lastName}`, subtitle: null });
        }
        for (const group of groups) {
          if (!group.teacherId) continue;
          active.set(group.teacherId, (active.get(group.teacherId) ?? 0) + (activeByGroup.get(group.id) ?? 0));
        }
        names.set(NONE, { name: 'O‘qituvchi biriktirilmagan', subtitle: null });
      }
    }

    const keys = new Set([...revenue.keys(), ...cost.keys(), ...[...active.entries()].filter(([, count]) => count > 0).map(([key]) => key)]);
    const rows: ProfitabilityRowDto[] = [...keys]
      .filter((key) => names.has(key))
      .map((key) => {
        const rowRevenue = Math.round(revenue.get(key) ?? 0);
        const teacherCost = Math.round(cost.get(key) ?? 0);
        const students = active.get(key) ?? 0;
        return {
          id: key,
          name: names.get(key)!.name,
          subtitle: names.get(key)!.subtitle,
          revenue: rowRevenue,
          teacherCost,
          contribution: rowRevenue - teacherCost,
          margin: rowRevenue > 0 ? percentOf(rowRevenue - teacherCost, rowRevenue) : null,
          activeStudents: students,
          revenuePerStudent: students > 0 ? Math.round(rowRevenue / students) : null,
        };
      })
      .sort((a, b) => b.contribution - a.contribution || b.revenue - a.revenue);

    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.teacherCost, 0);
    const unallocated = Math.round(unallocatedCost);
    const contribution = totalRevenue - totalCost - unallocated;

    return {
      from,
      to,
      dimension,
      rows,
      totals: {
        revenue: totalRevenue,
        teacherCost: totalCost,
        unallocatedCost: unallocated,
        contribution,
        margin: totalRevenue > 0 ? percentOf(contribution, totalRevenue) : null,
      },
    };
  },

  /** Oylik kohortlar: qo‘shilgan oy bo‘yicha o‘quvchilarning keyingi oylarda qolish foizi */
  async cohorts(query: CohortQuery): Promise<CohortsDto> {
    const now = new Date();
    const { months } = query;
    const students = await prisma.student.findMany({
      where: { deletedAt: null, createdAt: { gte: startOfBusinessMonth(now, months - 1) } },
      select: { id: true, createdAt: true, status: true, statusChangedAt: true },
    });
    const ids = students.map((student) => student.id);
    const paid =
      ids.length === 0
        ? []
        : await prisma.payment.groupBy({ by: ['studentId'], where: { deletedAt: null, studentId: { in: ids } }, _sum: { amount: true } });
    const paidByStudent = new Map(paid.map((row) => [row.studentId, row._sum.amount?.toNumber() ?? 0]));
    const refunded = ids.length === 0 ? new Map<string, number>() : await refundsBy('studentId', undefined, { studentId: { in: ids } });

    const rows: CohortRowDto[] = [];
    for (let index = months - 1; index >= 0; index -= 1) {
      const cohortStart = startOfBusinessMonth(now, index);
      const cohortEnd = startOfBusinessMonth(now, index - 1);
      const key = businessDateString(cohortStart).slice(0, 7);
      const members = students.filter((student) => student.createdAt >= cohortStart && student.createdAt < cohortEnd);

      const retention: Array<number | null> = [];
      for (let offset = 0; offset <= index; offset += 1) {
        // Oy oxiri; joriy oy uchun — hozirgi payt
        const moment = new Date(Math.min(startOfBusinessMonth(now, index - offset - 1).getTime(), now.getTime()));
        const retained = members.filter(
          (student) => !(student.status === 'DROPPED' && student.statusChangedAt !== null && student.statusChangedAt < moment),
        ).length;
        retention.push(members.length === 0 ? null : percentOf(retained, members.length));
      }

      const cohortRevenue = members.reduce((sum, student) => sum + (paidByStudent.get(student.id) ?? 0) - (refunded.get(student.id) ?? 0), 0);
      rows.push({
        key,
        label: `${MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`,
        size: members.length,
        retention,
        revenuePerStudent: members.length > 0 ? Math.round(cohortRevenue / members.length) : null,
        dropped: members.filter((student) => student.status === 'DROPPED').length,
      });
    }

    const average = Array.from({ length: months }, (_, offset) => {
      const eligible = rows.filter((row) => row.size > 0 && row.retention[offset] !== undefined && row.retention[offset] !== null);
      const size = eligible.reduce((sum, row) => sum + row.size, 0);
      return size === 0 ? null : Math.round(eligible.reduce((sum, row) => sum + (row.retention[offset] as number) * row.size, 0) / size);
    });

    return { months, rows, average };
  },

  /** Lead manbalari: konversiya, o‘quvchiga aylanganlar, sof tushum va sotuv tezligi */
  async sources(query: AnalyticsRangeQuery): Promise<SourceAnalyticsDto> {
    const { start, end, from, to } = resolveAnalyticsRange(query);
    const range = { gte: start, lt: end };

    const sources = await prisma.source.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } });
    const created = await prisma.lead.groupBy({ by: ['sourceId'], where: { deletedAt: null, createdAt: range }, _count: { _all: true } });
    const lost = await prisma.lead.groupBy({ by: ['sourceId'], where: { deletedAt: null, status: 'LOST', updatedAt: range }, _count: { _all: true } });
    const won = await prisma.lead.findMany({
      where: { deletedAt: null, status: 'WON', convertedAt: range },
      select: { sourceId: true, createdAt: true, convertedAt: true },
    });
    const students = await prisma.student.findMany({
      where: { deletedAt: null, createdAt: range, lead: { isNot: null } },
      select: { lead: { select: { sourceId: true } } },
    });
    const payments = await prisma.payment.findMany({
      where: { deletedAt: null, paidAt: range, student: { lead: { isNot: null } } },
      select: { amount: true, student: { select: { lead: { select: { sourceId: true } } } } },
    });
    const refunds = await prisma.paymentRefund.findMany({
      where: { refundedAt: range, transaction: { status: 'COMPLETED' }, payment: { deletedAt: null, student: { lead: { isNot: null } } } },
      select: { amount: true, payment: { select: { student: { select: { lead: { select: { sourceId: true } } } } } } },
    });

    const revenueBySource = new Map<string, number>();
    for (const payment of payments) {
      const sourceId = payment.student.lead?.sourceId;
      if (sourceId) revenueBySource.set(sourceId, (revenueBySource.get(sourceId) ?? 0) + payment.amount.toNumber());
    }
    for (const refund of refunds) {
      const sourceId = refund.payment.student.lead?.sourceId;
      if (sourceId) revenueBySource.set(sourceId, (revenueBySource.get(sourceId) ?? 0) - refund.amount.toNumber());
    }

    const rows: SourceAnalyticsRowDto[] = [];
    for (const source of sources) {
      const leads = created.find((row) => row.sourceId === source.id)?._count._all ?? 0;
      const lostCount = lost.find((row) => row.sourceId === source.id)?._count._all ?? 0;
      const wonLeads = won.filter((lead) => lead.sourceId === source.id);
      const revenue = revenueBySource.get(source.id) ?? 0;
      if (leads === 0 && wonLeads.length === 0 && revenue === 0) continue;
      const days = wonLeads
        .filter((lead) => lead.convertedAt !== null)
        .map((lead) => Math.max(lead.convertedAt!.getTime() - lead.createdAt.getTime(), 0) / DAY_MS);
      rows.push({
        id: source.id,
        name: source.name,
        leads,
        won: wonLeads.length,
        lost: lostCount,
        conversion: percentOf(wonLeads.length, wonLeads.length + lostCount),
        students: students.filter((student) => student.lead?.sourceId === source.id).length,
        revenue,
        revenuePerLead: leads > 0 ? Math.round(revenue / leads) : null,
        avgDaysToConvert: days.length > 0 ? round1(days.reduce((sum, value) => sum + value, 0) / days.length) : null,
      });
    }
    rows.sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

    const totalWon = rows.reduce((sum, row) => sum + row.won, 0);
    const totalLost = rows.reduce((sum, row) => sum + row.lost, 0);
    return {
      from,
      to,
      rows,
      totals: {
        leads: rows.reduce((sum, row) => sum + row.leads, 0),
        won: totalWon,
        students: rows.reduce((sum, row) => sum + row.students, 0),
        revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
        conversion: percentOf(totalWon, totalWon + totalLost),
      },
    };
  },
};

const DIMENSION_TITLES: Record<ProfitabilityDimension, { title: string; column: string }> = {
  course: { title: 'Kurslar rentabelligi', column: 'Kurs' },
  group: { title: 'Guruhlar rentabelligi', column: 'Guruh' },
  teacher: { title: 'O‘qituvchilar rentabelligi', column: 'O‘qituvchi' },
};

/** Analitika jadvallarini CSV/Excel eksport uchun tayyorlaydi */
export const analyticsExport = {
  async profitability(query: ProfitabilityQuery): Promise<ExportTable> {
    const data = await analyticsService.profitability(query);
    const titles = DIMENSION_TITLES[data.dimension];
    return {
      title: titles.title,
      subtitle: `${data.from} — ${data.to} · sof tushum − o‘qituvchi maoshi (tushum ulushida taqsimlangan)`,
      columns: [
        { key: 'name', label: titles.column, type: 'text' },
        { key: 'subtitle', label: 'Izoh', type: 'text' },
        { key: 'revenue', label: 'Sof tushum', type: 'money' },
        { key: 'teacherCost', label: 'O‘qituvchi xarajati', type: 'money' },
        { key: 'contribution', label: 'Hissa', type: 'money' },
        { key: 'margin', label: 'Marja', type: 'percent' },
        { key: 'activeStudents', label: 'Faol o‘quvchi', type: 'number' },
        { key: 'revenuePerStudent', label: 'O‘quvchi boshiga', type: 'money' },
      ],
      rows: data.rows.map((row) => ({
        name: row.name,
        subtitle: row.subtitle,
        revenue: row.revenue,
        teacherCost: row.teacherCost,
        contribution: row.contribution,
        margin: row.margin,
        activeStudents: row.activeStudents,
        revenuePerStudent: row.revenuePerStudent,
      })),
      totals: { revenue: data.totals.revenue, teacherCost: data.totals.teacherCost, contribution: data.totals.contribution },
    };
  },

  async cohorts(query: CohortQuery): Promise<ExportTable> {
    const data = await analyticsService.cohorts(query);
    const offsets = Array.from({ length: data.months }, (_, offset) => offset);
    return {
      title: 'O‘quvchilar kohortlari',
      subtitle: `So‘nggi ${data.months} oy · oy oxirida ketmagan o‘quvchilar ulushi`,
      columns: [
        { key: 'label', label: 'Qo‘shilgan oy', type: 'text' },
        { key: 'size', label: 'O‘quvchilar', type: 'number' },
        ...offsets.map((offset) => ({ key: `m${offset}`, label: offset === 0 ? '0-oy' : `+${offset} oy`, type: 'percent' as const })),
        { key: 'revenuePerStudent', label: 'O‘quvchi boshiga tushum', type: 'money' },
        { key: 'dropped', label: 'Ketgan', type: 'number' },
      ],
      rows: data.rows.map((row) => ({
        label: row.label,
        size: row.size,
        ...Object.fromEntries(offsets.map((offset) => [`m${offset}`, row.retention[offset] ?? null])),
        revenuePerStudent: row.revenuePerStudent,
        dropped: row.dropped,
      })),
      totals: null,
    };
  },

  async sources(query: AnalyticsRangeQuery): Promise<ExportTable> {
    const data = await analyticsService.sources(query);
    return {
      title: 'Lead manbalari samaradorligi',
      subtitle: `${data.from} — ${data.to}`,
      columns: [
        { key: 'name', label: 'Manba', type: 'text' },
        { key: 'leads', label: 'Leadlar', type: 'number' },
        { key: 'won', label: 'Sotildi', type: 'number' },
        { key: 'lost', label: 'Yo‘qotildi', type: 'number' },
        { key: 'conversion', label: 'Konversiya', type: 'percent' },
        { key: 'students', label: 'O‘quvchilar', type: 'number' },
        { key: 'revenue', label: 'Sof tushum', type: 'money' },
        { key: 'revenuePerLead', label: 'Lead boshiga tushum', type: 'money' },
        { key: 'avgDaysToConvert', label: 'Sotuv tezligi (kun)', type: 'number' },
      ],
      rows: data.rows.map((row) => ({
        name: row.name,
        leads: row.leads,
        won: row.won,
        lost: row.lost,
        conversion: row.conversion,
        students: row.students,
        revenue: row.revenue,
        revenuePerLead: row.revenuePerLead,
        avgDaysToConvert: row.avgDaysToConvert,
      })),
      totals: { leads: data.totals.leads, won: data.totals.won, students: data.totals.students, revenue: data.totals.revenue },
    };
  },
};
