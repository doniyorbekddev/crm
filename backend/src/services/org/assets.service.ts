import { prisma } from '../../config/database.js';
import type { AssetEventType, AssetStatus, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { AssetCreateInput, AssetEventInput, AssetListQuery, AssetUpdateInput } from '../../validators/org.validator.js';
import { auditService } from '../audit.service.js';
import { branchFilter, getBranchAccess, resolveBranchId } from '../branchAccess.js';
import type { BranchAccess } from '../branchAccess.js';
import { fullName, personSelect, staffRoleWhere, toDateOnly } from './common.js';
import type { Person } from './common.js';

/**
 * Aktivlar reyestri (ORG §11): markaz jihozlari — kompyuter, proyektor, mebel…
 *
 * Sotiladigan tovarlar (ombor) alohida modulda qoladi: aktiv sotilmaydi, u biriktiriladi, ko'chiriladi,
 * ta'mirlanadi va hisobdan chiqariladi. Har o'zgarish o'zgarmas tarixga (`asset_events`) yoziladi —
 * "bu proyektor kimda edi, necha marta ta'mirlandi?" savoliga javob doim bor.
 */

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  IN_USE: 'Foydalanishda',
  IN_STORAGE: 'Omborda',
  UNDER_REPAIR: 'Ta’mirda',
  WRITTEN_OFF: 'Hisobdan chiqarilgan',
  LOST: 'Yo‘qolgan',
};

/** Hali markaz balansida (offboardingda "qaytarilishi kerak" deb sanaladi) */
export const HELD_ASSET_STATUSES: readonly AssetStatus[] = ['IN_USE', 'IN_STORAGE', 'UNDER_REPAIR'];

const assetSelect = {
  id: true,
  inventoryNumber: true,
  name: true,
  category: true,
  serialNumber: true,
  purchaseDate: true,
  purchaseCost: true,
  status: true,
  condition: true,
  location: true,
  note: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
  room: { select: { id: true, name: true } },
  responsible: personSelect,
} satisfies Prisma.AssetSelect;

type AssetRow = Prisma.AssetGetPayload<{ select: typeof assetSelect }>;

export interface AssetDto {
  id: string;
  inventoryNumber: string;
  name: string;
  category: string;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  status: AssetStatus;
  condition: string | null;
  room: { id: string; name: string } | null;
  location: string | null;
  responsible: Person | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetEventDto {
  id: string;
  type: AssetEventType;
  fromValue: string | null;
  toValue: string | null;
  cost: number | null;
  note: string | null;
  actor: Person | null;
  occurredAt: string;
}

export interface AssetDetailDto extends AssetDto {
  events: AssetEventDto[];
  /** Jami ta'mirlash xarajati */
  repairCost: number;
  repairCount: number;
}

function toDto(row: AssetRow): AssetDto {
  return {
    id: row.id,
    inventoryNumber: row.inventoryNumber,
    name: row.name,
    category: row.category,
    serialNumber: row.serialNumber,
    purchaseDate: row.purchaseDate ? toDateOnly(row.purchaseDate) : null,
    purchaseCost: row.purchaseCost?.toNumber() ?? null,
    status: row.status,
    condition: row.condition,
    room: row.room,
    location: row.location,
    responsible: row.responsible,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function placeOf(row: { room: { name: string } | null; location: string | null }): string | null {
  return row.room?.name ?? row.location ?? null;
}

async function findOrFail(access: BranchAccess, id: string): Promise<AssetRow> {
  const row = await prisma.asset.findFirst({ where: { id, ...branchFilter(access) }, select: assetSelect });
  if (!row) throw AppError.notFound('Aktiv topilmadi');
  return row;
}

async function resolveResponsible(access: BranchAccess, userId: string): Promise<Person> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, status: 'ACTIVE', role: staffRoleWhere, ...(access.canViewAll ? {} : { branchId: access.branchId }) },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!user) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'responsibleId', message: 'Xodim topilmadi' }]);
  return user;
}

async function resolveRoom(branchId: string, roomId: string): Promise<{ id: string; name: string }> {
  const room = await prisma.room.findFirst({ where: { id: roomId, branchId }, select: { id: true, name: true } });
  if (!room) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'roomId', message: 'Xona topilmadi' }]);
  return room;
}

function duplicateNumber(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002';
}

export const assetService = {
  async list(actor: AuthUser, query: AssetListQuery): Promise<{ items: AssetDto[]; total: number; summary: { count: number; value: number; byStatus: Record<AssetStatus, number> }; categories: string[] }> {
    const access = await getBranchAccess(actor);
    const base: Prisma.AssetWhereInput = branchFilter(access);
    const filters: Prisma.AssetWhereInput[] = [base];
    if (query.status) filters.push({ status: query.status });
    if (query.category) filters.push({ category: query.category });
    if (query.responsibleId) filters.push({ responsibleId: query.responsibleId });
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { inventoryNumber: { contains: query.search, mode: 'insensitive' } },
          { serialNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.AssetWhereInput = { AND: filters };
    const [rows, total, grouped, value, categories] = await Promise.all([
      prisma.asset.findMany({ where, orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit, select: assetSelect }),
      prisma.asset.count({ where }),
      prisma.asset.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      // Balans qiymati — hisobdan chiqarilgan va yo'qolganlarsiz
      prisma.asset.aggregate({ where: { ...base, status: { in: [...HELD_ASSET_STATUSES] } }, _sum: { purchaseCost: true }, _count: { _all: true } }),
      prisma.asset.findMany({ where: base, distinct: ['category'], orderBy: { category: 'asc' }, select: { category: true } }),
    ]);
    const byStatus: Record<AssetStatus, number> = { IN_USE: 0, IN_STORAGE: 0, UNDER_REPAIR: 0, WRITTEN_OFF: 0, LOST: 0 };
    for (const row of grouped) byStatus[row.status] = row._count._all;
    return {
      items: rows.map(toDto),
      total,
      summary: { count: value._count._all, value: value._sum.purchaseCost?.toNumber() ?? 0, byStatus },
      categories: categories.map((row) => row.category),
    };
  },

  async getById(actor: AuthUser, id: string): Promise<AssetDetailDto> {
    const row = await findOrFail(await getBranchAccess(actor), id);
    const events = await prisma.assetEvent.findMany({
      where: { assetId: id },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, type: true, fromValue: true, toValue: true, cost: true, note: true, occurredAt: true, actor: personSelect },
    });
    const repairs = events.filter((event) => event.type === 'REPAIR');
    return {
      ...toDto(row),
      events: events.map((event) => ({ ...event, cost: event.cost?.toNumber() ?? null, occurredAt: event.occurredAt.toISOString() })),
      repairCost: repairs.reduce((sum, event) => sum + (event.cost?.toNumber() ?? 0), 0),
      repairCount: repairs.length,
    };
  },

  async create(actor: AuthUser, input: AssetCreateInput, client: ClientInfo): Promise<AssetDetailDto> {
    const access = await getBranchAccess(actor);
    const branchId = resolveBranchId(access);
    const responsible = input.responsibleId ? await resolveResponsible(access, input.responsibleId) : null;
    const room = input.roomId ? await resolveRoom(branchId, input.roomId) : null;
    try {
      const id = await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            inventoryNumber: input.inventoryNumber,
            name: input.name,
            category: input.category,
            serialNumber: input.serialNumber ?? null,
            purchaseDate: input.purchaseDate ?? null,
            purchaseCost: input.purchaseCost ?? null,
            status: input.status,
            condition: input.condition ?? null,
            roomId: room?.id ?? null,
            location: input.location ?? null,
            responsibleId: responsible?.id ?? null,
            note: input.note ?? null,
            createdById: actor.id,
            branchId,
          },
          select: { id: true },
        });
        await tx.assetEvent.create({
          data: { assetId: asset.id, type: 'CREATED', toValue: responsible ? fullName(responsible) : null, note: input.note ?? null, actorId: actor.id },
        });
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'asset.created',
          entityType: 'asset',
          entityId: asset.id,
          metadata: { inventoryNumber: input.inventoryNumber, name: input.name, purchaseCost: input.purchaseCost ?? null },
          ...client,
        });
        return asset.id;
      });
      return this.getById(actor, id);
    } catch (error) {
      if (duplicateNumber(error)) throw AppError.conflict('Bu inventar raqami band', [{ field: 'inventoryNumber', message: 'Raqam band' }]);
      throw error;
    }
  },

  /** Ma'lumotlarni tahrirlash (nom, turkum, xarid). Mas'ul, joy va holat — alohida harakat bilan (tarixga yoziladi) */
  async update(actor: AuthUser, id: string, input: AssetUpdateInput, client: ClientInfo): Promise<AssetDetailDto> {
    const before = await findOrFail(await getBranchAccess(actor), id);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.asset.update({
          where: { id },
          data: {
            ...(input.inventoryNumber === undefined ? {} : { inventoryNumber: input.inventoryNumber }),
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.category === undefined ? {} : { category: input.category }),
            ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
            ...(input.purchaseDate === undefined ? {} : { purchaseDate: input.purchaseDate }),
            ...(input.purchaseCost === undefined ? {} : { purchaseCost: input.purchaseCost }),
            ...(input.condition === undefined ? {} : { condition: input.condition }),
            ...(input.note === undefined ? {} : { note: input.note }),
          },
        });
        await tx.assetEvent.create({ data: { assetId: id, type: 'UPDATED', actorId: actor.id } });
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'asset.updated',
          entityType: 'asset',
          entityId: id,
          before: { inventoryNumber: before.inventoryNumber, name: before.name, category: before.category, purchaseCost: before.purchaseCost?.toNumber() ?? null },
          after: { ...input, purchaseDate: input.purchaseDate === undefined ? undefined : input.purchaseDate ? toDateOnly(input.purchaseDate) : null },
          ...client,
        });
      });
    } catch (error) {
      if (duplicateNumber(error)) throw AppError.conflict('Bu inventar raqami band', [{ field: 'inventoryNumber', message: 'Raqam band' }]);
      throw error;
    }
    return this.getById(actor, id);
  },

  /**
   * Harakat: mas'ulga biriktirish, ko'chirish, holatni o'zgartirish (hisobdan chiqarish ham), ta'mirlash yozuvi.
   * Hisobdan chiqarilgan aktiv faqat "holat" harakati bilan qaytariladi.
   */
  async record(actor: AuthUser, id: string, input: AssetEventInput, client: ClientInfo): Promise<AssetDetailDto> {
    const access = await getBranchAccess(actor);
    const asset = await findOrFail(access, id);
    const closed = asset.status === 'WRITTEN_OFF' || asset.status === 'LOST';
    if (closed && input.type !== 'STATUS_CHANGED') throw AppError.unprocessable('Hisobdan chiqarilgan yoki yo‘qolgan aktiv bilan amal bajarilmaydi');

    const data: Prisma.AssetUpdateInput = {};
    let fromValue: string | null = null;
    let toValue: string | null = null;
    if (input.type === 'ASSIGNED') {
      const responsible = input.responsibleId ? await resolveResponsible(access, input.responsibleId) : null;
      if ((responsible?.id ?? null) === (asset.responsible?.id ?? null)) throw AppError.unprocessable('Aktiv allaqachon shu xodimda');
      data.responsible = responsible ? { connect: { id: responsible.id } } : { disconnect: true };
      if (input.condition) data.condition = input.condition;
      fromValue = asset.responsible ? fullName(asset.responsible) : null;
      toValue = responsible ? fullName(responsible) : null;
    } else if (input.type === 'MOVED') {
      const room = input.roomId ? await resolveRoom(asset.branchId, input.roomId) : null;
      data.room = room ? { connect: { id: room.id } } : { disconnect: true };
      data.location = input.location ?? null;
      fromValue = placeOf(asset);
      toValue = room?.name ?? input.location ?? null;
      if (fromValue === toValue) throw AppError.unprocessable('Aktiv allaqachon shu joyda');
    } else if (input.type === 'STATUS_CHANGED') {
      if (input.status === asset.status) throw AppError.unprocessable('Aktiv allaqachon shu holatda');
      data.status = input.status;
      fromValue = ASSET_STATUS_LABELS[asset.status];
      toValue = ASSET_STATUS_LABELS[input.status];
    }
    // REPAIR: holat o'zgarmaydi (kerak bo'lsa alohida "Ta'mirda" holati qo'yiladi) — faqat yozuv va xarajat

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) await tx.asset.update({ where: { id }, data });
      await tx.assetEvent.create({
        data: {
          assetId: id,
          type: input.type,
          fromValue,
          toValue,
          cost: input.type === 'REPAIR' ? (input.cost ?? null) : null,
          note: input.type === 'ASSIGNED' && input.condition ? `Holati: ${input.condition}${input.note ? `. ${input.note}` : ''}` : (input.note ?? null),
          occurredAt: input.occurredAt ?? new Date(),
          actorId: actor.id,
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: `asset.${input.type.toLowerCase()}`,
        entityType: 'asset',
        entityId: id,
        metadata: { inventoryNumber: asset.inventoryNumber, from: fromValue, to: toValue, ...(input.type === 'REPAIR' ? { cost: input.cost ?? null } : {}), note: input.note ?? null },
        ...client,
      });
    });
    return this.getById(actor, id);
  },

  /** Xodimdagi (hali balansdagi) aktivlar — offboardingda "jihozlar qaytarildi" tekshiruvi uchun */
  async heldBy(userId: string): Promise<Array<{ id: string; inventoryNumber: string; name: string }>> {
    return prisma.asset.findMany({
      where: { responsibleId: userId, status: { in: [...HELD_ASSET_STATUSES] } },
      orderBy: { inventoryNumber: 'asc' },
      select: { id: true, inventoryNumber: true, name: true },
    });
  },
};
