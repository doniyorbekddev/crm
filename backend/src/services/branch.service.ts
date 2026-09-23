import { MAIN_BRANCH_ID } from '../config/branch.js';
import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { BranchListQuery, CreateBranchInput, UpdateBranchInput } from '../validators/branch.validator.js';
import { auditService } from './audit.service.js';
import { getBranchAccess } from './branchAccess.js';

const branchSelect = {
  id: true,
  key: true,
  name: true,
  address: true,
  phone: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  _count: {
    select: {
      users: { where: { deletedAt: null } },
      students: { where: { deletedAt: null } },
      groups: true,
    },
  },
} satisfies Prisma.BranchSelect;

type BranchRecord = Prisma.BranchGetPayload<{ select: typeof branchSelect }>;

export interface BranchDto {
  id: string;
  key: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  /** Asosiy filialni o‘chirib bo‘lmaydi — u standart qiymat sifatida ishlatiladi */
  isMain: boolean;
  counts: { users: number; students: number; groups: number };
}

function toDto(record: BranchRecord): BranchDto {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    address: record.address,
    phone: record.phone,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    isMain: record.id === MAIN_BRANCH_ID,
    counts: { users: record._count.users, students: record._count.students, groups: record._count.groups },
  };
}

export const branchService = {
  /**
   * Xodim ko‘ra oladigan filiallar: `branch.view_all` bo‘lsa hammasi, aks holda faqat o‘ziniki.
   * Shu ro‘yxat frontend'dagi filial tanlash paneliga asos bo‘ladi (bitta bo‘lsa panel ko‘rinmaydi).
   */
  async list(actor: AuthUser, query: BranchListQuery): Promise<BranchDto[]> {
    const access = await getBranchAccess(actor);
    const where: Prisma.BranchWhereInput = {
      ...(access.canViewAll ? {} : { id: access.branchId }),
      ...(query.includeInactive ? {} : { isActive: true }),
    };
    const rows = await prisma.branch.findMany({
      where,
      select: branchSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  },

  async create(actor: AuthUser, input: CreateBranchInput, client: ClientInfo): Promise<BranchDto> {
    const existing = await prisma.branch.findUnique({ where: { key: input.key }, select: { id: true } });
    if (existing) {
      throw AppError.conflict('Bu kalit bilan filial allaqachon mavjud');
    }

    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          key: input.key,
          name: input.name,
          address: input.address ?? null,
          phone: input.phone ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
        select: branchSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'branch.created',
        entityType: 'branch',
        entityId: created.id,
        metadata: { key: created.key, name: created.name },
        ...client,
      });
      return created;
    });

    return toDto(branch);
  },

  async update(actor: AuthUser, id: string, input: UpdateBranchInput, client: ClientInfo): Promise<BranchDto> {
    const current = await prisma.branch.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } });
    if (!current) {
      throw AppError.notFound('Filial topilmadi');
    }
    if (id === MAIN_BRANCH_ID && input.isActive === false) {
      throw AppError.unprocessable('Asosiy filialni o‘chirib bo‘lmaydi');
    }

    const branch = await prisma.$transaction(async (tx) => {
      const saved = await tx.branch.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        },
        select: branchSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'branch.updated',
        entityType: 'branch',
        entityId: id,
        metadata: { nameFrom: current.name, nameTo: saved.name, activeFrom: current.isActive, activeTo: saved.isActive },
        ...client,
      });
      return saved;
    });

    return toDto(branch);
  },
};
