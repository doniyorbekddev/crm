import { prisma } from '../config/database.js';
import type { LeaveStatus, LeaveType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';

/**
 * Xodim ta'tillari.
 *
 * Tamoyillar:
 *  - **Holat o'zgarmaydi:** tasdiqlangan ta'til `Employee.status` ni o'zgartirmaydi. "Bugun ta'tilda"
 *    degan javob sanalardan hisoblanadi — shunda qo'lda qo'yilgan holat (masalan SUSPENDED) buzilmaydi
 *    va ta'til tugaganda hech narsani qaytarish kerak emas.
 *  - **To'qnashuv:** bir xodimda tasdiqlangan ta'tillar ustma-ust tushmaydi.
 *  - Ariza o'chirilmaydi — rad etiladi yoki bekor qilinadi (tarix saqlanadi).
 */

const DAY_MS = 86_400_000;

const leaveSelect = {
  id: true,
  employeeId: true,
  type: true,
  startDate: true,
  endDate: true,
  days: true,
  reason: true,
  status: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  employee: { select: { id: true, firstName: true, lastName: true, position: true } },
  requestedBy: { select: { firstName: true, lastName: true } },
  decidedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.EmployeeLeaveSelect;

type LeaveRecord = Prisma.EmployeeLeaveGetPayload<{ select: typeof leaveSelect }>;

export interface EmployeeLeaveDto {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Bugun shu ta'til davom etyaptimi */
  isActiveToday: boolean;
  createdAt: string;
}

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);
const person = (value: { firstName: string; lastName: string } | null) => (value ? `${value.firstName} ${value.lastName}` : null);

/** Ikkala chekka kun ham hisobga olinadi: 1-dan 3-gacha = 3 kun */
export function countDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function isActiveToday(record: { startDate: Date; endDate: Date; status: LeaveStatus }, now = new Date()): boolean {
  if (record.status !== 'APPROVED') return false;
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  return record.startDate <= today && record.endDate >= today;
}

function toDto(record: LeaveRecord): EmployeeLeaveDto {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    type: record.type,
    startDate: toDateOnly(record.startDate),
    endDate: toDateOnly(record.endDate),
    days: record.days,
    reason: record.reason,
    status: record.status,
    requestedBy: person(record.requestedBy),
    decidedBy: person(record.decidedBy),
    decidedAt: record.decidedAt?.toISOString() ?? null,
    decisionNote: record.decisionNote,
    isActiveToday: isActiveToday(record),
    createdAt: record.createdAt.toISOString(),
  };
}

/** Bugun ta'tilda bo'lgan xodimlar ro'yxati (ro'yxatda belgi qo'yish uchun) */
export async function employeesOnLeaveToday(employeeIds: string[], now = new Date()): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set();
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const rows = await prisma.employeeLeave.findMany({
    where: { employeeId: { in: employeeIds }, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
    select: { employeeId: true },
  });
  return new Set(rows.map((row) => row.employeeId));
}

export const employeeLeaveService = {
  async list(query: {
    page: number;
    limit: number;
    employeeId?: string | undefined;
    status?: LeaveStatus | undefined;
    type?: LeaveType | undefined;
  }): Promise<{ items: EmployeeLeaveDto[]; total: number }> {
    const where: Prisma.EmployeeLeaveWhereInput = {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.employeeLeave.findMany({ where, select: leaveSelect, orderBy: [{ startDate: 'desc' }], ...toSkipTake(query.page, query.limit) }),
      prisma.employeeLeave.count({ where }),
    ]);
    return { items: items.map(toDto), total };
  },

  async create(
    actor: AuthUser,
    input: { employeeId: string; type: LeaveType; startDate: Date; endDate: Date; reason?: string | undefined },
    client: ClientInfo,
  ): Promise<EmployeeLeaveDto> {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, firstName: true, lastName: true } });
    if (!employee) throw AppError.notFound('Xodim topilmadi');
    if (input.endDate < input.startDate) {
      throw AppError.unprocessable('Sanalar noto‘g‘ri', [{ field: 'endDate', message: 'Tugash sanasi boshlanishdan keyin bo‘lsin' }]);
    }

    // Tasdiqlangan ta'til bilan ustma-ust tushmasin
    const overlap = await prisma.employeeLeave.findFirst({
      where: {
        employeeId: input.employeeId,
        status: 'APPROVED',
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
      },
      select: { startDate: true, endDate: true },
    });
    if (overlap) {
      throw AppError.conflict(
        `Bu sanalarda tasdiqlangan ta'til bor: ${toDateOnly(overlap.startDate)} — ${toDateOnly(overlap.endDate)}`,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.employeeLeave.create({
        data: {
          employeeId: input.employeeId,
          type: input.type,
          startDate: input.startDate,
          endDate: input.endDate,
          days: countDays(input.startDate, input.endDate),
          reason: input.reason ?? null,
          requestedById: actor.id,
        },
        select: leaveSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'employee.leave_requested',
        entityType: 'employee',
        entityId: input.employeeId,
        metadata: { leaveId: record.id, type: record.type, days: record.days, from: toDateOnly(record.startDate), to: toDateOnly(record.endDate) },
        ...client,
      });
      return record;
    });
    return toDto(created);
  },

  /** Tasdiqlash yoki rad etish. Rad etishda sabab majburiy. */
  async decide(
    actor: AuthUser,
    id: string,
    decision: { status: Extract<LeaveStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>; note?: string | undefined },
    client: ClientInfo,
  ): Promise<EmployeeLeaveDto> {
    const leave = await prisma.employeeLeave.findUnique({
      where: { id },
      select: { id: true, employeeId: true, status: true, startDate: true, endDate: true },
    });
    if (!leave) throw AppError.notFound('Ariza topilmadi');
    if (leave.status === decision.status) throw AppError.conflict('Ariza allaqachon shu holatda');
    if (leave.status !== 'PENDING' && decision.status !== 'CANCELLED') {
      throw AppError.conflict('Faqat ko‘rib chiqilmagan arizani tasdiqlash yoki rad etish mumkin');
    }
    if (decision.status === 'REJECTED' && !decision.note) {
      throw AppError.unprocessable('Rad etish sababi yozilishi shart', [{ field: 'note', message: 'Sababni yozing' }]);
    }

    if (decision.status === 'APPROVED') {
      const overlap = await prisma.employeeLeave.findFirst({
        where: {
          employeeId: leave.employeeId,
          status: 'APPROVED',
          id: { not: id },
          startDate: { lte: leave.endDate },
          endDate: { gte: leave.startDate },
        },
        select: { id: true },
      });
      if (overlap) throw AppError.conflict('Bu sanalarda tasdiqlangan ta’til allaqachon bor');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.employeeLeave.update({
        where: { id },
        data: { status: decision.status, decidedById: actor.id, decidedAt: new Date(), decisionNote: decision.note ?? null },
        select: leaveSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: decision.status === 'APPROVED' ? 'employee.leave_approved' : decision.status === 'REJECTED' ? 'employee.leave_rejected' : 'employee.leave_cancelled',
        entityType: 'employee',
        entityId: leave.employeeId,
        metadata: { leaveId: id, note: decision.note ?? null },
        ...client,
      });
      return record;
    });
    return toDto(updated);
  },

  /** Xodim kartochkasi uchun: ta'til tarixi va shu yildagi kunlar */
  async forEmployee(employeeId: string): Promise<{ items: EmployeeLeaveDto[]; approvedDaysThisYear: number; onLeaveToday: boolean }> {
    const rows = await prisma.employeeLeave.findMany({
      where: { employeeId },
      select: leaveSelect,
      orderBy: { startDate: 'desc' },
      take: 50,
    });
    const yearStart = new Date(new Date().getUTCFullYear(), 0, 1);
    const approvedDaysThisYear = rows
      .filter((row) => row.status === 'APPROVED' && row.startDate >= yearStart)
      .reduce((sum, row) => sum + row.days, 0);
    return {
      items: rows.map(toDto),
      approvedDaysThisYear,
      onLeaveToday: rows.some((row) => isActiveToday(row)),
    };
  },
};
