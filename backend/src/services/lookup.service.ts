import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { AccountType } from '../generated/prisma/client.js';

export interface LeadFormLookups {
  sources: Array<{ id: string; key: string; name: string }>;
  courses: Array<{ id: string; name: string }>;
  /** Leadga mas’ul bo‘la oladigan faol xodimlar (`lead.view` ruxsati bor) */
  managers: Array<{ id: string; firstName: string; lastName: string; roleName: string }>;
}

export interface GroupFormLookups {
  courses: Array<{ id: string; name: string }>;
  /** Dars bera oladigan faol xodimlar (`attendance.mark` ruxsati bor) */
  teachers: Array<{ id: string; firstName: string; lastName: string; roleName: string }>;
}

const staffSelect = { id: true, firstName: true, lastName: true, role: { select: { name: true } } } as const;

function toStaff(user: { id: string; firstName: string; lastName: string; role: { name: string } }) {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName, roleName: user.role.name };
}

function staffWithPermission(permissionKey: string) {
  return {
    status: 'ACTIVE' as const,
    deletedAt: null,
    role: { permissions: { some: { permission: { key: permissionKey } } } },
  };
}

export interface StudentFormLookups {
  courses: Array<{ id: string; name: string; finalPrice: number }>;
  /** Yakunlanmagan guruhlar — bo‘sh o‘rin soni bilan */
  groups: Array<{ id: string; name: string; courseId: string; capacity: number; studentCount: number; freeSeats: number }>;
}

export interface PaymentFormLookups {
  courses: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; courseId: string }>;
  /** To‘lovni lead egasi (manager) kesimida filtrlash uchun */
  managers: Array<{ id: string; firstName: string; lastName: string; roleName: string }>;
}

export interface SalaryFormLookups {
  /** Maosh to‘lovi qaysi kassadan chiqqanini belgilash uchun */
  accounts: Array<{ id: string; key: string; name: string; type: AccountType; balance: number }>;
}

export interface MarketingSourceLookups {
  /** Reklama xarajatini kanalga bog‘lash uchun faol manbalar */
  sources: Array<{ id: string; name: string }>;
}

export const lookupService = {
  async marketingSources(): Promise<MarketingSourceLookups> {
    const sources = await prisma.source.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
    return { sources };
  },

  async leadForm(): Promise<LeadFormLookups> {
    const sources = await prisma.source.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, key: true, name: true },
    });
    const courses = await prisma.course.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const managers = await prisma.user.findMany({
      where: staffWithPermission(PERMISSIONS.LEAD_VIEW),
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: staffSelect,
    });

    return { sources, courses, managers: managers.map(toStaff) };
  },

  async groupForm(): Promise<GroupFormLookups> {
    const courses = await prisma.course.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const teachers = await prisma.user.findMany({
      where: staffWithPermission(PERMISSIONS.ATTENDANCE_MARK),
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: staffSelect,
    });

    return { courses, teachers: teachers.map(toStaff) };
  },

  async studentForm(): Promise<StudentFormLookups> {
    const courses = await prisma.course.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, finalPrice: true },
    });
    const groups = await prisma.group.findMany({
      where: { status: { in: ['PLANNED', 'ACTIVE'] } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        courseId: true,
        capacity: true,
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
    });

    return {
      courses: courses.map((course) => ({ id: course.id, name: course.name, finalPrice: course.finalPrice.toNumber() })),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        courseId: group.courseId,
        capacity: group.capacity,
        studentCount: group._count.students,
        freeSeats: Math.max(group.capacity - group._count.students, 0),
      })),
    };
  },

  async salaryForm(): Promise<SalaryFormLookups> {
    const accounts = await prisma.financialAccount.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, key: true, name: true, type: true, balance: true },
    });

    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        key: account.key,
        name: account.name,
        type: account.type,
        balance: account.balance.toNumber(),
      })),
    };
  },

  async paymentForm(): Promise<PaymentFormLookups> {
    const courses = await prisma.course.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, courseId: true },
    });
    const managers = await prisma.user.findMany({
      where: staffWithPermission(PERMISSIONS.LEAD_VIEW),
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: staffSelect,
    });

    return { courses, groups, managers: managers.map(toStaff) };
  },
};
