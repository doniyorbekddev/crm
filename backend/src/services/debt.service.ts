import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { DebtStatus, Prisma } from '../generated/prisma/client.js';
import { toSkipTake } from '../utils/pagination.js';
import type { DebtListQuery, DebtRange } from '../validators/payment.validator.js';
import { scheduleDueStats } from './paymentSchedule.service.js';
import type { StudentDueStats } from './paymentSchedule.service.js';

const debtSelect = {
  totalAmount: true,
  paidAmount: true,
  remainingAmount: true,
  status: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      number: true,
      firstName: true,
      lastName: true,
      phone: true,
      parentPhone: true,
      startDate: true,
      status: true,
      course: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
      payments: {
        where: { deletedAt: null },
        orderBy: { paidAt: 'desc' },
        take: 1,
        select: { paidAt: true, amount: true },
      },
    },
  },
} satisfies Prisma.DebtSelect;

type DebtRecord = Prisma.DebtGetPayload<{ select: typeof debtSelect }>;

export interface DebtDto {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  parentPhone: string | null;
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
  total: number;
  paid: number;
  remaining: number;
  status: DebtStatus;
  /** Oxirgi to‘lov (bo‘lmasa null) */
  lastPayment: { paidAt: string; amount: number } | null;
  startDate: string;
  /** To‘lov jadvali bo‘yicha holat; jadval tuzilmagan bo‘lsa null */
  schedule: { overdueAmount: number; overdueDays: number; nextDueDate: string | null } | null;
}

export interface DebtSummaryDto {
  /** Barcha qarzdorlik yig‘indisi (qolgan summa) */
  totalRemaining: number;
  totalPaid: number;
  totalContracts: number;
  students: number;
  byRange: Record<Exclude<DebtRange, 'all'>, { students: number; remaining: number }>;
  /** Jadval bo‘yicha muddati o‘tganlar */
  overdue: { students: number; amount: number };
  /** Yaqin 7 kunda (bugun ham) to‘lanishi kerak bo‘lganlar */
  upcoming: { students: number; amount: number };
}

/** Qarz oraliqlari — buxgalter uchun odatiy kesim */
const RANGE_FILTERS: Record<Exclude<DebtRange, 'all'>, Prisma.DebtWhereInput> = {
  zero: { remainingAmount: { lte: 0 } },
  upto500k: { remainingAmount: { gt: 0, lte: 500_000 } },
  '500k-1m': { remainingAmount: { gt: 500_000, lte: 1_000_000 } },
  '1m-plus': { remainingAmount: { gt: 1_000_000 } },
};

function toDebtDto(debt: DebtRecord, stats: StudentDueStats | undefined): DebtDto {
  const lastPayment = debt.student.payments[0];
  return {
    studentId: debt.student.id,
    code: formatStudentNumber(debt.student.number),
    firstName: debt.student.firstName,
    lastName: debt.student.lastName,
    phone: debt.student.phone,
    parentPhone: debt.student.parentPhone,
    course: debt.student.course,
    group: debt.student.group,
    total: debt.totalAmount.toNumber(),
    paid: debt.paidAmount.toNumber(),
    remaining: debt.remainingAmount.toNumber(),
    status: debt.status,
    lastPayment: lastPayment ? { paidAt: lastPayment.paidAt.toISOString(), amount: lastPayment.amount.toNumber() } : null,
    startDate: debt.student.startDate.toISOString().slice(0, 10),
    schedule: stats ? { overdueAmount: stats.overdueAmount, overdueDays: stats.overdueDays, nextDueDate: stats.nextDueDate } : null,
  };
}

/**
 * `scope` — filial doirasi (`branchFilter`): filialga biriktirilgan xodim faqat o'z filiali
 * o'quvchilari qarzini ko'radi (web, Telegram bot va AI yordamchi — bir xil qoida).
 */
function buildDebtWhere(query: Partial<DebtListQuery>, scope: Prisma.StudentWhereInput = {}): Prisma.DebtWhereInput {
  const studentFilter: Prisma.StudentWhereInput = { deletedAt: null, ...scope };
  if (query.courseId) studentFilter.courseId = query.courseId;
  if (query.groupId) studentFilter.groupId = query.groupId;

  const conditions: Prisma.DebtWhereInput[] = [{ student: studentFilter }];
  if (query.range && query.range !== 'all') conditions.push(RANGE_FILTERS[query.range]);

  const search = query.search?.trim();
  if (search) {
    const or: Prisma.DebtWhereInput[] = [
      { student: { firstName: { contains: search, mode: 'insensitive' } } },
      { student: { lastName: { contains: search, mode: 'insensitive' } } },
    ];
    const digits = search.replace(/\D/g, '');
    if (digits.length >= 2) {
      or.push({ student: { phone: { contains: digits } } }, { student: { parentPhone: { contains: digits } } });
    }
    const numberMatch = /^(?:st-?)?0*(\d{1,9})$/i.exec(search);
    if (numberMatch?.[1]) or.push({ student: { number: Number(numberMatch[1]) } });
    conditions.push({ OR: or });
  }

  return { AND: conditions };
}

function buildOrderBy(
  sortBy: DebtListQuery['sortBy'],
  sortOrder: DebtListQuery['sortOrder'],
): Prisma.DebtOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'name':
      return [{ student: { firstName: sortOrder } }, { student: { lastName: sortOrder } }];
    case 'startDate':
      return [{ student: { startDate: sortOrder } }];
    case 'remaining':
      return [{ remainingAmount: sortOrder }, { id: 'asc' }];
  }
}

export const debtService = {
  async list(query: DebtListQuery, scope: Prisma.StudentWhereInput = {}): Promise<{ items: DebtDto[]; total: number }> {
    const now = new Date();
    let where = buildDebtWhere(query, scope);
    if (query.due !== 'all') {
      const stats = await scheduleDueStats(now);
      const ids = [...stats]
        .filter(([, item]) => (query.due === 'overdue' ? item.overdueAmount > 0 : item.upcomingAmount > 0))
        .map(([studentId]) => studentId);
      where = { AND: [where, { studentId: { in: ids } }] };
    }
    const items = await prisma.debt.findMany({
      where,
      select: debtSelect,
      // Katta qarzlar birinchi ko‘rinishi uchun standart tartib: remaining desc
      orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.debt.count({ where });
    const pageStats = await scheduleDueStats(
      now,
      items.map((item) => item.student.id),
    );
    return { items: items.map((item) => toDebtDto(item, pageStats.get(item.student.id))), total };
  },

  /** Umumiy qarzdorlik va oraliqlar kesimi (ro‘yxat filtrlarini hisobga oladi, `range` dan tashqari) */
  async summary(query: DebtListQuery, scope: Prisma.StudentWhereInput = {}): Promise<DebtSummaryDto> {
    const baseWhere = buildDebtWhere({ ...query, range: 'all' }, scope);
    const aggregate = await prisma.debt.aggregate({
      where: baseWhere,
      _sum: { remainingAmount: true, paidAmount: true, totalAmount: true },
      _count: { _all: true },
    });

    // Oraliqlar ketma-ket so‘raladi — lokal dev bazasi ko‘p parallel so‘rovni ko‘tarmaydi
    const byRange = {} as DebtSummaryDto['byRange'];
    for (const range of Object.keys(RANGE_FILTERS) as Array<Exclude<DebtRange, 'all'>>) {
      const rangeAggregate = await prisma.debt.aggregate({
        where: { AND: [baseWhere, RANGE_FILTERS[range]] },
        _sum: { remainingAmount: true },
        _count: { _all: true },
      });
      byRange[range] = {
        students: rangeAggregate._count._all,
        remaining: rangeAggregate._sum.remainingAmount?.toNumber() ?? 0,
      };
    }

    const studentIds = (await prisma.debt.findMany({ where: baseWhere, select: { studentId: true } })).map((row) => row.studentId);
    const overdue = { students: 0, amount: 0 };
    const upcoming = { students: 0, amount: 0 };
    for (const item of (await scheduleDueStats(new Date(), studentIds)).values()) {
      if (item.overdueAmount > 0) {
        overdue.students += 1;
        overdue.amount += item.overdueAmount;
      }
      if (item.upcomingAmount > 0) {
        upcoming.students += 1;
        upcoming.amount += item.upcomingAmount;
      }
    }

    return {
      overdue,
      upcoming,
      totalRemaining: aggregate._sum.remainingAmount?.toNumber() ?? 0,
      totalPaid: aggregate._sum.paidAmount?.toNumber() ?? 0,
      totalContracts: aggregate._sum.totalAmount?.toNumber() ?? 0,
      students: aggregate._count._all,
      byRange,
    };
  },
};
