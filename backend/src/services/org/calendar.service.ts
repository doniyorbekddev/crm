import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { AuthUser } from '../../types/auth.js';
import { getBranchAccess } from '../branchAccess.js';
import { permissionService } from '../permission.service.js';

/**
 * Umumiy kalendar (ORG roadmap §5, master §3.5): bayramlar, tasdiqlangan ta'tillar, ruxsatlar va xodim dam olish/boshqa
 * soat istisnolari — bitta oy bo'yicha. Yangi jadval yo'q: mavjud yozuvlardan yig'iladi.
 *
 * Har bir xodim (kabinet hisobi emas) o'z filiali kalendarini ko'radi; sabablar (masalan, kasallik) — faqat davomatni
 * yoki xodimlarni ko'ra oladigan rahbarga.
 */

export type CalendarItemKind = 'HOLIDAY' | 'LEAVE' | 'ABSENCE' | 'LATE_ARRIVAL' | 'EARLY_LEAVE' | 'DAY_OFF' | 'CUSTOM_HOURS';

export interface CalendarItemDto {
  id: string;
  kind: CalendarItemKind;
  title: string;
  person: { id: string; name: string } | null;
  startDate: string;
  endDate: string;
  /** Turi yoki vaqti: "Kasallik ta'tili", "10:00 gacha", "09:00–13:00" */
  detail: string | null;
  /** Faqat rahbarga */
  reason: string | null;
}

export interface CalendarMonthDto {
  month: string;
  from: string;
  to: string;
  canSeeReasons: boolean;
  items: CalendarItemDto[];
}

const LEAVE_LABELS: Record<string, string> = {
  VACATION: 'Mehnat ta’tili',
  SICK: 'Kasallik ta’tili',
  UNPAID: 'O‘z hisobidan ta’til',
  MATERNITY: 'Dekret ta’tili',
  OTHER: 'Ta’til',
};

const toDate = (value: Date) => value.toISOString().slice(0, 10);
const name = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`.trim();

export const orgCalendarService = {
  async month(actor: AuthUser, year: number, month: number): Promise<CalendarMonthDto> {
    const access = await getBranchAccess(actor);
    const branch = access.canViewAll ? {} : { branchId: access.branchId };
    const [viewAttendance, viewEmployees] = await Promise.all([
      permissionService.hasPermission(actor.roleId, PERMISSIONS.STAFF_ATTENDANCE_VIEW),
      permissionService.hasPermission(actor.roleId, PERMISSIONS.EMPLOYEE_VIEW),
    ]);
    const canSeeReasons = viewAttendance || viewEmployees;

    // Sana ustunlari (`@db.Date`) — o'quv markaz kuni: oyning birinchi va oxirgi kuni
    const fromDate = new Date(Date.UTC(year, month - 1, 1));
    const toDateValue = new Date(Date.UTC(year, month, 0));
    const from = toDate(fromDate);
    const to = toDate(toDateValue);

    const [holidays, leaves, requests, exceptions] = await Promise.all([
      prisma.staffHoliday.findMany({ where: { date: { gte: fromDate, lte: toDateValue } }, orderBy: { date: 'asc' } }),
      prisma.employeeLeave.findMany({
        where: { status: 'APPROVED', startDate: { lte: toDateValue }, endDate: { gte: fromDate }, employee: { ...branch } },
        select: { id: true, type: true, startDate: true, endDate: true, reason: true, employee: { select: { id: true, userId: true, firstName: true, lastName: true } } },
        orderBy: { startDate: 'asc' },
      }),
      prisma.staffPermissionRequest.findMany({
        where: { status: 'APPROVED', startDate: { lte: toDateValue }, endDate: { gte: fromDate }, user: { ...branch } },
        select: { id: true, type: true, startDate: true, endDate: true, time: true, reason: true, user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { startDate: 'asc' },
      }),
      prisma.staffScheduleException.findMany({
        where: { date: { gte: fromDate, lte: toDateValue }, user: { ...branch } },
        select: { id: true, type: true, date: true, startTime: true, endTime: true, reason: true, user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);

    const reason = (value: string | null) => (canSeeReasons ? value : null);
    const items: CalendarItemDto[] = [
      ...holidays.map((holiday) => ({
        id: holiday.id,
        kind: 'HOLIDAY' as const,
        title: holiday.name,
        person: null,
        startDate: toDate(holiday.date),
        endDate: toDate(holiday.date),
        detail: 'Bayram — markaz dam oladi',
        reason: null,
      })),
      ...leaves.map((leave) => ({
        id: leave.id,
        kind: 'LEAVE' as const,
        title: `${name(leave.employee)} — ${LEAVE_LABELS[leave.type] ?? 'Ta’til'}`,
        person: { id: leave.employee.userId ?? leave.employee.id, name: name(leave.employee) },
        startDate: toDate(leave.startDate),
        endDate: toDate(leave.endDate),
        detail: LEAVE_LABELS[leave.type] ?? 'Ta’til',
        reason: reason(leave.reason),
      })),
      ...requests.map((request) => {
        const kind = request.type as 'ABSENCE' | 'LATE_ARRIVAL' | 'EARLY_LEAVE';
        const detail = kind === 'ABSENCE' ? 'Kelmaydi (ruxsat)' : kind === 'LATE_ARRIVAL' ? `${request.time ?? ''} gacha keladi` : `${request.time ?? ''} dan ketadi`;
        return {
          id: request.id,
          kind,
          title: `${name(request.user)} — ${detail}`,
          person: { id: request.user.id, name: name(request.user) },
          startDate: toDate(request.startDate),
          endDate: toDate(request.endDate),
          detail,
          reason: reason(request.reason),
        };
      }),
      ...exceptions.map((exception) => {
        const kind = exception.type;
        const detail = kind === 'DAY_OFF' ? 'Dam olish kuni' : `${exception.startTime ?? ''}–${exception.endTime ?? ''} ishlaydi`;
        return {
          id: exception.id,
          kind,
          title: `${name(exception.user)} — ${detail}`,
          person: { id: exception.user.id, name: name(exception.user) },
          startDate: toDate(exception.date),
          endDate: toDate(exception.date),
          detail,
          reason: reason(exception.reason),
        };
      }),
    ].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));

    return { month: `${year}-${String(month).padStart(2, '0')}`, from, to, canSeeReasons, items };
  },
};
