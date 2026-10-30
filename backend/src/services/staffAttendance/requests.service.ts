import { prisma } from '../../config/database.js';
import type { LeaveStatus, Prisma, StaffPermissionType } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { businessDateString } from '../../utils/dates.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { auditService } from '../audit.service.js';
import { branchScopeOf } from '../branchScope.js';
import { notificationService } from '../notification.service.js';
import { attendanceManagers, fullName, notSubject, toDateString } from './common.js';
import { findSubject } from './planning.js';

/**
 * Ruxsat so'rovlari: xodim o'zi yuboradi (kelmaslik, kech kelish, erta ketish), rahbar tasdiqlaydi yoki rad etadi.
 * Tasdiqlangan so'rov davomatda "sababli" bo'ladi. So'rov o'chirilmaydi — bekor qilinadi yoki rad etiladi.
 * Rahbar o'z so'rovini o'zi tasdiqlay olmaydi.
 */

export const PERMISSION_TYPE_LABELS: Record<StaffPermissionType, string> = {
  ABSENCE: 'Kelmaslik',
  LATE_ARRIVAL: 'Kech kelish',
  EARLY_LEAVE: 'Erta ketish',
};

export interface PermissionRequestInput {
  type: StaffPermissionType;
  startDate: string;
  endDate?: string | undefined;
  time?: string | undefined;
  reason: string;
}

export interface PermissionRequestDto {
  id: string;
  userId: string;
  userName: string;
  type: StaffPermissionType;
  startDate: string;
  endDate: string;
  time: string | null;
  reason: string;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

const requestSelect = {
  id: true,
  userId: true,
  type: true,
  startDate: true,
  endDate: true,
  time: true,
  reason: true,
  status: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  user: { select: { firstName: true, lastName: true } },
  decidedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.StaffPermissionRequestSelect;

function toDto(record: Prisma.StaffPermissionRequestGetPayload<{ select: typeof requestSelect }>): PermissionRequestDto {
  return {
    id: record.id,
    userId: record.userId,
    userName: fullName(record.user),
    type: record.type,
    startDate: toDateString(record.startDate),
    endDate: toDateString(record.endDate),
    time: record.time,
    reason: record.reason,
    status: record.status,
    decidedBy: record.decidedBy ? fullName(record.decidedBy) : null,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    decisionNote: record.decisionNote,
    createdAt: record.createdAt.toISOString(),
  };
}

const MAX_DAYS = 31;
/** O'tgan sanaga so'rov (masalan, kasal bo'lib qolgan kun) — shuncha kungacha */
const MAX_PAST_DAYS = 7;

function normalize(input: PermissionRequestInput, now: Date): { startDate: Date; endDate: Date; time: string | null } {
  const endDate = input.type === 'ABSENCE' ? (input.endDate ?? input.startDate) : input.startDate;
  if (endDate < input.startDate) throw AppError.unprocessable('Tugash sanasi boshlanishdan oldin bo‘lmasin', [{ field: 'endDate', message: 'Sana noto‘g‘ri' }]);
  const span = (Date.parse(endDate) - Date.parse(input.startDate)) / 86_400_000 + 1;
  if (span > MAX_DAYS) throw AppError.unprocessable(`Bir so‘rov ${MAX_DAYS} kundan oshmasin`, [{ field: 'endDate', message: 'Juda uzun' }]);
  const earliest = businessDateString(new Date(now.getTime() - MAX_PAST_DAYS * 86_400_000));
  if (input.startDate < earliest) {
    throw AppError.unprocessable(`So‘rov ${MAX_PAST_DAYS} kundan eski sanaga yuborilmaydi`, [{ field: 'startDate', message: 'Sana juda eski' }]);
  }
  if (input.type !== 'ABSENCE' && !input.time) throw AppError.unprocessable('Vaqtni kiriting', [{ field: 'time', message: 'Vaqtni kiriting' }]);
  return {
    startDate: new Date(`${input.startDate}T00:00:00Z`),
    endDate: new Date(`${endDate}T00:00:00Z`),
    time: input.type === 'ABSENCE' ? null : (input.time ?? null),
  };
}

function describe(input: { type: StaffPermissionType; startDate: string; endDate: string; time: string | null }): string {
  const dates = input.startDate === input.endDate ? input.startDate : `${input.startDate} — ${input.endDate}`;
  const time = input.type === 'LATE_ARRIVAL' ? `, ${input.time} gacha` : input.type === 'EARLY_LEAVE' ? `, ${input.time} dan` : '';
  return `${PERMISSION_TYPE_LABELS[input.type]}: ${dates}${time}`;
}

export const staffPermissionService = {
  async listMine(actor: AuthUser): Promise<PermissionRequestDto[]> {
    const records = await prisma.staffPermissionRequest.findMany({
      where: { userId: actor.id },
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return records.map(toDto);
  },

  async createMine(actor: AuthUser, input: PermissionRequestInput, client: ClientInfo, now: Date = new Date()): Promise<PermissionRequestDto> {
    const subject = await findSubject(actor.id);
    if (!subject) throw notSubject();
    const data = normalize(input, now);
    const overlap = await prisma.staffPermissionRequest.findFirst({
      where: { userId: subject.id, type: input.type, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: data.endDate }, endDate: { gte: data.startDate } },
      select: { id: true },
    });
    if (overlap) throw AppError.conflict('Shu sanalarga shunday so‘rov allaqachon bor', [{ field: 'startDate', message: 'Takroriy so‘rov' }]);

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.staffPermissionRequest.create({
        data: { userId: subject.id, type: input.type, ...data, reason: input.reason, requestedById: actor.id },
        select: requestSelect,
      });
      const dto = toDto(record);
      const managers = await attendanceManagers(subject.branchId, subject.id);
      await notificationService.createManyInTransaction(
        tx,
        managers.map((userId) => ({
          userId,
          type: 'STAFF_ATTENDANCE' as const,
          title: 'Yangi ruxsat so‘rovi',
          message: `📝 ${fullName(subject)}: ${describe(dto)}. Sabab: ${input.reason}`,
          actionUrl: '/staff-attendance?tab=requests',
          dedupeKey: `staff-request:${record.id}:${userId}`,
        })),
      );
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'staff_permission.requested',
        entityType: 'staffPermissionRequest',
        entityId: record.id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { type: input.type, startDate: dto.startDate, endDate: dto.endDate, time: dto.time },
      });
      return dto;
    });
    return created;
  },

  async cancelMine(actor: AuthUser, id: string, client: ClientInfo): Promise<PermissionRequestDto> {
    const record = await prisma.staffPermissionRequest.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!record || record.userId !== actor.id) throw AppError.notFound('So‘rov topilmadi');
    if (record.status !== 'PENDING') throw AppError.conflict('Faqat ko‘rib chiqilmagan so‘rovni bekor qilish mumkin');
    const updated = await prisma.staffPermissionRequest.update({ where: { id }, data: { status: 'CANCELLED' }, select: requestSelect });
    await auditService.record({ userId: actor.id, action: 'staff_permission.cancelled', entityType: 'staffPermissionRequest', entityId: id, ...client });
    return toDto(updated);
  },

  async list(actor: AuthUser, query: { status?: LeaveStatus | undefined; userId?: string | undefined }): Promise<PermissionRequestDto[]> {
    const scope = await branchScopeOf(actor);
    const records = await prisma.staffPermissionRequest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(scope.branchId ? { user: { branchId: scope.branchId } } : {}),
      },
      select: requestSelect,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      take: 200,
    });
    return records.map(toDto);
  },

  async decide(
    actor: AuthUser,
    id: string,
    input: { status: 'APPROVED' | 'REJECTED'; note?: string | undefined },
    client: ClientInfo,
    now: Date = new Date(),
  ): Promise<PermissionRequestDto> {
    const scope = await branchScopeOf(actor);
    const record = await prisma.staffPermissionRequest.findUnique({ where: { id }, select: { userId: true, status: true, user: { select: { branchId: true } } } });
    if (!record || (scope.branchId && record.user.branchId !== scope.branchId)) throw AppError.notFound('So‘rov topilmadi');
    if (record.userId === actor.id) throw AppError.forbidden('O‘z so‘rovingizni o‘zingiz tasdiqlay olmaysiz');
    if (record.status !== 'PENDING') throw AppError.conflict('So‘rov allaqachon ko‘rib chiqilgan');

    return prisma.$transaction(async (tx) => {
      // Shartli yangilash: ikki rahbar bir vaqtda hal qilsa, ikkinchisi xato oladi
      const changed = await tx.staffPermissionRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: input.status, decidedById: actor.id, decidedAt: now, decisionNote: input.note ?? null },
      });
      if (changed.count !== 1) throw AppError.conflict('So‘rov allaqachon ko‘rib chiqilgan');
      const dto = toDto(await tx.staffPermissionRequest.findUniqueOrThrow({ where: { id }, select: requestSelect }));
      const approved = input.status === 'APPROVED';
      await notificationService.createManyInTransaction(tx, [
        {
          userId: dto.userId,
          type: 'STAFF_ATTENDANCE',
          title: approved ? 'Ruxsat so‘rovingiz tasdiqlandi' : 'Ruxsat so‘rovingiz rad etildi',
          message: `${approved ? '✅' : '❌'} ${describe(dto)}${input.note ? `. Izoh: ${input.note}` : ''}`,
          actionUrl: '/my-attendance',
          dedupeKey: `staff-request-decided:${id}`,
        },
      ]);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: approved ? 'staff_permission.approved' : 'staff_permission.rejected',
        entityType: 'staffPermissionRequest',
        entityId: id,
        ip: client.ip,
        userAgent: client.userAgent,
        before: { status: 'PENDING' },
        after: { status: input.status, note: input.note ?? null },
      });
      return dto;
    });
  },

  /** Rahbar xodim nomidan yozadi (masalan, telefon orqali aytilgan) — darhol tasdiqlangan */
  async createFor(actor: AuthUser, userId: string, input: PermissionRequestInput, client: ClientInfo, now: Date = new Date()): Promise<PermissionRequestDto> {
    const scope = await branchScopeOf(actor);
    const subject = await findSubject(userId);
    if (!subject || (scope.branchId && subject.branchId !== scope.branchId)) throw AppError.notFound('Xodim topilmadi');
    if (subject.id === actor.id) throw AppError.forbidden('O‘zingizga ruxsatni o‘zingiz bera olmaysiz');
    const data = normalize(input, now);
    return prisma.$transaction(async (tx) => {
      const record = await tx.staffPermissionRequest.create({
        data: { userId: subject.id, type: input.type, ...data, reason: input.reason, status: 'APPROVED', requestedById: actor.id, decidedById: actor.id, decidedAt: now },
        select: requestSelect,
      });
      const dto = toDto(record);
      await notificationService.createManyInTransaction(tx, [
        {
          userId: subject.id,
          type: 'STAFF_ATTENDANCE',
          title: 'Sizga ruxsat berildi',
          message: `✅ ${describe(dto)}. Sabab: ${input.reason}`,
          actionUrl: '/my-attendance',
          dedupeKey: `staff-request-decided:${record.id}`,
        },
      ]);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'staff_permission.granted',
        entityType: 'staffPermissionRequest',
        entityId: record.id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { userId: subject.id, type: input.type, startDate: dto.startDate, endDate: dto.endDate, time: dto.time },
      });
      return dto;
    });
  },
};
