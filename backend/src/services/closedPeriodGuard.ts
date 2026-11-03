import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';

/**
 * Yopilgan oy davomati (tarixiy ma'lumot, qaror 3): moliyaviy oy yopilgandan keyin shu oy davomati va dars seanslari
 * (maosh shulardan hisoblanadi) faqat `attendance.correct_closed` ruxsati va sabab bilan o'zgaradi, auditga yoziladi.
 * Qulflangan oyda umuman o'zgarmaydi — avval qulf ochiladi.
 */

export const CORRECTION_REASON_MIN = 5;

export interface ClosedPeriodCorrection {
  period: string;
  reason: string;
}

/**
 * `date` — `@db.Date` qiymati (UTC yarim tun = o'quv markaz sanasi). Ochiq oy — `null` (oddiy tahrir);
 * yopilgan oy — ruxsat va sabab tekshiriladi va tuzatish ma'lumoti qaytadi; qulflangan oy — rad.
 */
export async function assertAttendanceEditable(actor: AuthUser, date: Date, reason: string | undefined): Promise<ClosedPeriodCorrection | null> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const period = await prisma.financialPeriod.findUnique({ where: { year_month: { year, month } }, select: { status: true } });
  if (!period || period.status === 'OPEN') return null;

  const label = formatSalaryPeriod(year, month);
  if (period.status === 'LOCKED') {
    throw AppError.conflict(`${label} qulflangan — bu oy davomatini o‘zgartirib bo‘lmaydi`);
  }
  if (!(await permissionService.hasPermission(actor.roleId, PERMISSIONS.ATTENDANCE_CORRECT_CLOSED))) {
    throw AppError.forbidden(`${label} moliyaviy oyi yopilgan — davomatni faqat tuzatish ruxsati bor xodim o‘zgartiradi`);
  }
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length < CORRECTION_REASON_MIN) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
      { field: 'correctionReason', message: `${label} yopilgan — tuzatish sababini yozing (kamida ${CORRECTION_REASON_MIN} belgi)` },
    ]);
  }
  return { period: label, reason: trimmed };
}

/** Yopilgan oy tuzatishi auditda alohida amal sifatida ham ko'rinsin (filtrlash uchun) */
export async function recordAttendanceCorrection(
  actor: AuthUser,
  correction: ClosedPeriodCorrection,
  entity: { type: string; id: string; details: Record<string, unknown> },
  client: ClientInfo,
): Promise<void> {
  await auditService.record({
    userId: actor.id,
    action: 'attendance.closed_period_corrected',
    entityType: entity.type,
    entityId: entity.id,
    metadata: { period: correction.period, reason: correction.reason, ...entity.details },
    ...client,
  });
}
