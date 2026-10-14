import { prisma } from '../config/database.js';
import { EMPLOYEE_POSITION_LABELS } from '../config/employeeLabels.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { EmployeePosition, KpiMetric, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { businessMonthRange } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  KpiDefinitionInput,
  KpiDefinitionUpdateInput,
  KpiManualResultInput,
  KpiPoolInput,
  KpiSettingsInput,
} from '../validators/kpi.validator.js';
import { auditService } from './audit.service.js';

type Db = Prisma.TransactionClient;

/**
 * Xodim KPI'lari (administrator, operator va boshqa lavozimlar).
 *
 * Bonus qoidasi (direktor tanlagan, 2026-10-14):
 *   bonus = xodimning oylik KPI bonus fondi × vaznli bajarilish, har KPI 100% da cheklanadi;
 *   vaznli bajarilish chegaradan (standart 50%) past bo'lsa bonus 0.
 * Ma'lumoti yo'q KPI (masalan, oyda to'lov jadvali bo'lmagan) bahoga kirmaydi — qolgan vaznlar bo'yicha
 * hisoblanadi va maoshda ogohlantirish chiqadi. Lavozim KPI vaznlari 100% bo'lmasa bonus hisoblanmaydi.
 */

export const KPI_SETTINGS_KEY = 'payroll.kpi';
export const DEFAULT_KPI_THRESHOLD = 50;

export const KPI_METRIC_META: Record<KpiMetric, { label: string; unit: 'COUNT' | 'PERCENT'; method: string; needsUser: boolean }> = {
  ACQUIRED_STUDENTS: {
    label: 'Jalb qilingan o‘quvchilar',
    unit: 'COUNT',
    method: 'Lead o‘quvchiga aylangan paytda xodim mas’ul bo‘lgan va o‘quvchi shu oyda birinchi to‘lovini qilgan (bekor qilingan yoki to‘liq qaytarilgan to‘lov sanalmaydi; har o‘quvchi bir marta)',
    needsUser: true,
  },
  LEAD_CONVERSION: {
    label: 'Lead konversiyasi',
    unit: 'PERCENT',
    method: 'Oyda xodimga biriktirilgan yangi leadlar ichidan shu oyda sotuvga aylangani',
    needsUser: true,
  },
  PAYMENT_COLLECTION: {
    label: 'To‘lov yig‘ilishi',
    unit: 'PERCENT',
    method: 'Xodim filialida muddati shu oyga to‘g‘ri kelgan to‘lov jadvali summasidan shu oyda yig‘ilgan sof tushum (qaytarishlar ayirilgan)',
    needsUser: false,
  },
  ATTENDANCE_RATE: {
    label: 'Filial davomati',
    unit: 'PERCENT',
    method: 'Xodim filialida oy davomidagi davomat belgilari ichida kelgan va kechikkanlar ulushi',
    needsUser: false,
  },
  STUDENT_RETENTION: {
    label: 'O‘quvchilarni saqlash',
    unit: 'PERCENT',
    method: '100 − oyda o‘qishni tashlaganlar ulushi (oy davomida o‘qigan o‘quvchilarga nisbatan), xodim filiali bo‘yicha',
    needsUser: false,
  },
  TASK_COMPLETION: {
    label: 'Vazifalarni o‘z vaqtida bajarish',
    unit: 'PERCENT',
    method: 'Xodimga biriktirilgan, muddati shu oyda bo‘lgan vazifalardan muddatigacha bajarilgani (bekor qilinganlar sanalmaydi)',
    needsUser: true,
  },
  MANUAL: {
    label: 'Qo‘lda kiritiladigan natija',
    unit: 'PERCENT',
    method: 'Natija har oy sabab bilan qo‘lda kiritiladi (masalan, mamnuniyat so‘rovi). Kiritilmasa — bahoga kirmaydi',
    needsUser: false,
  },
};

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

type PersonRef = { id: string; firstName: string; lastName: string };

export interface KpiDefinitionDto {
  id: string;
  name: string;
  position: EmployeePosition;
  positionLabel: string;
  metric: KpiMetric;
  metricLabel: string;
  unit: 'COUNT' | 'PERCENT';
  method: string;
  target: number;
  weight: number;
  description: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: PersonRef | null;
}

export interface KpiPositionSummaryDto {
  position: EmployeePosition;
  label: string;
  /** Hozir amal qilayotgan faol KPI'lar vazni yig'indisi */
  weightSum: number;
  valid: boolean;
  employees: number;
}

export interface KpiResultDto {
  kpiId: string;
  name: string;
  metric: KpiMetric;
  unit: 'COUNT' | 'PERCENT';
  method: string;
  target: number;
  weight: number;
  /** null — ma'lumot yo'q (bahoga kirmadi) */
  actual: number | null;
  /** 0–100, maqsadga nisbatan (100 da cheklangan) */
  achievement: number | null;
  /** Hisob asosini tushuntiradi: "12 / 15 belgi", "3 ta o'quvchi" */
  basis: string;
  /** Qo'lda kiritilgan natija bo'lsa — kim va nima sababdan */
  manual: { reason: string; createdBy: PersonRef | null; updatedAt: string } | null;
}

export interface AcquisitionDto {
  studentId: string;
  studentName: string;
  code: string;
  leadId: string;
  paymentId: string;
  paidAt: string;
  amount: number;
}

export interface KpiEvaluationDto {
  pool: number;
  threshold: number;
  weightSum: number;
  configValid: boolean;
  /** Vaznli bajarilish, % (ma'lumoti bor KPI'lar bo'yicha); KPI yo'q bo'lsa null */
  achievement: number | null;
  bonus: number;
  results: KpiResultDto[];
  acquisitions: AcquisitionDto[];
  warnings: string[];
}

export interface KpiSettingsDto {
  threshold: number;
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const definitionSelect = {
  id: true,
  name: true,
  position: true,
  metric: true,
  target: true,
  weight: true,
  description: true,
  effectiveFrom: true,
  effectiveTo: true,
  isActive: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.KpiDefinitionSelect;

type DefinitionRecord = Prisma.KpiDefinitionGetPayload<{ select: typeof definitionSelect }>;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDefinitionDto(row: DefinitionRecord): KpiDefinitionDto {
  const meta = KPI_METRIC_META[row.metric];
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    positionLabel: EMPLOYEE_POSITION_LABELS[row.position],
    metric: row.metric,
    metricLabel: meta.label,
    unit: meta.unit,
    method: meta.method,
    target: row.target.toNumber(),
    weight: row.weight,
    description: row.description,
    effectiveFrom: dateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? dateOnly(row.effectiveTo) : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

/** @db.Date ustunlari uchun oy chegaralari (UTC) */
function dateMonthRange(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('uz-UZ').format(value).replace(/,/g, ' ');
}

/** Oyda amal qiladigan faol KPI'lar */
async function definitionsForMonth(db: Db, position: EmployeePosition, year: number, month: number): Promise<DefinitionRecord[]> {
  const { start, end } = dateMonthRange(year, month);
  return db.kpiDefinition.findMany({
    where: {
      position,
      isActive: true,
      effectiveFrom: { lt: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    orderBy: [{ weight: 'desc' }, { createdAt: 'asc' }],
    select: definitionSelect,
  });
}

async function readThreshold(db: Db): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: KPI_SETTINGS_KEY }, select: { value: true } });
  const value = (row?.value as { threshold?: unknown } | null)?.threshold;
  return typeof value === 'number' && value >= 0 && value <= 100 ? value : DEFAULT_KPI_THRESHOLD;
}

// ---------------------------------------------------------------------
// Ko'rsatkichlar — har biri mavjud yozuvlardan
// ---------------------------------------------------------------------

/** Lead o'quvchiga aylangan paytdagi mas'ul: o'sha paytgacha oxirgi biriktirish, bo'lmasa — yaratilgandagi */
async function assigneeAtConversion(db: Db, lead: { id: string; assignedToId: string | null; convertedAt: Date | null }, fallbackAt: Date): Promise<string | null> {
  const at = lead.convertedAt ?? fallbackAt;
  const activities = await db.leadActivity.findMany({
    where: { leadId: lead.id, type: { in: ['ASSIGNED', 'CREATED'] }, createdAt: { lte: at } },
    orderBy: { createdAt: 'desc' },
    select: { type: true, metadata: true },
  });
  for (const activity of activities) {
    const metadata = (activity.metadata ?? {}) as Record<string, unknown>;
    if (activity.type === 'ASSIGNED' && 'to' in metadata) return typeof metadata.to === 'string' ? metadata.to : null;
    if (activity.type === 'CREATED' && 'assignedToId' in metadata) {
      return typeof metadata.assignedToId === 'string' ? metadata.assignedToId : null;
    }
  }
  return lead.assignedToId;
}

/** Xodim shu oyda jalb qilgan o'quvchilar (qoida — KPI_METRIC_META.ACQUIRED_STUDENTS) */
export async function acquisitionsFor(db: Db, userId: string, year: number, month: number): Promise<AcquisitionDto[]> {
  const { start, end } = businessMonthRange(year, month);
  // Shu oydagi to'lovlar — faqat leaddan kelgan o'quvchilar
  const monthPayments = await db.payment.findMany({
    where: { deletedAt: null, paidAt: { gte: start, lt: end }, student: { deletedAt: null, leadId: { not: null } } },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const studentIds = monthPayments.map((row) => row.studentId);
  if (studentIds.length === 0) return [];

  const students = await db.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      number: true,
      phone: true,
      createdAt: true,
      lead: { select: { id: true, assignedToId: true, convertedAt: true } },
      payments: {
        where: { deletedAt: null, paidAt: { lt: end } },
        orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, amount: true, paidAt: true, refunds: { select: { amount: true } } },
      },
    },
  });

  const result: AcquisitionDto[] = [];
  const seenPhones = new Set<string>();
  for (const student of students) {
    if (!student.lead) continue;
    // Birinchi "haqiqiy" to'lov: bekor qilinmagan va to'liq qaytarilmagan
    const first = student.payments.find(
      (payment) => payment.amount.toNumber() - payment.refunds.reduce((sum, refund) => sum + refund.amount.toNumber(), 0) > 0,
    );
    if (!first || first.paidAt < start) continue;
    const assignee = await assigneeAtConversion(db, student.lead, student.createdAt);
    if (assignee !== userId) continue;
    // Bir odam ikki marta kiritilgan bo'lsa (bir xil telefon) — bir marta
    const phone = student.phone.replace(/\D/g, '');
    if (phone && seenPhones.has(phone)) continue;
    if (phone) seenPhones.add(phone);
    result.push({
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      code: formatStudentNumber(student.number),
      leadId: student.lead.id,
      paymentId: first.id,
      paidAt: first.paidAt.toISOString(),
      amount: first.amount.toNumber(),
    });
  }
  return result.sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

type MetricValue = { actual: number | null; basis: string };

async function leadConversion(db: Db, userId: string, year: number, month: number): Promise<MetricValue> {
  const { start, end } = businessMonthRange(year, month);
  const assigned = await db.lead.count({ where: { deletedAt: null, assignedToId: userId, createdAt: { gte: start, lt: end } } });
  if (assigned === 0) return { actual: null, basis: 'Oyda biriktirilgan yangi lead yo‘q' };
  const won = await db.lead.count({
    where: { deletedAt: null, assignedToId: userId, createdAt: { gte: start, lt: end }, status: 'WON', convertedAt: { gte: start, lt: end } },
  });
  return { actual: percent(won, assigned), basis: `${formatCount(won)} / ${formatCount(assigned)} lead` };
}

async function paymentCollection(db: Db, branchId: string, year: number, month: number): Promise<MetricValue> {
  const dates = dateMonthRange(year, month);
  const { start, end } = businessMonthRange(year, month);
  const due = await db.paymentInstallment.aggregate({
    where: { dueDate: { gte: dates.start, lt: dates.end }, student: { deletedAt: null, branchId } },
    _sum: { amount: true },
  });
  const expected = due._sum.amount?.toNumber() ?? 0;
  if (expected === 0) return { actual: null, basis: 'Oyga to‘lov jadvali yo‘q' };
  const paid = await db.payment.aggregate({ where: { deletedAt: null, branchId, paidAt: { gte: start, lt: end } }, _sum: { amount: true } });
  const refunded = await db.paymentRefund.aggregate({
    where: { refundedAt: { gte: start, lt: end }, payment: { branchId } },
    _sum: { amount: true },
  });
  const collected = (paid._sum.amount?.toNumber() ?? 0) - (refunded._sum.amount?.toNumber() ?? 0);
  return { actual: percent(Math.max(collected, 0), expected), basis: `${formatCount(Math.max(collected, 0))} / ${formatCount(expected)} so‘m` };
}

async function attendanceRate(db: Db, branchId: string, year: number, month: number): Promise<MetricValue> {
  const { start, end } = dateMonthRange(year, month);
  const rows = await db.attendance.groupBy({
    by: ['status'],
    where: { date: { gte: start, lt: end }, student: { branchId } },
    _count: { _all: true },
  });
  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  if (total === 0) return { actual: null, basis: 'Oyda davomat belgilanmagan' };
  const present = rows.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').reduce((sum, row) => sum + row._count._all, 0);
  return { actual: percent(present, total), basis: `${formatCount(present)} / ${formatCount(total)} belgi` };
}

async function studentRetention(db: Db, branchId: string, year: number, month: number): Promise<MetricValue> {
  const { start, end } = businessMonthRange(year, month);
  const dropped = await db.student.count({
    where: { deletedAt: null, branchId, status: 'DROPPED', statusChangedAt: { gte: start, lt: end } },
  });
  // Oy davomida o'qiganlar: oy oxirigacha qo'shilgan, hozir faol yoki holati shu oy (yoki keyin) o'zgargan
  const base = await db.student.count({
    where: { deletedAt: null, branchId, createdAt: { lt: end }, OR: [{ status: 'ACTIVE' }, { statusChangedAt: { gte: start } }] },
  });
  if (base === 0) return { actual: null, basis: 'Oyda o‘quvchi yo‘q' };
  return { actual: Math.round((100 - percent(dropped, base)) * 10) / 10, basis: `${formatCount(dropped)} ta ketgan / ${formatCount(base)} ta o‘quvchi` };
}

async function taskCompletion(db: Db, userId: string, year: number, month: number): Promise<MetricValue> {
  const { start, end } = businessMonthRange(year, month);
  const tasks = await db.task.findMany({
    where: { assigneeId: userId, dueAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
    select: { status: true, dueAt: true, completedAt: true },
  });
  if (tasks.length === 0) return { actual: null, basis: 'Muddati shu oyda bo‘lgan vazifa yo‘q' };
  const onTime = tasks.filter((task) => task.status === 'DONE' && task.completedAt && task.dueAt && task.completedAt <= task.dueAt).length;
  return { actual: percent(onTime, tasks.length), basis: `${formatCount(onTime)} / ${formatCount(tasks.length)} vazifa` };
}

// ---------------------------------------------------------------------
// Baholash
// ---------------------------------------------------------------------

export interface KpiEmployee {
  id: string;
  userId: string | null;
  branchId: string;
  position: EmployeePosition;
  kpiBonusPool: Prisma.Decimal | number;
}

/** Xodimning oy KPI'lari, bajarilishi va bonusi. Maosh hisoblashda va profil oldindan ko'rishda bir xil */
export async function evaluateEmployeeKpi(db: Db, employee: KpiEmployee, year: number, month: number): Promise<KpiEvaluationDto> {
  const pool = typeof employee.kpiBonusPool === 'number' ? employee.kpiBonusPool : employee.kpiBonusPool.toNumber();
  const threshold = await readThreshold(db);
  const definitions = await definitionsForMonth(db, employee.position, year, month);
  const warnings: string[] = [];
  const weightSum = definitions.reduce((sum, definition) => sum + definition.weight, 0);
  const configValid = definitions.length > 0 && weightSum === 100;

  if (definitions.length === 0) {
    if (pool > 0) warnings.push(`KPI bonus fondi bor, lekin "${EMPLOYEE_POSITION_LABELS[employee.position]}" lavozimiga KPI belgilanmagan`);
    return { pool, threshold, weightSum: 0, configValid: false, achievement: null, bonus: 0, results: [], acquisitions: [], warnings };
  }
  if (!configValid) warnings.push(`KPI vaznlari yig‘indisi ${weightSum}% — 100% bo‘lishi kerak. KPI bonusi hisoblanmadi`);

  const manualRows = await db.kpiManualResult.findMany({
    where: { employeeId: employee.id, year, month, kpiId: { in: definitions.map((definition) => definition.id) } },
    select: { kpiId: true, actual: true, reason: true, updatedAt: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  let acquisitions: AcquisitionDto[] = [];
  const results: KpiResultDto[] = [];
  for (const definition of definitions) {
    const meta = KPI_METRIC_META[definition.metric];
    let value: MetricValue;
    let manual: KpiResultDto['manual'] = null;
    if (meta.needsUser && !employee.userId) {
      value = { actual: null, basis: 'Xodim CRM foydalanuvchisiga bog‘lanmagan' };
      warnings.push(`"${definition.name}": xodim CRM foydalanuvchisiga bog‘lanmagan — natija hisoblanmadi`);
    } else {
      switch (definition.metric) {
        case 'ACQUIRED_STUDENTS': {
          acquisitions = await acquisitionsFor(db, employee.userId!, year, month);
          value = { actual: acquisitions.length, basis: `${formatCount(acquisitions.length)} ta o‘quvchi` };
          break;
        }
        case 'LEAD_CONVERSION':
          value = await leadConversion(db, employee.userId!, year, month);
          break;
        case 'PAYMENT_COLLECTION':
          value = await paymentCollection(db, employee.branchId, year, month);
          break;
        case 'ATTENDANCE_RATE':
          value = await attendanceRate(db, employee.branchId, year, month);
          break;
        case 'STUDENT_RETENTION':
          value = await studentRetention(db, employee.branchId, year, month);
          break;
        case 'TASK_COMPLETION':
          value = await taskCompletion(db, employee.userId!, year, month);
          break;
        case 'MANUAL': {
          const row = manualRows.find((item) => item.kpiId === definition.id);
          value = row ? { actual: row.actual.toNumber(), basis: 'Qo‘lda kiritilgan' } : { actual: null, basis: 'Natija kiritilmagan' };
          if (row) manual = { reason: row.reason, createdBy: row.createdBy, updatedAt: row.updatedAt.toISOString() };
          else warnings.push(`"${definition.name}" natijasi kiritilmagan — bahoga kirmadi`);
          break;
        }
      }
    }
    const target = definition.target.toNumber();
    const achievement = value.actual === null ? null : Math.round(Math.min(value.actual / target, 1) * 1000) / 10;
    if (value.actual === null && definition.metric !== 'MANUAL' && !(meta.needsUser && !employee.userId)) {
      warnings.push(`"${definition.name}": ${value.basis.toLowerCase()} — bahoga kirmadi`);
    }
    results.push({
      kpiId: definition.id,
      name: definition.name,
      metric: definition.metric,
      unit: meta.unit,
      method: meta.method,
      target,
      weight: definition.weight,
      actual: value.actual,
      achievement,
      basis: value.basis,
      manual,
    });
  }

  const scored = results.filter((result) => result.achievement !== null);
  const scoredWeight = scored.reduce((sum, result) => sum + result.weight, 0);
  const achievement = scoredWeight === 0 ? null : Math.round((scored.reduce((sum, result) => sum + result.achievement! * result.weight, 0) / scoredWeight) * 10) / 10;
  if (achievement === null) warnings.push('KPI natijalari uchun ma’lumot yo‘q — bonus hisoblanmadi');
  const bonus = configValid && achievement !== null && achievement >= threshold ? Math.round((pool * achievement) / 100) : 0;
  if (configValid && achievement !== null && achievement < threshold && pool > 0) {
    warnings.push(`Vaznli bajarilish ${achievement}% — chegara ${threshold}% dan past, KPI bonusi 0`);
  }

  return { pool, threshold, weightSum, configValid, achievement, bonus, results, acquisitions, warnings };
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

async function assertWeightsFit(
  db: Db,
  position: EmployeePosition,
  weight: number,
  range: { effectiveFrom: Date; effectiveTo: Date | null },
  excludeId?: string,
): Promise<void> {
  const overlapping = await db.kpiDefinition.findMany({
    where: {
      position,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...(range.effectiveTo ? { effectiveFrom: { lte: range.effectiveTo } } : {}),
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.effectiveFrom } }],
    },
    select: { weight: true },
  });
  const sum = overlapping.reduce((total, row) => total + row.weight, 0) + weight;
  if (sum > 100) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
      { field: 'weight', message: `Lavozim KPI vaznlari yig‘indisi ${sum}% bo‘lib qoladi — 100% dan oshmasligi kerak` },
    ]);
  }
}

export const kpiService = {
  async definitions(): Promise<{ definitions: KpiDefinitionDto[]; positions: KpiPositionSummaryDto[]; settings: KpiSettingsDto }> {
    const rows = await prisma.kpiDefinition.findMany({ orderBy: [{ position: 'asc' }, { isActive: 'desc' }, { weight: 'desc' }], select: definitionSelect });
    const today = new Date();
    const current = rows.filter((row) => row.isActive && row.effectiveFrom <= today && (!row.effectiveTo || row.effectiveTo >= today));
    const employees = await prisma.employee.groupBy({ by: ['position'], where: { status: { not: 'RESIGNED' } }, _count: { _all: true } });
    const positions = (Object.keys(EMPLOYEE_POSITION_LABELS) as EmployeePosition[])
      .map((position) => {
        const weightSum = current.filter((row) => row.position === position).reduce((sum, row) => sum + row.weight, 0);
        return {
          position,
          label: EMPLOYEE_POSITION_LABELS[position],
          weightSum,
          valid: weightSum === 100,
          employees: employees.find((row) => row.position === position)?._count._all ?? 0,
        };
      })
      .filter((row) => row.weightSum > 0 || rows.some((definition) => definition.position === row.position));
    return { definitions: rows.map(toDefinitionDto), positions, settings: { threshold: await readThreshold(prisma) } };
  },

  async create(actor: AuthUser, input: KpiDefinitionInput, client: ClientInfo): Promise<KpiDefinitionDto> {
    return prisma.$transaction(async (tx) => {
      await assertWeightsFit(tx, input.position, input.weight, { effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null });
      const row = await tx.kpiDefinition.create({
        data: { ...input, effectiveTo: input.effectiveTo ?? null, description: input.description ?? null, createdById: actor.id },
        select: definitionSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'kpi.created',
        entityType: 'kpi',
        entityId: row.id,
        metadata: { name: row.name, position: row.position, metric: row.metric, target: input.target, weight: input.weight },
        ...client,
      });
      return toDefinitionDto(row);
    });
  },

  /** Tahrirlash: tasdiqlangan maoshlardagi KPI natijalari nusxada saqlangani uchun tarix o'zgarmaydi */
  async update(actor: AuthUser, id: string, input: KpiDefinitionUpdateInput, client: ClientInfo): Promise<KpiDefinitionDto> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.kpiDefinition.findUnique({ where: { id }, select: definitionSelect });
      if (!before) throw AppError.notFound('KPI topilmadi');
      const next = {
        position: input.position ?? before.position,
        weight: input.weight ?? before.weight,
        effectiveFrom: input.effectiveFrom ?? before.effectiveFrom,
        effectiveTo: input.effectiveTo === undefined ? before.effectiveTo : input.effectiveTo,
        isActive: input.isActive ?? before.isActive,
      };
      if (next.effectiveTo && next.effectiveTo < next.effectiveFrom) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'effectiveTo', message: 'Tugash sanasi boshlanishdan oldin bo‘lmasin' }]);
      }
      if (next.isActive) await assertWeightsFit(tx, next.position, next.weight, next, id);
      const row = await tx.kpiDefinition.update({
        where: { id },
        data: {
          ...input,
          ...(input.description !== undefined ? { description: input.description || null } : {}),
        },
        select: definitionSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'kpi.updated',
        entityType: 'kpi',
        entityId: id,
        before: toDefinitionDto(before) as unknown as Prisma.InputJsonValue,
        after: toDefinitionDto(row) as unknown as Prisma.InputJsonValue,
        metadata: { name: row.name },
        ...client,
      });
      return toDefinitionDto(row);
    });
  },

  async updateSettings(actor: AuthUser, input: KpiSettingsInput, client: ClientInfo): Promise<KpiSettingsDto> {
    const before = await readThreshold(prisma);
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: KPI_SETTINGS_KEY },
        create: { key: KPI_SETTINGS_KEY, value: { threshold: input.threshold }, description: 'KPI bonusi chegarasi, %', updatedById: actor.id },
        update: { value: { threshold: input.threshold }, updatedById: actor.id },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'kpi.settings_updated',
        entityType: 'kpi',
        entityId: KPI_SETTINGS_KEY,
        before: { threshold: before },
        after: { threshold: input.threshold },
        ...client,
      });
    });
    return { threshold: input.threshold };
  },

  /** Xodimning oylik KPI bonus fondi */
  async setPool(actor: AuthUser, employeeId: string, input: KpiPoolInput, client: ClientInfo): Promise<{ employeeId: string; kpiBonusPool: number }> {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true, kpiBonusPool: true } });
    if (!employee) throw AppError.notFound('Xodim topilmadi');
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employeeId }, data: { kpiBonusPool: input.kpiBonusPool } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'kpi.pool_updated',
        entityType: 'employee',
        entityId: employeeId,
        metadata: { employee: `${employee.firstName} ${employee.lastName}` },
        before: { kpiBonusPool: employee.kpiBonusPool.toNumber() },
        after: { kpiBonusPool: input.kpiBonusPool },
        ...client,
      });
    });
    return { employeeId, kpiBonusPool: input.kpiBonusPool };
  },

  /** MANUAL KPI natijasi — tasdiqlangan oyga kiritilmaydi */
  async saveManualResult(actor: AuthUser, input: KpiManualResultInput, client: ClientInfo): Promise<KpiEvaluationDto> {
    const definition = await prisma.kpiDefinition.findUnique({ where: { id: input.kpiId }, select: { id: true, name: true, metric: true, position: true } });
    if (!definition) throw AppError.notFound('KPI topilmadi');
    if (definition.metric !== 'MANUAL') throw AppError.unprocessable('Bu KPI natijasi CRM yozuvlaridan hisoblanadi — qo‘lda kiritilmaydi');
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, userId: true, branchId: true, position: true, kpiBonusPool: true, firstName: true, lastName: true },
    });
    if (!employee) throw AppError.notFound('Xodim topilmadi');
    if (employee.position !== definition.position) throw AppError.unprocessable('KPI bu xodim lavozimiga tegishli emas');
    const period = await prisma.teacherSalaryPeriod.findUnique({
      where: { employeeId_year_month: { employeeId: employee.id, year: input.year, month: input.month } },
      select: { lockedAt: true },
    });
    if (period?.lockedAt) throw AppError.conflict('Maosh tasdiqlangan — KPI natijasi o‘zgartirilmaydi');

    await prisma.$transaction(async (tx) => {
      const existing = await tx.kpiManualResult.findUnique({
        where: { kpiId_employeeId_year_month: { kpiId: input.kpiId, employeeId: input.employeeId, year: input.year, month: input.month } },
        select: { actual: true, reason: true },
      });
      await tx.kpiManualResult.upsert({
        where: { kpiId_employeeId_year_month: { kpiId: input.kpiId, employeeId: input.employeeId, year: input.year, month: input.month } },
        create: { ...input, createdById: actor.id },
        update: { actual: input.actual, reason: input.reason, createdById: actor.id },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'kpi.result_saved',
        entityType: 'employee',
        entityId: employee.id,
        metadata: { employee: `${employee.firstName} ${employee.lastName}`, kpi: definition.name, period: formatSalaryPeriod(input.year, input.month), reason: input.reason },
        before: existing ? { actual: existing.actual.toNumber(), reason: existing.reason } : undefined,
        after: { actual: input.actual },
        ...client,
      });
    });
    return evaluateEmployeeKpi(prisma, employee, input.year, input.month);
  },

  /** Oldindan ko'rish (hisoblashdan oldin yoki profil uchun) */
  async preview(employeeId: string, year: number, month: number): Promise<KpiEvaluationDto> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true, branchId: true, position: true, kpiBonusPool: true },
    });
    if (!employee) throw AppError.notFound('Xodim topilmadi');
    return evaluateEmployeeKpi(prisma, employee, year, month);
  },
};
