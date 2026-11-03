import { prisma } from '../../config/database.js';
import type { EmploymentChangeType, PositionEmploymentType, Prisma, PrismaClient, TaskPriority } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { DepartmentSaveInput, PositionUpdateInput, ResponsibilityInput } from '../../validators/org.validator.js';
import { auditService } from '../audit.service.js';
import { branchFilter, getBranchAccess, resolveBranchId } from '../branchAccess.js';
import { ensureOrgCatalog, TEACHER_POSITION_KEY } from './catalogDefaults.js';
import { personSelect, staffRoleWhere, toDateOnly } from './common.js';

export { DEFAULT_DEPARTMENTS, ensureOrgCatalog, positionTitle, TEACHER_POSITION_KEY } from './catalogDefaults.js';
import type { Person } from './common.js';

/**
 * Tuzilma katalogi (texnik spetsifikatsiya §5.2–5.6, §5.19): bo'limlar, lavozimlar, mas'uliyatlar, karyera yo'li
 * va ish tarixi.
 *
 * Lavozim katalogi mavjud lavozim turlari (`EmployeePosition` + o'qituvchi) ustiga quriladi — KPI va maosh qoidalari
 * avvalgidek lavozim turiga bog'liq, katalog esa uning tavsifi, mas'uliyatlari, sinov muddati va karyera yo'lini saqlaydi.
 * Standart bo'lim va lavozimlar (ORG hujjatidagi mas'uliyatlar bilan) faqat **yo'q bo'lsa** yaratiladi —
 * markaz o'zgartirgan matnga tegilmaydi.
 */

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------- bo'limlar

export interface DepartmentDto {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  head: Person | null;
  monthlyExpenseLimit: number | null;
  isActive: boolean;
  sortOrder: number;
  employees: number;
  positions: number;
}

const departmentSelect = {
  id: true,
  name: true,
  description: true,
  parentId: true,
  monthlyExpenseLimit: true,
  isActive: true,
  sortOrder: true,
  branchId: true,
  head: personSelect,
  _count: { select: { employees: { where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } } }, positions: true } },
} satisfies Prisma.DepartmentSelect;

function toDepartmentDto(row: Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>): DepartmentDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    head: row.head,
    monthlyExpenseLimit: row.monthlyExpenseLimit?.toNumber() ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    employees: row._count.employees,
    positions: row._count.positions,
  };
}

/** Bo'lim nomi bo'yicha topadi yoki yaratadi (xodim formasidagi erkin matn uchun — eski mijozlar bilan moslik) */
export async function departmentByName(db: Db, branchId: string, name: string): Promise<{ id: string; name: string }> {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const found = await db.department.findFirst({ where: { branchId, name: { equals: trimmed, mode: 'insensitive' } }, select: { id: true, name: true } });
  if (found) return found;
  return db.department.create({ data: { name: trimmed, branchId, sortOrder: 100 }, select: { id: true, name: true } });
}

// ---------------------------------------------------------------- lavozimlar

export interface ResponsibilityDto {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  expectedResult: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface PositionDto {
  id: string;
  key: string;
  title: string;
  department: { id: string; name: string } | null;
  description: string | null;
  employmentType: PositionEmploymentType;
  probationMonths: number;
  nextPosition: { id: string; key: string; title: string } | null;
  careerRequirements: string | null;
  minimumKpiScore: number | null;
  minimumMonths: number | null;
  isActive: boolean;
  /** Shu lavozimdagi faol xodimlar (o'qituvchilar uchun — faol o'qituvchilar) */
  holders: number;
  responsibilities: ResponsibilityDto[];
}

const positionSelect = {
  id: true,
  key: true,
  title: true,
  description: true,
  employmentType: true,
  probationMonths: true,
  careerRequirements: true,
  minimumKpiScore: true,
  minimumMonths: true,
  isActive: true,
  sortOrder: true,
  department: { select: { id: true, name: true } },
  nextPosition: { select: { id: true, key: true, title: true } },
  responsibilities: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, description: true, priority: true, expectedResult: true, sortOrder: true, isActive: true },
  },
} satisfies Prisma.PositionSelect;

type PositionRow = Prisma.PositionGetPayload<{ select: typeof positionSelect }>;

function toPositionDto(row: PositionRow, holders: Map<string, number>): PositionDto {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    department: row.department,
    description: row.description,
    employmentType: row.employmentType,
    probationMonths: row.probationMonths,
    nextPosition: row.nextPosition,
    careerRequirements: row.careerRequirements,
    minimumKpiScore: row.minimumKpiScore,
    minimumMonths: row.minimumMonths,
    isActive: row.isActive,
    holders: holders.get(row.key) ?? 0,
    responsibilities: row.responsibilities,
  };
}

async function holderCounts(branch: { branchId?: string }): Promise<Map<string, number>> {
  const [employees, teachers] = await Promise.all([
    prisma.employee.groupBy({ by: ['position'], where: { ...branch, status: { in: ['ACTIVE', 'ON_LEAVE'] } }, _count: { _all: true } }),
    prisma.teacherProfile.count({ where: { employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] }, user: { deletedAt: null, ...branch } } }),
  ]);
  return new Map<string, number>([...employees.map((row) => [row.position, row._count._all] as [string, number]), [TEACHER_POSITION_KEY, teachers]]);
}

// ---------------------------------------------------------------- ish tarixi

export interface EmploymentHistoryDto {
  id: string;
  type: EmploymentChangeType;
  positionKey: string;
  positionTitle: string;
  department: string | null;
  effectiveDate: string;
  changeReason: string | null;
  approvedBy: Person | null;
  createdBy: Person | null;
  createdAt: string;
}

/** Ish tarixiga yozuv — xodim kartasi o'zgargan tranzaksiyaning ichida */
export async function recordEmployment(
  tx: Prisma.TransactionClient,
  entry: {
    employeeId?: string | null;
    userId?: string | null;
    type: EmploymentChangeType;
    positionKey: string;
    positionTitle: string;
    department: string | null;
    effectiveDate: Date;
    changeReason?: string | null;
    approvedById?: string | null;
    createdById: string | null;
  },
): Promise<void> {
  await tx.employmentHistory.create({
    data: {
      employeeId: entry.employeeId ?? null,
      userId: entry.userId ?? null,
      type: entry.type,
      positionKey: entry.positionKey,
      positionTitle: entry.positionTitle,
      department: entry.department,
      effectiveDate: entry.effectiveDate,
      changeReason: entry.changeReason ?? null,
      approvedById: entry.approvedById ?? null,
      createdById: entry.createdById,
    },
  });
}

export const orgCatalogService = {
  async departments(actor: AuthUser, includeInactive = false): Promise<DepartmentDto[]> {
    await ensureOrgCatalog(prisma);
    const access = await getBranchAccess(actor);
    const rows = await prisma.department.findMany({
      where: { ...branchFilter(access), ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: departmentSelect,
    });
    return rows.map(toDepartmentDto);
  },

  async saveDepartment(actor: AuthUser, id: string | null, input: DepartmentSaveInput, client: ClientInfo): Promise<DepartmentDto> {
    const access = await getBranchAccess(actor);
    const branchId = id ? (await this.findDepartment(access, id)).branchId : resolveBranchId(access);
    if (input.headUserId) {
      const head = await prisma.user.findFirst({ where: { id: input.headUserId, deletedAt: null, status: 'ACTIVE', role: staffRoleWhere }, select: { id: true } });
      if (!head) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'headUserId', message: 'Xodim topilmadi' }]);
    }
    if (input.parentId) {
      if (input.parentId === id) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'parentId', message: 'Bo‘lim o‘ziga bo‘ysunmaydi' }]);
      await this.findDepartment(access, input.parentId);
    }
    const before = id ? await prisma.department.findUniqueOrThrow({ where: { id }, select: { name: true, monthlyExpenseLimit: true, headUserId: true } }) : null;
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const data = {
          name: input.name,
          description: input.description ?? null,
          parentId: input.parentId ?? null,
          headUserId: input.headUserId ?? null,
          monthlyExpenseLimit: input.monthlyExpenseLimit ?? null,
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        };
        const row = id ? await tx.department.update({ where: { id }, data, select: { id: true } }) : await tx.department.create({ data: { ...data, branchId }, select: { id: true } });
        // Nom o'zgarsa — xodim kartasidagi bo'lim matni ham (moslik uchun saqlanadi) yangilanadi
        if (before && before.name !== input.name) await tx.employee.updateMany({ where: { departmentId: row.id }, data: { department: input.name } });
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: id ? 'department.updated' : 'department.created',
          entityType: 'department',
          entityId: row.id,
          ...(before ? { before: { name: before.name, monthlyExpenseLimit: before.monthlyExpenseLimit?.toNumber() ?? null, headUserId: before.headUserId } } : {}),
          after: { name: input.name, monthlyExpenseLimit: input.monthlyExpenseLimit ?? null, headUserId: input.headUserId ?? null },
          ...client,
        });
        return row.id;
      });
      return toDepartmentDto(await prisma.department.findUniqueOrThrow({ where: { id: saved }, select: departmentSelect }));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
        throw AppError.conflict('Bu nomdagi bo‘lim bor', [{ field: 'name', message: 'Nom band' }]);
      }
      throw error;
    }
  },

  async findDepartment(access: Awaited<ReturnType<typeof getBranchAccess>>, id: string): Promise<{ id: string; branchId: string }> {
    const row = await prisma.department.findFirst({ where: { id, ...branchFilter(access) }, select: { id: true, branchId: true } });
    if (!row) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'departmentId', message: 'Bo‘lim topilmadi' }]);
    return row;
  },

  async positions(actor: AuthUser): Promise<PositionDto[]> {
    await ensureOrgCatalog(prisma);
    const access = await getBranchAccess(actor);
    const [rows, holders] = await Promise.all([
      prisma.position.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], select: positionSelect }),
      holderCounts(branchFilter(access)),
    ]);
    return rows.map((row) => toPositionDto(row, holders));
  },

  async position(actor: AuthUser, key: string): Promise<PositionDto> {
    await ensureOrgCatalog(prisma);
    const row = await prisma.position.findUnique({ where: { key }, select: positionSelect });
    if (!row) throw AppError.notFound('Lavozim topilmadi');
    return toPositionDto(row, await holderCounts(branchFilter(await getBranchAccess(actor))));
  },

  async updatePosition(actor: AuthUser, key: string, input: PositionUpdateInput, client: ClientInfo): Promise<PositionDto> {
    const access = await getBranchAccess(actor);
    const before = await prisma.position.findUnique({ where: { key }, select: { id: true, title: true, nextPositionId: true, minimumKpiScore: true, departmentId: true } });
    if (!before) throw AppError.notFound('Lavozim topilmadi');
    if (input.departmentId) await this.findDepartment(access, input.departmentId);
    let nextPositionId: string | null | undefined;
    if (input.nextPositionKey !== undefined) {
      if (input.nextPositionKey === key) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'nextPositionKey', message: 'Keyingi lavozim o‘zi bo‘lmaydi' }]);
      nextPositionId = input.nextPositionKey ? ((await prisma.position.findUnique({ where: { key: input.nextPositionKey }, select: { id: true } }))?.id ?? null) : null;
      if (input.nextPositionKey && !nextPositionId) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'nextPositionKey', message: 'Lavozim topilmadi' }]);
    }
    await prisma.$transaction(async (tx) => {
      await tx.position.update({
        where: { key },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.employmentType === undefined ? {} : { employmentType: input.employmentType }),
          ...(input.probationMonths === undefined ? {} : { probationMonths: input.probationMonths }),
          ...(nextPositionId === undefined ? {} : { nextPositionId }),
          ...(input.careerRequirements === undefined ? {} : { careerRequirements: input.careerRequirements }),
          ...(input.minimumKpiScore === undefined ? {} : { minimumKpiScore: input.minimumKpiScore }),
          ...(input.minimumMonths === undefined ? {} : { minimumMonths: input.minimumMonths }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'position.updated',
        entityType: 'position',
        entityId: before.id,
        before: { title: before.title, departmentId: before.departmentId, nextPositionId: before.nextPositionId, minimumKpiScore: before.minimumKpiScore },
        after: { ...input },
        ...client,
      });
    });
    return this.position(actor, key);
  },

  async saveResponsibility(actor: AuthUser, key: string, id: string | null, input: ResponsibilityInput, client: ClientInfo): Promise<PositionDto> {
    const position = await prisma.position.findUnique({ where: { key }, select: { id: true } });
    if (!position) throw AppError.notFound('Lavozim topilmadi');
    if (id) {
      const found = await prisma.positionResponsibility.count({ where: { id, positionId: position.id } });
      if (found === 0) throw AppError.notFound('Mas’uliyat topilmadi');
    }
    await prisma.$transaction(async (tx) => {
      const data = {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        expectedResult: input.expectedResult ?? null,
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      };
      const row = id
        ? await tx.positionResponsibility.update({ where: { id }, data, select: { id: true } })
        : await tx.positionResponsibility.create({ data: { ...data, positionId: position.id, sortOrder: input.sortOrder ?? (await tx.positionResponsibility.count({ where: { positionId: position.id } })) }, select: { id: true } });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: id ? 'position.responsibility_updated' : 'position.responsibility_added', entityType: 'position', entityId: position.id, metadata: { responsibilityId: row.id, title: input.title, isActive: input.isActive ?? true }, ...client });
    });
    return this.position(actor, key);
  },

  /** Xodim yoki o'qituvchining ish tarixi */
  async history(actor: AuthUser, subject: { employeeId?: string; userId?: string }): Promise<EmploymentHistoryDto[]> {
    const access = await getBranchAccess(actor);
    if (subject.employeeId) {
      const employee = await prisma.employee.count({ where: { id: subject.employeeId, ...branchFilter(access) } });
      if (employee === 0) throw AppError.notFound('Xodim topilmadi');
    }
    const rows = await prisma.employmentHistory.findMany({
      where: subject.employeeId ? { employeeId: subject.employeeId } : { userId: subject.userId ?? '' },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, type: true, positionKey: true, positionTitle: true, department: true, effectiveDate: true, changeReason: true, createdAt: true, approvedBy: personSelect, createdBy: personSelect },
    });
    return rows.map((row) => ({ ...row, effectiveDate: toDateOnly(row.effectiveDate), createdAt: row.createdAt.toISOString() }));
  },
};
