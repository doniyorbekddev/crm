import { prisma } from '../config/database.js';
import { LEAD_STATUS_LABELS } from '../config/leadLabels.js';
import { PAYMENT_METHOD_LABELS } from '../config/paymentLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AuthUser } from '../types/auth.js';
import { addDays, startOfBusinessDay } from '../utils/dates.js';
import { ACTIVITY_TYPES } from '../validators/activity.validator.js';
import type { ActivityQuery, ActivityType } from '../validators/activity.validator.js';
import { permissionService } from './permission.service.js';

/**
 * Faoliyat markazi (promt 57-bo‘lim): yangi o‘quvchi, to‘lov, xarajat, lead, davomat,
 * o‘qituvchi amallari va maosh — bitta vaqt chizig‘ida. Ma’lumot asosiy jadvallardan olinadi
 * (summa, ism, guruh bilan); xodim faqat ruxsati bor turlarni ko‘radi.
 */

export interface ActivityItemDto {
  id: string;
  type: ActivityType;
  occurredAt: string;
  title: string;
  description: string;
  /** Pul harakati bo‘lsa; chiqim manfiy */
  amount: number | null;
  tone: 'positive' | 'negative' | 'neutral';
  actor: { id: string; firstName: string; lastName: string } | null;
  link: string | null;
}

export interface ActivityFeedDto {
  items: ActivityItemDto[];
  /** Keyingi sahifa uchun; oxirgi sahifada null */
  nextCursor: string | null;
  /** Shu xodimga ruxsat berilgan turlar */
  types: ActivityType[];
}

const TYPE_PERMISSIONS: Record<ActivityType, PermissionKey> = {
  student: PERMISSIONS.STUDENT_VIEW,
  payment: PERMISSIONS.PAYMENT_VIEW,
  expense: PERMISSIONS.EXPENSE_VIEW,
  lead: PERMISSIONS.LEAD_VIEW,
  attendance: PERMISSIONS.ATTENDANCE_VIEW,
  teaching: PERMISSIONS.HOMEWORK_VIEW,
  salary: PERMISSIONS.SALARY_VIEW,
};

const EXPENSE_STATUS_TITLES = { UPCOMING: 'kutilmoqda', PENDING: 'tasdiq kutmoqda', APPROVED: 'tasdiqlangan', REJECTED: 'rad etilgan', PAID: 'to‘langan' } as const;

type RawItem = Omit<ActivityItemDto, 'actor' | 'occurredAt'> & { occurredAt: Date; actorId: string | null };

function businessDayStart(value: string): Date {
  return startOfBusinessDay(new Date(`${value}T12:00:00.000Z`));
}

function displayDate(value: Date): string {
  const iso = value.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

const fullName = (person: { firstName: string; lastName: string | null } | null | undefined) =>
  person ? [person.firstName, person.lastName].filter(Boolean).join(' ') : 'Noma’lum';

type Range = { gte?: Date; lt: Date };

const SOURCES: Record<ActivityType, (range: Range, take: number) => Promise<RawItem[]>> = {
  async student(range, take) {
    const rows = await prisma.student.findMany({
      where: { deletedAt: null, createdAt: range },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, number: true, firstName: true, lastName: true, createdAt: true, createdById: true, course: { select: { name: true } } },
    });
    // Guruh almashtirish va guruhdan chiqarish (birinchi qo'shilish "yangi o'quvchi" sifatida ko'rinadi)
    const changes = await prisma.studentGroupChange.findMany({
      where: { changedAt: range, fromGroupName: { not: null }, student: { deletedAt: null } },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        studentId: true,
        fromGroupName: true,
        toGroupName: true,
        reason: true,
        changedAt: true,
        changedById: true,
        student: { select: { number: true, firstName: true, lastName: true } },
      },
    });
    const moves: RawItem[] = changes.map((change) => ({
      id: `group-change:${change.id}`,
      type: 'student',
      occurredAt: change.changedAt,
      title: change.toGroupName ? `Guruh almashtirildi: ${fullName(change.student)}` : `Guruhdan chiqarildi: ${fullName(change.student)}`,
      description: `${formatStudentNumber(change.student.number)} · ${change.fromGroupName ?? '—'} → ${change.toGroupName ?? 'guruhsiz'}${change.reason ? ` · ${change.reason}` : ''}`,
      amount: null,
      tone: change.toGroupName ? 'neutral' : 'negative',
      actorId: change.changedById,
      link: `/students/${change.studentId}`,
    }));

    return [...moves, ...rows.map((row): RawItem => ({
      id: `student:${row.id}`,
      type: 'student',
      occurredAt: row.createdAt,
      title: `Yangi o‘quvchi: ${fullName(row)}`,
      description: `${formatStudentNumber(row.number)} · ${row.course.name}`,
      amount: null,
      tone: 'positive',
      actorId: row.createdById,
      link: `/students/${row.id}`,
    }))];
  },

  async payment(range, take) {
    const payments = await prisma.payment.findMany({
      where: { deletedAt: null, paidAt: range },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        accountantId: true,
        managerId: true,
        student: { select: { id: true, firstName: true, lastName: true } },
        course: { select: { name: true } },
      },
    });
    const refunds = await prisma.paymentRefund.findMany({
      where: { refundedAt: range, transaction: { status: 'COMPLETED' } },
      orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        amount: true,
        reason: true,
        refundedAt: true,
        createdById: true,
        payment: { select: { student: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    return [
      ...payments.map((row): RawItem => ({
        id: `payment:${row.id}`,
        type: 'payment',
        occurredAt: row.paidAt,
        title: `To‘lov: ${fullName(row.student)}`,
        description: `${row.course.name} · ${PAYMENT_METHOD_LABELS[row.method]}`,
        amount: row.amount.toNumber(),
        tone: 'positive',
        actorId: row.accountantId ?? row.managerId,
        link: `/students/${row.student.id}`,
      })),
      ...refunds.map((row): RawItem => ({
        id: `refund:${row.id}`,
        type: 'payment',
        occurredAt: row.refundedAt,
        title: `Pul qaytarildi: ${fullName(row.payment.student)}`,
        description: row.reason,
        amount: -row.amount.toNumber(),
        tone: 'negative',
        actorId: row.createdById,
        link: `/students/${row.payment.student.id}`,
      })),
    ];
  },

  async expense(range, take) {
    // Maosh to'lovi uchun yaratilgan xarajat "maosh" turida ko'rsatiladi
    const rows = await prisma.expense.findMany({
      where: { createdAt: range, salaryPaymentId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, amount: true, status: true, description: true, vendor: true, createdAt: true, responsibleId: true, category: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: `expense:${row.id}`,
      type: 'expense',
      occurredAt: row.createdAt,
      title: `Xarajat: ${row.category.name}`,
      description: [row.vendor ?? row.description, EXPENSE_STATUS_TITLES[row.status]].filter(Boolean).join(' · '),
      amount: -row.amount.toNumber(),
      tone: 'negative',
      actorId: row.responsibleId,
      link: '/expenses',
    }));
  },

  async lead(range, take) {
    const rows = await prisma.lead.findMany({
      where: { deletedAt: null, createdAt: range },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, firstName: true, lastName: true, status: true, createdAt: true, createdById: true, assignedToId: true, source: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: `lead:${row.id}`,
      type: 'lead',
      occurredAt: row.createdAt,
      title: `Yangi lead: ${fullName(row)}`,
      description: `${row.source.name} · ${LEAD_STATUS_LABELS[row.status]}`,
      amount: null,
      tone: 'neutral',
      actorId: row.createdById ?? row.assignedToId,
      link: `/leads/${row.id}`,
    }));
  },

  async attendance(range, take) {
    const rows = await prisma.attendanceSession.findMany({
      where: { createdAt: range },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        date: true,
        status: true,
        topic: true,
        createdAt: true,
        markedById: true,
        teacherId: true,
        group: { select: { name: true } },
        attendances: { select: { status: true } },
      },
    });
    return rows.map((row) => {
      const present = row.attendances.filter((mark) => mark.status === 'PRESENT' || mark.status === 'LATE').length;
      const cancelled = row.status === 'CANCELLED';
      return {
        id: `attendance:${row.id}`,
        type: 'attendance',
        occurredAt: row.createdAt,
        title: cancelled ? `Dars bekor qilindi: ${row.group.name}` : `Davomat: ${row.group.name}`,
        description: cancelled
          ? displayDate(row.date)
          : `${displayDate(row.date)} · ${present}/${row.attendances.length} keldi${row.topic ? ` · ${row.topic}` : ''}`,
        amount: null,
        tone: cancelled ? 'negative' : 'neutral',
        actorId: row.markedById ?? row.teacherId,
        link: '/attendance',
      };
    });
  },

  async teaching(range, take) {
    const homework = await prisma.homework.findMany({
      where: { createdAt: range },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, title: true, deadline: true, createdAt: true, teacherId: true, group: { select: { name: true } } },
    });
    const exams = await prisma.exam.findMany({
      where: { createdAt: range },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, title: true, date: true, createdAt: true, teacherId: true, group: { select: { name: true } } },
    });
    return [
      ...homework.map((row): RawItem => ({
        id: `homework:${row.id}`,
        type: 'teaching',
        occurredAt: row.createdAt,
        title: `Uy vazifasi: ${row.title}`,
        description: `${row.group.name} · muddati ${displayDate(row.deadline)}`,
        amount: null,
        tone: 'neutral',
        actorId: row.teacherId,
        link: '/homework',
      })),
      ...exams.map((row): RawItem => ({
        id: `exam:${row.id}`,
        type: 'teaching',
        occurredAt: row.createdAt,
        title: `Imtihon: ${row.title}`,
        description: `${row.group.name} · ${displayDate(row.date)}`,
        amount: null,
        tone: 'neutral',
        actorId: row.teacherId,
        link: '/exams',
      })),
    ];
  },

  async salary(range, take) {
    const rows = await prisma.teacherSalaryPayment.findMany({
      where: { paidAt: range },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        amount: true,
        kind: true,
        paidAt: true,
        createdById: true,
        period: {
          select: {
            year: true,
            month: true,
            teacherProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: `salary:${row.id}`,
      type: 'salary',
      occurredAt: row.paidAt,
      title: `${row.kind === 'ADVANCE' ? 'Avans' : 'Maosh'}: ${fullName(row.period.teacherProfile?.user ?? row.period.employee)}`,
      description: formatSalaryPeriod(row.period.year, row.period.month),
      amount: -row.amount.toNumber(),
      tone: 'negative',
      actorId: row.createdById,
      link: '/salaries',
    }));
  },
};

export const activityService = {
  async feed(actor: AuthUser, query: ActivityQuery): Promise<ActivityFeedDto> {
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    const allowed = ACTIVITY_TYPES.filter((type) => permissions.has(TYPE_PERMISSIONS[type]));
    const requested = query.types ? allowed.filter((type) => query.types!.includes(type)) : allowed;

    const end = query.to ? addDays(businessDayStart(query.to), 1) : new Date(Date.now() + 60_000);
    const cursor = query.cursor ? new Date(query.cursor) : null;
    const range: Range = {
      ...(query.from ? { gte: businessDayStart(query.from) } : {}),
      lt: cursor && cursor < end ? cursor : end,
    };

    // Har manbadan limit+1 ta — birlashtirilgach keyingi sahifa bor-yo‘qligi aniq bo‘ladi
    const take = query.limit + 1;
    const raw = (await Promise.all(requested.map((type) => SOURCES[type](range, take)))).flat();
    raw.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id));
    const page = raw.slice(0, query.limit);

    const actorIds = [...new Set(page.flatMap((item) => (item.actorId ? [item.actorId] : [])))];
    const users = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    return {
      items: page.map(({ actorId, occurredAt, ...item }) => ({
        ...item,
        occurredAt: occurredAt.toISOString(),
        actor: actorId ? (userById.get(actorId) ?? null) : null,
      })),
      nextCursor: raw.length > query.limit ? page[page.length - 1]!.occurredAt.toISOString() : null,
      types: allowed,
    };
  },
};
