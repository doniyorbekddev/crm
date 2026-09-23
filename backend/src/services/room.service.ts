import { prisma } from '../config/database.js';
import type { Prisma, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { ConflictCheckInput, CreateRoomInput, RoomListQuery, UpdateRoomInput } from '../validators/room.validator.js';
import { auditService } from './audit.service.js';
import { branchFilter, getBranchAccess, resolveBranchId } from './branchAccess.js';
import { scheduleConflictService } from './scheduleConflict.service.js';
import type { ScheduleConflict } from './scheduleConflict.service.js';

const roomSelect = {
  id: true,
  branchId: true,
  key: true,
  name: true,
  capacity: true,
  equipment: true,
  note: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  groups: {
    where: { status: { in: ['PLANNED', 'ACTIVE'] as const } },
    select: { id: true, name: true, scheduleDays: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' as const },
  },
} satisfies Prisma.RoomSelect;

type RoomRecord = Prisma.RoomGetPayload<{ select: typeof roomSelect }>;

export interface RoomDto {
  id: string;
  key: string;
  name: string;
  capacity: number;
  equipment: string[];
  note: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  /** Shu xonada dars qiladigan faol guruhlar — band qilish jadvali uchun */
  groups: Array<{ id: string; name: string; scheduleDays: WeekDay[]; startTime: string; endTime: string }>;
}

function toDto(record: RoomRecord): RoomDto {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    capacity: record.capacity,
    equipment: record.equipment,
    note: record.note,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    groups: record.groups,
  };
}

export const roomService = {
  async list(actor: AuthUser, query: RoomListQuery): Promise<RoomDto[]> {
    const access = await getBranchAccess(actor);
    const rows = await prisma.room.findMany({
      where: { ...branchFilter(access), ...(query.includeInactive ? {} : { isActive: true }) },
      select: roomSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  },

  async create(actor: AuthUser, input: CreateRoomInput, client: ClientInfo): Promise<RoomDto> {
    const branchId = resolveBranchId(await getBranchAccess(actor));
    const existing = await prisma.room.findFirst({ where: { branchId, key: input.key }, select: { id: true } });
    if (existing) {
      throw AppError.conflict('Bu kalit bilan xona allaqachon mavjud');
    }

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: {
          branchId,
          key: input.key,
          name: input.name,
          capacity: input.capacity,
          equipment: input.equipment,
          note: input.note ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
        select: roomSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'room.created',
        entityType: 'room',
        entityId: created.id,
        metadata: { key: created.key, name: created.name, capacity: created.capacity },
        ...client,
      });
      return created;
    });

    return toDto(room);
  },

  async update(actor: AuthUser, id: string, input: UpdateRoomInput, client: ClientInfo): Promise<RoomDto> {
    const access = await getBranchAccess(actor);
    const current = await prisma.room.findFirst({
      where: { id, ...branchFilter(access) },
      select: { id: true, name: true, capacity: true, isActive: true, _count: { select: { groups: true } } },
    });
    if (!current) {
      throw AppError.notFound('Xona topilmadi');
    }
    if (input.isActive === false && current._count.groups > 0) {
      throw AppError.unprocessable('Bu xonaga guruhlar biriktirilgan — avval ularni boshqa xonaga ko‘chiring');
    }

    const room = await prisma.$transaction(async (tx) => {
      const saved = await tx.room.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
          ...(input.equipment === undefined ? {} : { equipment: input.equipment }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        },
        select: roomSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'room.updated',
        entityType: 'room',
        entityId: id,
        metadata: { nameFrom: current.name, nameTo: saved.name, capacityFrom: current.capacity, capacityTo: saved.capacity },
        ...client,
      });
      return saved;
    });

    return toDto(room);
  },

  /** Saqlashdan oldin tekshirish — forma real vaqtda ogohlantirish ko‘rsatadi */
  async checkConflicts(actor: AuthUser, input: ConflictCheckInput): Promise<{ conflicts: ScheduleConflict[] }> {
    const access = await getBranchAccess(actor);
    const conflicts = await scheduleConflictService.find({
      groupId: input.groupId ?? null,
      branchId: access.branchId,
      roomId: input.roomId ?? null,
      teacherId: input.teacherId ?? null,
      scheduleDays: input.scheduleDays,
      startTime: input.startTime,
      endTime: input.endTime,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    });
    return { conflicts };
  },
};
