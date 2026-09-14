import { prisma } from '../config/database.js';
import { formatLeadNumber } from '../config/leadLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import { STUDENT_STATUS_ORDER, formatStudentNumber } from '../config/studentLabels.js';
import type { DebtStatus, Gender, Prisma, StudentStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  ConvertLeadInput,
  CreateStudentInput,
  StudentListQuery,
  UpdateStudentInput,
  UpdateStudentStatusInput,
} from '../validators/student.validator.js';
import { auditService } from './audit.service.js';
import { getLeadAccess, visibleLeadFilter } from './leadAccess.js';
import { notificationService } from './notification.service.js';
import { permissionService } from './permission.service.js';
import { EXPORT_ROW_LIMIT, exportSubtitle, sumColumns } from '../utils/tableExport.js';
import type { ExportColumn, ExportTable } from '../utils/tableExport.js';
import { STUDENT_STATUS_LABELS } from '../config/studentLabels.js';
import { createDefaultSchedule } from './paymentSchedule.service.js';

const studentSelect = {
  id: true,
  number: true,
  leadId: true,
  firstName: true,
  lastName: true,
  phone: true,
  parentPhone: true,
  telegram: true,
  email: true,
  birthDate: true,
  gender: true,
  address: true,
  contractNumber: true,
  contractPrice: true,
  startDate: true,
  status: true,
  statusChangedAt: true,
  notes: true,
  createdAt: true,
  course: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  debt: { select: { totalAmount: true, paidAmount: true, remainingAmount: true, status: true } },
} satisfies Prisma.StudentSelect;

type StudentRecord = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

export interface StudentDto {
  id: string;
  number: number;
  code: string;
  leadId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  parentPhone: string | null;
  telegram: string | null;
  email: string | null;
  birthDate: string | null;
  gender: Gender | null;
  address: string | null;
  contractNumber: string | null;
  contractPrice: number;
  startDate: string;
  status: StudentStatus;
  notes: string | null;
  createdAt: string;
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
  debt: { total: number; paid: number; remaining: number; status: DebtStatus } | null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toStudentDto(student: StudentRecord): StudentDto {
  return {
    id: student.id,
    number: student.number,
    code: formatStudentNumber(student.number),
    leadId: student.leadId,
    firstName: student.firstName,
    lastName: student.lastName,
    phone: student.phone,
    parentPhone: student.parentPhone,
    telegram: student.telegram,
    email: student.email,
    birthDate: student.birthDate ? toDateOnly(student.birthDate) : null,
    gender: student.gender,
    address: student.address,
    contractNumber: student.contractNumber,
    contractPrice: student.contractPrice.toNumber(),
    startDate: toDateOnly(student.startDate),
    status: student.status,
    notes: student.notes,
    createdAt: student.createdAt.toISOString(),
    course: student.course,
    group: student.group,
    debt: student.debt
      ? {
          total: student.debt.totalAmount.toNumber(),
          paid: student.debt.paidAmount.toNumber(),
          remaining: student.debt.remainingAmount.toNumber(),
          status: student.debt.status,
        }
      : null,
  };
}

export type StudentStatusSummary = Record<StudentStatus | 'ALL', number>;

export function debtStatusOf(total: number, paid: number): DebtStatus {
  if (paid <= 0) return 'UNPAID';
  return paid >= total ? 'PAID' : 'PARTIAL';
}

export interface StudentAccess {
  userId: string;
  canManage: boolean;
  /** O‘qituvchi faqat o‘zi dars beradigan guruh o‘quvchilarini ko‘radi */
  onlyOwnGroups: boolean;
}

async function getStudentAccess(actor: AuthUser): Promise<StudentAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  const canManage = permissions.has(PERMISSIONS.STUDENT_MANAGE);
  return {
    userId: actor.id,
    canManage,
    onlyOwnGroups: !canManage && permissions.has(PERMISSIONS.ATTENDANCE_MARK),
  };
}

function buildWhere(access: StudentAccess, query: Partial<StudentListQuery>): Prisma.StudentWhereInput {
  const conditions: Prisma.StudentWhereInput[] = [];
  if (access.onlyOwnGroups) conditions.push({ group: { teacherId: access.userId } });
  if (query.status) conditions.push({ status: query.status });
  if (query.courseId) conditions.push({ courseId: query.courseId });
  if (query.groupId) conditions.push({ groupId: query.groupId });

  for (const term of splitSearchTerms(query.search)) {
    const or: Prisma.StudentWhereInput[] = [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { contractNumber: { contains: term, mode: 'insensitive' } },
    ];
    const digits = term.replace(/\D/g, '');
    if (digits.length >= 2) {
      or.push({ phone: { contains: digits } }, { parentPhone: { contains: digits } });
    }
    const numberMatch = /^(?:st-?)?0*(\d{1,9})$/i.exec(term);
    if (numberMatch?.[1]) or.push({ number: Number(numberMatch[1]) });
    conditions.push({ OR: or });
  }

  return { deletedAt: null, AND: conditions };
}

function buildOrderBy(sortBy: StudentListQuery['sortBy'], sortOrder: StudentListQuery['sortOrder']): Prisma.StudentOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'firstName':
      return [{ firstName: sortOrder }, { lastName: sortOrder }];
    case 'startDate':
      return [{ startDate: sortOrder }, { id: 'asc' }];
    case 'number':
      return [{ number: sortOrder }];
    case 'createdAt':
      return [{ createdAt: sortOrder }, { id: 'asc' }];
  }
}

async function findVisibleStudent(access: StudentAccess, id: string): Promise<StudentRecord> {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
    select: studentSelect,
  });
  if (!student) {
    throw AppError.notFound('O‘quvchi topilmadi');
  }
  return student;
}

/**
 * Kurs, guruh va shartnoma raqamini tekshiradi. Guruh tanlangan bo‘lsa:
 * u shu kursga tegishli bo‘lishi va bo‘sh o‘rni bo‘lishi kerak.
 */
async function resolvePlacement(input: {
  courseId: string;
  groupId: string | undefined;
  contractNumber: string | undefined;
  exceptStudentId?: string;
}): Promise<{ finalPrice: number }> {
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true, finalPrice: true } });
  if (!course) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'courseId', message: 'Kurs topilmadi' }]);
  }

  if (input.groupId) {
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true, name: true, courseId: true, capacity: true, _count: { select: { students: { where: { deletedAt: null } } } } },
    });
    if (!group) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'groupId', message: 'Guruh topilmadi' }]);
    }
    if (group.courseId !== input.courseId) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'groupId', message: 'Bu guruh tanlangan kursga tegishli emas' },
      ]);
    }
    const alreadyInGroup = input.exceptStudentId
      ? await prisma.student.count({ where: { id: input.exceptStudentId, groupId: input.groupId } })
      : 0;
    if (group._count.students - alreadyInGroup >= group.capacity) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'groupId', message: `«${group.name}» guruhida bo‘sh o‘rin yo‘q` },
      ]);
    }
  }

  if (input.contractNumber) {
    const existing = await prisma.student.findUnique({ where: { contractNumber: input.contractNumber }, select: { id: true } });
    if (existing && existing.id !== input.exceptStudentId) {
      throw AppError.conflict('Bunday shartnoma raqami allaqachon mavjud', [
        { field: 'contractNumber', message: 'Bu raqam band' },
      ]);
    }
  }

  return { finalPrice: course.finalPrice.toNumber() };
}

export const studentService = {
  async list(actor: AuthUser, query: StudentListQuery): Promise<{ items: StudentDto[]; total: number }> {
    const access = await getStudentAccess(actor);
    const where = buildWhere(access, query);
    const items = await prisma.student.findMany({
      where,
      select: studentSelect,
      orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.student.count({ where });
    return { items: items.map(toStudentDto), total };
  },

  /** Filtrga mos o‘quvchilar — eksport uchun (sahifalashsiz, EXPORT_ROW_LIMIT gacha) */
  async exportTable(actor: AuthUser, query: StudentListQuery): Promise<ExportTable> {
    const access = await getStudentAccess(actor);
    const where = buildWhere(access, query);
    const records = await prisma.student.findMany({
      where,
      select: studentSelect,
      orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      take: EXPORT_ROW_LIMIT,
    });
    const total = await prisma.student.count({ where });

    const columns: ExportColumn[] = [
      { key: 'code', label: 'ID', type: 'text' },
      { key: 'name', label: 'O‘quvchi', type: 'text' },
      { key: 'phone', label: 'Telefon', type: 'text' },
      { key: 'parentPhone', label: 'Ota-ona telefoni', type: 'text' },
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'group', label: 'Guruh', type: 'text' },
      { key: 'status', label: 'Holat', type: 'text' },
      { key: 'startDate', label: 'Boshlagan sana', type: 'date' },
      { key: 'contractPrice', label: 'Shartnoma summasi', type: 'money' },
      { key: 'paid', label: 'To‘langan', type: 'money' },
      { key: 'remaining', label: 'Qarz', type: 'money' },
    ];
    const rows = records.map(toStudentDto).map((student) => ({
      code: student.code,
      name: `${student.firstName} ${student.lastName}`,
      phone: student.phone,
      parentPhone: student.parentPhone,
      course: student.course.name,
      group: student.group?.name ?? null,
      status: STUDENT_STATUS_LABELS[student.status],
      startDate: student.startDate,
      contractPrice: student.contractPrice,
      paid: student.debt?.paid ?? 0,
      remaining: student.debt?.remaining ?? 0,
    }));
    return { title: 'O‘quvchilar', subtitle: exportSubtitle(rows.length, total), columns, rows, totals: sumColumns(columns, rows) };
  },

  /** Holatlar bo‘yicha sonlar (tablar uchun) — status filtridan tashqari barcha filtrlarni hisobga oladi. */
  async summary(actor: AuthUser, query: StudentListQuery): Promise<StudentStatusSummary> {
    const access = await getStudentAccess(actor);
    const groups = await prisma.student.groupBy({
      by: ['status'],
      where: buildWhere(access, { ...query, status: undefined }),
      _count: { _all: true },
    });
    const summary = Object.fromEntries([['ALL', 0], ...STUDENT_STATUS_ORDER.map((item) => [item, 0])]) as StudentStatusSummary;
    for (const group of groups) {
      summary[group.status] = group._count._all;
      summary.ALL += group._count._all;
    }
    return summary;
  },

  async getById(actor: AuthUser, id: string): Promise<StudentDto> {
    const access = await getStudentAccess(actor);
    return toStudentDto(await findVisibleStudent(access, id));
  },

  async create(actor: AuthUser, input: CreateStudentInput, client: ClientInfo): Promise<StudentDto> {
    const { finalPrice } = await resolvePlacement({
      courseId: input.courseId,
      groupId: input.groupId,
      contractNumber: input.contractNumber,
    });
    const contractPrice = input.contractPrice ?? finalPrice;

    const created = await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          parentPhone: input.parentPhone ?? null,
          telegram: input.telegram ?? null,
          email: input.email ?? null,
          birthDate: input.birthDate ?? null,
          gender: input.gender ?? null,
          address: input.address ?? null,
          courseId: input.courseId,
          groupId: input.groupId ?? null,
          contractNumber: input.contractNumber ?? null,
          contractPrice,
          startDate: input.startDate,
          notes: input.notes ?? null,
          createdById: actor.id,
          // Har bir o‘quvchi uchun balans yozuvi darhol ochiladi
          debt: {
            create: { totalAmount: contractPrice, paidAmount: 0, remainingAmount: contractPrice, status: 'UNPAID' },
          },
        },
        select: studentSelect,
      });
      // Standart to'lov jadvali: kurs davomiyligi bo'yicha oylik qismlar (keyin qo'lda o'zgartiriladi)
      const course = await tx.course.findUniqueOrThrow({ where: { id: input.courseId }, select: { durationMonths: true } });
      await createDefaultSchedule(tx, { studentId: student.id, total: contractPrice, months: course.durationMonths, startDate: input.startDate });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.created',
        entityType: 'student',
        entityId: student.id,
        metadata: { number: student.number, courseId: input.courseId, contractPrice },
        ...client,
      });
      return student;
    });

    return toStudentDto(created);
  },

  async update(actor: AuthUser, id: string, input: UpdateStudentInput, client: ClientInfo): Promise<StudentDto> {
    const access = await getStudentAccess(actor);
    const student = await findVisibleStudent(access, id);
    const { finalPrice } = await resolvePlacement({
      courseId: input.courseId,
      groupId: input.groupId,
      contractNumber: input.contractNumber,
      exceptStudentId: id,
    });
    const contractPrice = input.contractPrice ?? finalPrice;
    const paid = student.debt?.paidAmount.toNumber() ?? 0;

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.student.update({
        where: { id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          parentPhone: input.parentPhone ?? null,
          telegram: input.telegram ?? null,
          email: input.email ?? null,
          birthDate: input.birthDate ?? null,
          gender: input.gender ?? null,
          address: input.address ?? null,
          courseId: input.courseId,
          groupId: input.groupId ?? null,
          contractNumber: input.contractNumber ?? null,
          contractPrice,
          startDate: input.startDate,
          notes: input.notes ?? null,
        },
        select: studentSelect,
      });

      // Shartnoma narxi o‘zgarsa, qarzdorlik qayta hisoblanadi (to‘langan summa saqlanadi)
      if (contractPrice !== student.contractPrice.toNumber()) {
        await tx.debt.update({
          where: { studentId: id },
          data: {
            totalAmount: contractPrice,
            remainingAmount: Math.max(contractPrice - paid, 0),
            status: debtStatusOf(contractPrice, paid),
          },
        });
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.updated',
        entityType: 'student',
        entityId: id,
        metadata: { priceFrom: student.contractPrice.toNumber(), priceTo: contractPrice },
        ...client,
      });
      return record;
    });

    return toStudentDto(await prisma.student.findUniqueOrThrow({ where: { id: updated.id }, select: studentSelect }));
  },

  async setStatus(actor: AuthUser, id: string, input: UpdateStudentStatusInput, client: ClientInfo): Promise<StudentDto> {
    const access = await getStudentAccess(actor);
    const student = await findVisibleStudent(access, id);
    if (student.status === input.status) {
      return toStudentDto(student);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.student.update({
        where: { id },
        data: { status: input.status, statusChangedAt: new Date() },
        select: studentSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.status_changed',
        entityType: 'student',
        entityId: id,
        metadata: { from: student.status, to: input.status },
        ...client,
      });
      return record;
    });

    return toStudentDto(updated);
  },

  /** Soft delete — to‘lovlar va davomat tarixi saqlanib qoladi, guruhdagi o‘rni bo‘shaydi. */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getStudentAccess(actor);
    const student = await findVisibleStudent(access, id);

    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: { deletedAt: new Date() } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.deleted',
        entityType: 'student',
        entityId: id,
        metadata: { number: student.number, name: `${student.firstName} ${student.lastName}` },
        ...client,
      });
    });
  },

  /**
   * Leadni o‘quvchiga aylantiradi: ma'lumotlar leaddan ko‘chiriladi, shartnoma narxi esa
   * aylantirilgan paytdagi kurs narxidan olinadi (kurs narxi keyin o‘zgarsa ham shartnoma buzilmaydi).
   */
  async convertFromLead(actor: AuthUser, leadId: string, input: ConvertLeadInput, client: ClientInfo): Promise<StudentDto> {
    const leadAccess = await getLeadAccess(actor);
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, ...visibleLeadFilter(leadAccess) },
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        phone: true,
        telegram: true,
        email: true,
        gender: true,
        address: true,
        courseId: true,
        status: true,
        assignedToId: true,
        student: { select: { id: true } },
      },
    });
    if (!lead) {
      throw AppError.notFound('Lead topilmadi');
    }
    if (lead.student) {
      throw AppError.conflict('Bu lead allaqachon o‘quvchiga aylantirilgan');
    }

    const courseId = input.courseId ?? lead.courseId;
    if (!courseId) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'courseId', message: 'Kursni tanlang' }]);
    }

    const { finalPrice } = await resolvePlacement({
      courseId,
      groupId: input.groupId,
      contractNumber: input.contractNumber,
    });
    const contractPrice = input.contractPrice ?? finalPrice;
    const startDate = input.startDate ?? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const studentId = await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          leadId: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName ?? lead.firstName,
          phone: lead.phone,
          parentPhone: input.parentPhone ?? null,
          telegram: lead.telegram,
          email: lead.email,
          gender: lead.gender,
          address: lead.address,
          courseId,
          groupId: input.groupId ?? null,
          contractNumber: input.contractNumber ?? null,
          contractPrice,
          startDate,
          createdById: actor.id,
          debt: {
            create: { totalAmount: contractPrice, paidAmount: 0, remainingAmount: contractPrice, status: 'UNPAID' },
          },
        },
        select: { id: true, number: true },
      });

      const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { durationMonths: true } });
      await createDefaultSchedule(tx, { studentId: student.id, total: contractPrice, months: course.durationMonths, startDate });

      await tx.lead.update({ where: { id: lead.id }, data: { status: 'WON', convertedAt: new Date() } });

      // Leadni olib kelgan manager o‘quvchiga aylantirilganini bilib tursin
      if (lead.assignedToId && lead.assignedToId !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: lead.assignedToId,
          type: 'NEW_STUDENT',
          title: 'Lead o‘quvchiga aylantirildi',
          message: `${lead.firstName} ${lead.lastName ?? ''} (${formatStudentNumber(student.number)}) — shartnoma ${contractPrice.toLocaleString('uz-UZ')} so‘m`,
          entityType: 'student',
          entityId: student.id,
          dedupeKey: `student-created:${student.id}`,
        });
      }
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: actor.id,
          type: 'CONVERTED_TO_STUDENT',
          description: `O‘quvchiga aylantirildi (${formatStudentNumber(student.number)})`,
          metadata: { studentId: student.id, contractPrice },
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.converted_from_lead',
        entityType: 'student',
        entityId: student.id,
        metadata: { leadId: lead.id, leadNumber: formatLeadNumber(lead.number), contractPrice },
        ...client,
      });
      return student.id;
    });

    return toStudentDto(await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: studentSelect }));
  },
};
