import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { TargetType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessMonthRange, currentBusinessMonth } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { SaveTargetInput, TargetQuery } from '../validators/alert.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';
import { refundsBy } from './revenue.js';

export const TARGET_TYPE_LIST: readonly TargetType[] = ['LEADS', 'SALES', 'REVENUE'];

export interface TargetCellDto {
  id: string | null;
  target: number;
  actual: number;
  /** Bajarilish foizi (reja 0 bo‘lsa 0) */
  progress: number;
}

export interface TargetRowDto {
  userId: string;
  firstName: string;
  lastName: string;
  roleName: string;
  targets: Record<TargetType, TargetCellDto>;
}

export interface TargetOverviewDto {
  year: number;
  month: number;
  label: string;
  canManage: boolean;
  rows: TargetRowDto[];
  totals: Record<TargetType, { target: number; actual: number; progress: number }>;
}

function progressOf(actual: number, target: number): number {
  return target <= 0 ? 0 : Math.round((actual / target) * 100);
}

/**
 * Oy bo‘yicha sotuv rejalari va haqiqiy natijalar. Ro‘yxatga shu oy uchun rejasi bor
 * yoki shu oyda lead biriktirilgan xodimlar kiradi. Alertlar ham shu hisobdan foydalanadi.
 * - LEADS: shu oyda biriktirilgan leadlar
 * - SALES: shu oyda sotilgan (WON) leadlar
 * - REVENUE: manager olib kelgan o‘quvchilardan shu oydagi to‘lovlar
 */
export async function computeTargetProgress(year: number, month: number, onlyUserId?: string): Promise<TargetRowDto[]> {
  const { start, end } = businessMonthRange(year, month);
  const userFilter = onlyUserId ? onlyUserId : { not: null };

  const targets = await prisma.salesTarget.findMany({
    where: { year, month, userId: userFilter },
    select: { id: true, userId: true, type: true, targetValue: true },
  });
  const leads = await prisma.lead.groupBy({
    by: ['assignedToId'],
    where: { deletedAt: null, assignedToId: userFilter, createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });

  const userIds = new Set<string>();
  for (const target of targets) if (target.userId) userIds.add(target.userId);
  for (const row of leads) if (row.assignedToId) userIds.add(row.assignedToId);
  if (userIds.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const ids = users.map((user) => user.id);

  const sales = await prisma.lead.groupBy({
    by: ['assignedToId'],
    where: { deletedAt: null, status: 'WON', assignedToId: { in: ids }, convertedAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const revenue = await prisma.payment.groupBy({
    by: ['managerId'],
    where: { deletedAt: null, managerId: { in: ids }, paidAt: { gte: start, lt: end } },
    _sum: { amount: true },
  });

  const refunds = await refundsBy('managerId', { gte: start, lt: end }, { managerId: { in: ids } });

  const actualOf = (userId: string, type: TargetType): number => {
    if (type === 'LEADS') return leads.find((row) => row.assignedToId === userId)?._count._all ?? 0;
    if (type === 'SALES') return sales.find((row) => row.assignedToId === userId)?._count._all ?? 0;
    return (revenue.find((row) => row.managerId === userId)?._sum.amount?.toNumber() ?? 0) - (refunds.get(userId) ?? 0);
  };

  return users.map((user) => {
    const cells = {} as Record<TargetType, TargetCellDto>;
    for (const type of TARGET_TYPE_LIST) {
      const target = targets.find((row) => row.userId === user.id && row.type === type);
      const targetValue = target?.targetValue.toNumber() ?? 0;
      const actual = actualOf(user.id, type);
      cells[type] = { id: target?.id ?? null, target: targetValue, actual, progress: progressOf(actual, targetValue) };
    }
    return { userId: user.id, firstName: user.firstName, lastName: user.lastName, roleName: user.role.name, targets: cells };
  });
}

export const targetService = {
  /** Rejani boshqara oladigan xodim hammani, qolganlar faqat o‘zini ko‘radi */
  async overview(actor: AuthUser, query: TargetQuery): Promise<TargetOverviewDto> {
    const current = currentBusinessMonth();
    const year = query.year ?? current.year;
    const month = query.month ?? current.month;
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    const canManage = permissions.has(PERMISSIONS.TARGET_MANAGE);

    const rows = await computeTargetProgress(year, month, canManage ? undefined : actor.id);
    const totals = {} as TargetOverviewDto['totals'];
    for (const type of TARGET_TYPE_LIST) {
      const target = rows.reduce((sum, row) => sum + row.targets[type].target, 0);
      const actual = rows.reduce((sum, row) => sum + row.targets[type].actual, 0);
      totals[type] = { target, actual, progress: progressOf(actual, target) };
    }

    return { year, month, label: formatSalaryPeriod(year, month), canManage, rows, totals };
  },

  /** Reja qo‘yadi yoki yangilaydi; 0 kiritilsa reja olib tashlanadi */
  async save(actor: AuthUser, input: SaveTargetInput, client: ClientInfo): Promise<TargetOverviewDto> {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!user) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'userId', message: 'Xodim topilmadi' }]);
    }

    const where = { userId_year_month_type: { userId: user.id, year: input.year, month: input.month, type: input.type } };
    if (input.targetValue === 0) {
      await prisma.salesTarget.deleteMany({ where: { userId: user.id, year: input.year, month: input.month, type: input.type } });
    } else {
      await prisma.salesTarget.upsert({
        where,
        update: { targetValue: input.targetValue },
        create: {
          userId: user.id,
          year: input.year,
          month: input.month,
          type: input.type,
          targetValue: input.targetValue,
          createdById: actor.id,
        },
      });
    }

    await auditService.record({
      userId: actor.id,
      action: 'target.updated',
      entityType: 'target',
      entityId: user.id,
      metadata: {
        manager: `${user.firstName} ${user.lastName}`,
        period: formatSalaryPeriod(input.year, input.month),
        type: input.type,
        targetValue: input.targetValue,
      },
      ...client,
    });

    return this.overview(actor, { year: input.year, month: input.month });
  },
};
