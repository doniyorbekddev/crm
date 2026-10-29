import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { AccountType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { dictionaryNameKey, sameDictionaryName, uniqueDictionaryKey } from '../utils/dictionaryName.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';

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

/**
 * Formalarda erkin yoziladigan qiymatlar uchun takliflar: markaz avval yozganlari keyingi safar ro'yxatda chiqadi.
 * Ko'p ishlatilgani birinchi. Har bir maydon o'z ruxsati bilan ochiladi (routes).
 */
export const CUSTOM_LABEL_FIELDS = ['course-category', 'parent-relation', 'employee-position', 'employee-department', 'product-unit'] as const;
export type CustomLabelField = (typeof CUSTOM_LABEL_FIELDS)[number];

const SUGGESTION_LIMIT = 30;

/**
 * `groupBy` natijasi: bo'sh qiymatlar tashlanadi, bir xil nomning yozilish variantlari ("robototexnika" / "Robototexnika")
 * bitta taklif — ko'rinishi eng ko'p ishlatilgan (teng bo'lsa bosh harfli) variant.
 */
function rankLabels(rows: Array<{ label: string | null; count: number }>): string[] {
  const merged = new Map<string, { total: number; variants: Map<string, number> }>();
  for (const row of rows) {
    const label = row.label?.trim();
    if (!label) continue;
    const key = dictionaryNameKey(label);
    const entry = merged.get(key) ?? { total: 0, variants: new Map<string, number>() };
    entry.total += row.count;
    entry.variants.set(label, (entry.variants.get(label) ?? 0) + row.count);
    merged.set(key, entry);
  }
  const capitalized = (label: string) => (label[0] !== undefined && label[0] !== label[0].toLocaleLowerCase('uz') ? 1 : 0);
  return [...merged.values()]
    .map((entry) => ({
      total: entry.total,
      label: [...entry.variants].sort(([a, countA], [b, countB]) => countB - countA || capitalized(b) - capitalized(a) || a.localeCompare(b, 'uz'))[0]![0],
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'uz'))
    .slice(0, SUGGESTION_LIMIT)
    .map((entry) => entry.label);
}

export const lookupService = {
  async customLabels(field: CustomLabelField): Promise<string[]> {
    switch (field) {
      case 'course-category': {
        const rows = await prisma.course.groupBy({ by: ['categoryLabel'], where: { category: 'OTHER', categoryLabel: { not: null } }, _count: { _all: true } });
        return rankLabels(rows.map((row) => ({ label: row.categoryLabel, count: row._count._all })));
      }
      case 'parent-relation': {
        const rows = await prisma.studentParent.groupBy({ by: ['relationLabel'], where: { relation: 'OTHER', relationLabel: { not: null } }, _count: { _all: true } });
        return rankLabels(rows.map((row) => ({ label: row.relationLabel, count: row._count._all })));
      }
      case 'employee-position': {
        const rows = await prisma.employee.groupBy({ by: ['positionTitle'], where: { position: 'OTHER', positionTitle: { not: null } }, _count: { _all: true } });
        return rankLabels(rows.map((row) => ({ label: row.positionTitle, count: row._count._all })));
      }
      case 'employee-department': {
        const rows = await prisma.employee.groupBy({ by: ['department'], where: { department: { not: null } }, _count: { _all: true } });
        return rankLabels(rows.map((row) => ({ label: row.department, count: row._count._all })));
      }
      case 'product-unit': {
        const rows = await prisma.product.groupBy({ by: ['unit'], _count: { _all: true } });
        return rankLabels(rows.map((row) => ({ label: row.unit, count: row._count._all })));
      }
    }
  },

  /**
   * Lead/reklama manbasini formadan qo'shish: faqat nom. Bir xil nomli faol manba bo'lsa — 409,
   * yashirilgani bo'lsa qayta yoqiladi (eski leadlar va hisobotlar shu manbada qoladi).
   */
  async createSource(actor: AuthUser, name: string, client: ClientInfo): Promise<{ id: string; name: string }> {
    const existing = await prisma.source.findMany({ select: { id: true, key: true, name: true, isActive: true, sortOrder: true } });
    const twin = existing.find((row) => sameDictionaryName(row.name, name));
    if (twin?.isActive) {
      throw AppError.conflict('Bunday nomli manba bor', [{ field: 'name', message: `“${twin.name}” allaqachon mavjud` }]);
    }

    const source = await prisma.$transaction(async (tx) => {
      const saved = twin
        ? await tx.source.update({ where: { id: twin.id }, data: { isActive: true }, select: { id: true, key: true, name: true } })
        : await tx.source.create({
            data: {
              key: uniqueDictionaryKey(name, new Set(existing.map((row) => row.key)), { fallback: 'SOURCE' }),
              name,
              sortOrder: Math.min(999, Math.max(0, ...existing.map((row) => row.sortOrder)) + 1),
            },
            select: { id: true, key: true, name: true },
          });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: twin ? 'source.reactivated' : 'source.created',
        entityType: 'settings',
        entityId: saved.id,
        metadata: { key: saved.key, name: saved.name },
        ...client,
      });
      return saved;
    });

    return { id: source.id, name: source.name };
  },

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
        // Asosiy o'quvchilar + faol qo'shimcha a'zolar
        _count: { select: { students: { where: { deletedAt: null } }, memberships: { where: { leftAt: null, student: { deletedAt: null } } } } },
      },
    });

    return {
      courses: courses.map((course) => ({ id: course.id, name: course.name, finalPrice: course.finalPrice.toNumber() })),
      groups: groups.map((group) => {
        const studentCount = group._count.students + group._count.memberships;
        return {
          id: group.id,
          name: group.name,
          courseId: group.courseId,
          capacity: group.capacity,
          studentCount,
          freeSeats: Math.max(group.capacity - studentCount, 0),
        };
      }),
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
