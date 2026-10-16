import { randomUUID } from 'node:crypto';
import { notifyStudentAudience } from './studentNotify.service.js';
import { prisma } from '../config/database.js';
import { formatLeadNumber } from '../config/leadLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import { STUDENT_STATUS_ORDER, formatStudentNumber } from '../config/studentLabels.js';
import type { DebtStatus, Gender, Prisma, RiskLevel, StudentStatus } from '../generated/prisma/client.js';
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
import { lockStudentContract } from './debtLock.js';
import { branchFilter, getBranchAccess, resolveBranchId } from './branchAccess.js';
import type { BranchAccess } from './branchAccess.js';
import { getLeadAccess, visibleLeadFilter } from './leadAccess.js';
import { notificationService } from './notification.service.js';
import { permissionService } from './permission.service.js';
import { EXPORT_ROW_LIMIT, exportSubtitle, sumColumns } from '../utils/tableExport.js';
import type { ExportColumn, ExportTable } from '../utils/tableExport.js';
import { STUDENT_STATUS_LABELS } from '../config/studentLabels.js';
import { createDefaultSchedule } from './paymentSchedule.service.js';
import { referralService } from './referral.service.js';
import { groupChangeSelect, recordGroupChange, toGroupChangeDtos } from './studentGroupHistory.js';
import type { GroupChangeDto } from './studentGroupHistory.js';
import type { AddStudentGroupInput, RemoveStudentGroupInput, StudentMessageInput, TransferStudentGroupInput } from '../validators/student.validator.js';
import { moneyUz } from '../utils/money.js';
import { isRosterLimited } from './teachingAccess.js';
import { gamificationHooks } from './gamification.service.js';
import { ACTIVE_MEMBERSHIP, groupOccupancy, studentInGroup, studentTaughtBy } from './groupMembership.js';

export const studentSelect = {
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
  discountTotal: true,
  referralCode: true,
  startDate: true,
  status: true,
  statusChangedAt: true,
  userId: true,
  healthScore: true,
  riskLevel: true,
  riskUpdatedAt: true,
  notes: true,
  createdAt: true,
  course: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  // Qo'shimcha (o'quv) guruhlar — moliyaga ta'sir qilmaydi
  groupMemberships: {
    where: ACTIVE_MEMBERSHIP,
    orderBy: { joinedAt: 'asc' },
    select: {
      id: true,
      joinedAt: true,
      group: {
        select: {
          id: true,
          name: true,
          scheduleDays: true,
          startTime: true,
          endTime: true,
          course: { select: { id: true, name: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  },
  debt: { select: { totalAmount: true, paidAmount: true, remainingAmount: true, status: true } },
} satisfies Prisma.StudentSelect;

type StudentRecord = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

export interface StatusChangeDto {
  id: string;
  fromStatus: StudentStatus;
  toStatus: StudentStatus;
  reason: string | null;
  changedAt: string;
  changedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface StudentDto {
  id: string;
  number: number;
  code: string;
  leadId: string | null;
  firstName: string;
  lastName: string;
  /** O'quvchi yoki ota-ona telefonidan kamida bittasi bor */
  phone: string | null;
  parentPhone: string | null;
  telegram: string | null;
  email: string | null;
  birthDate: string | null;
  gender: Gender | null;
  address: string | null;
  contractNumber: string | null;
  /** Chegirmalar hisobga olingan shartnoma summasi */
  contractPrice: number;
  /** Faol chegirmalar yig‘indisi (chegirmasiz narx = contractPrice + discountTotal) */
  discountTotal: number;
  /** Do‘stini taklif qilish kodi */
  referralCode: string | null;
  startDate: string;
  status: StudentStatus;
  /** Xavf darajasi — holatdan mustaqil o‘lchov (`studentRisk.service.ts`) */
  riskLevel: RiskLevel | null;
  healthScore: number | null;
  riskUpdatedAt: string | null;
  /** Kabinet hisobi ochilganmi (parol qayta ko‘rsatilmaydi, faqat holat) */
  hasPortalAccount: boolean;
  notes: string | null;
  createdAt: string;
  course: { id: string; name: string };
  /** Asosiy guruh — to'lov va o'qituvchi foizi shunga yoziladi */
  group: { id: string; name: string } | null;
  /** Qo'shimcha o'quv guruhlari (masalan, PMT ikkinchi fani) — alohida shartnoma yoki qarz yaratmaydi */
  extraGroups: Array<{
    membershipId: string;
    joinedAt: string;
    id: string;
    name: string;
    course: { id: string; name: string };
    teacher: { id: string; firstName: string; lastName: string } | null;
    scheduleDays: string[];
    startTime: string;
    endTime: string;
  }>;
  debt: { total: number; paid: number; remaining: number; status: DebtStatus } | null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toStudentDto(student: StudentRecord): StudentDto {
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
    riskLevel: student.riskLevel,
    healthScore: student.healthScore,
    riskUpdatedAt: student.riskUpdatedAt?.toISOString() ?? null,
    hasPortalAccount: student.userId !== null,
    birthDate: student.birthDate ? toDateOnly(student.birthDate) : null,
    gender: student.gender,
    address: student.address,
    contractNumber: student.contractNumber,
    contractPrice: student.contractPrice.toNumber(),
    discountTotal: student.discountTotal.toNumber(),
    referralCode: student.referralCode,
    startDate: toDateOnly(student.startDate),
    status: student.status,
    notes: student.notes,
    createdAt: student.createdAt.toISOString(),
    course: student.course,
    group: student.group,
    extraGroups: student.groupMemberships.map((membership) => ({
      membershipId: membership.id,
      joinedAt: membership.joinedAt.toISOString(),
      id: membership.group.id,
      name: membership.group.name,
      course: membership.group.course,
      teacher: membership.group.teacher,
      scheduleDays: membership.group.scheduleDays,
      startTime: membership.group.startTime,
      endTime: membership.group.endTime,
    })),
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
  /** Filial doirasi — `branch.view_all` bo‘lmasa faqat o‘z filiali */
  branch: BranchAccess;
}

async function getStudentAccess(actor: AuthUser): Promise<StudentAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  const canManage = permissions.has(PERMISSIONS.STUDENT_MANAGE);
  return {
    userId: actor.id,
    canManage,
    onlyOwnGroups: isRosterLimited(permissions, PERMISSIONS.STUDENT_MANAGE),
    branch: await getBranchAccess(actor),
  };
}

function buildWhere(access: StudentAccess, query: Partial<StudentListQuery>): Prisma.StudentWhereInput {
  const conditions: Prisma.StudentWhereInput[] = [];
  conditions.push(branchFilter(access.branch, query.branchId));
  if (access.onlyOwnGroups) conditions.push(studentTaughtBy(access.userId));
  if (query.status) conditions.push({ status: query.status });
  if (query.riskLevel) conditions.push({ riskLevel: query.riskLevel });
  if (query.courseId) conditions.push({ courseId: query.courseId });
  if (query.groupId) conditions.push(studentInGroup(query.groupId));
  if (query.teacherId) conditions.push(studentTaughtBy(query.teacherId));

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
    where: { id, deletedAt: null, ...(access.onlyOwnGroups ? studentTaughtBy(access.userId) : {}) },
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
      select: { id: true, name: true, courseId: true, capacity: true },
    });
    if (!group) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'groupId', message: 'Guruh topilmadi' }]);
    }
    if (group.courseId !== input.courseId) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'groupId', message: 'Bu guruh tanlangan kursga tegishli emas' },
      ]);
    }
    // O'quvchi shu guruhda allaqachon (asosiy yoki qo'shimcha) bo'lsa — o'rni hisobda bor
    const alreadyInGroup = input.exceptStudentId
      ? await prisma.student.count({ where: { id: input.exceptStudentId, ...studentInGroup(input.groupId) } })
      : 0;
    if ((await groupOccupancy(prisma, input.groupId)) - alreadyInGroup >= group.capacity) {
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

/**
 * Taklif kodi o'quvchi raqamidan hosil bo'ladi (ST-45 -> R00045): takrorlanmaydi, o'zgarmaydi
 * va og'zaki aytish oson. Raqam faqat yozuvdan keyin ma'lum bo'lgani uchun shu yerda yoziladi.
 */
async function assignReferralCode(tx: Prisma.TransactionClient, studentId: string, number: number): Promise<void> {
  await tx.student.update({ where: { id: studentId }, data: { referralCode: `R${String(number).padStart(5, '0')}` } });
}

/** Qo'shimcha a'zolikni yopish (yozuv o'chirilmaydi — tarix uchun leftAt) */
async function closeExtraMembership(tx: Prisma.TransactionClient, studentId: string, groupId: string, actorId: string, reason: string): Promise<void> {
  await tx.studentGroupMembership.updateMany({
    where: { studentId, groupId, ...ACTIVE_MEMBERSHIP },
    data: { leftAt: new Date(), removedById: actorId, leftReason: reason },
  });
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
          phone: input.phone ?? null,
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
          branchId: resolveBranchId(await getBranchAccess(actor)),
          // Har bir o‘quvchi uchun balans yozuvi darhol ochiladi
          debt: {
            create: { totalAmount: contractPrice, paidAmount: 0, remainingAmount: contractPrice, status: 'UNPAID' },
          },
        },
        select: studentSelect,
      });
      await assignReferralCode(tx, student.id, student.number);
      // Standart to'lov jadvali: kurs davomiyligi bo'yicha oylik qismlar (keyin qo'lda o'zgartiriladi)
      const course = await tx.course.findUniqueOrThrow({ where: { id: input.courseId }, select: { durationMonths: true } });
      await createDefaultSchedule(tx, { studentId: student.id, total: contractPrice, months: course.durationMonths, startDate: input.startDate });
      await recordGroupChange(tx, { studentId: student.id, fromGroupId: null, toGroupId: input.groupId ?? null, reason: 'O‘quvchi qo‘shildi', changedById: actor.id });
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

    const updated = await prisma.$transaction(async (tx) => {
      // To'langan summa va joriy narx qulf ostida o'qiladi — parallel to'lov yoki chegirma bilan qarz
      // eskirgan qiymatda yozilib qolmaydi
      const locked = await lockStudentContract(tx, id);
      const paid = locked.debt?.paidAmount ?? 0;
      const record = await tx.student.update({
        where: { id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
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
      if (contractPrice !== locked.contractPrice) {
        await tx.debt.update({
          where: { studentId: id },
          data: {
            totalAmount: contractPrice,
            remainingAmount: Math.max(contractPrice - paid, 0),
            status: debtStatusOf(contractPrice, paid),
          },
        });
      }

      await recordGroupChange(tx, {
        studentId: id,
        fromGroupId: student.group?.id ?? null,
        toGroupId: input.groupId ?? null,
        reason: 'Ma’lumotlarni tahrirlash orqali',
        changedById: actor.id,
      });
      if (input.groupId) await closeExtraMembership(tx, id, input.groupId, actor.id, 'Asosiy guruhga aylantirildi');

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.updated',
        entityType: 'student',
        entityId: id,
        before: { contractPrice: student.contractPrice.toNumber(), status: student.status, groupId: student.group?.id ?? null },
        after: { contractPrice, status: record.status, groupId: input.groupId ?? null },
        ...client,
      });
      return record;
    });

    return toStudentDto(await prisma.student.findUniqueOrThrow({ where: { id: updated.id }, select: studentSelect }));
  },

  /** Holat tarixi: kim, qachon, nimadan nimaga va nima sababdan o‘zgartirgan */
  async statusHistory(actor: AuthUser, id: string): Promise<StatusChangeDto[]> {
    const access = await getStudentAccess(actor);
    await findVisibleStudent(access, id);
    const rows = await prisma.studentStatusChange.findMany({
      where: { studentId: id },
      orderBy: { changedAt: 'asc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        changedAt: true,
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      reason: row.reason,
      changedAt: row.changedAt.toISOString(),
      changedBy: row.changedBy,
    }));
  },

  /** Xavf ostidagi o‘quvchilar — eng past balldan boshlab (dashboard vidjeti va ro‘yxat uchun) */
  async atRisk(actor: AuthUser, query: { levels?: RiskLevel[]; limit: number }): Promise<StudentDto[]> {
    const access = await getStudentAccess(actor);
    const where = buildWhere(access, {});
    const rows = await prisma.student.findMany({
      where: {
        ...where,
        riskLevel: { in: query.levels ?? ['CRITICAL', 'AT_RISK'] },
        status: { in: ['ACTIVE', 'FROZEN'] },
      },
      select: studentSelect,
      orderBy: [{ healthScore: 'asc' }, { riskUpdatedAt: 'desc' }],
      take: query.limit,
    });
    return rows.map(toStudentDto);
  },

  async groupHistory(actor: AuthUser, id: string): Promise<GroupChangeDto[]> {
    const access = await getStudentAccess(actor);
    await findVisibleStudent(access, id);
    const rows = await prisma.studentGroupChange.findMany({
      where: { studentId: id },
      orderBy: { changedAt: 'asc' },
      select: groupChangeSelect,
    });
    return toGroupChangeDtos(rows);
  },

  /**
   * Xodimdan bitta o'quvchiga yoki ota-onasiga xabar: kabinet hisobi bo'lsa ilova ichida, bog'langan Telegram bo'lsa botda.
   * Hech bir kanal bo'lmasa — 409 (xabar "yuborildi" deb ko'rinib, hech kimga yetmay qolmasin). Amal auditga yoziladi.
   */
  async sendMessage(actor: AuthUser, id: string, input: StudentMessageInput, client: ClientInfo): Promise<{ recipients: number }> {
    const access = await getStudentAccess(actor);
    const student = await findVisibleStudent(access, id);
    const key = `staff-message:${randomUUID()}`;
    const audiences = input.audience === 'BOTH' ? (['STUDENT', 'PARENT'] as const) : ([input.audience] as const);

    const recipients = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const audience of audiences) {
        count += await notifyStudentAudience(tx, {
          studentId: student.id,
          audience,
          type: 'SYSTEM',
          title: input.title,
          message: input.message,
          entityType: 'student',
          entityId: student.id,
          dedupeKey: `${key}:${audience}`,
        });
      }
      if (count === 0) {
        throw AppError.conflict('Xabar yuborilmadi: qabul qiluvchida kabinet hisobi ham, bog‘langan Telegram ham yo‘q');
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.message_sent',
        entityType: 'student',
        entityId: student.id,
        metadata: { audience: input.audience, title: input.title, recipients: count },
        ...client,
      });
      return count;
    });
    return { recipients };
  },

  /**
   * Boshqa guruhga o‘tkazish yoki guruhdan chiqarish: istalgan ochiq (rejalashtirilgan yoki faol) guruhga,
   * bo‘sh o‘rin bo‘lsa, sabab bilan. Guruh boshqa kursniki bo‘lsa — o‘quvchining kursi ham o‘sha kursga
   * o‘zgaradi (tahrirlashdagi kabi shartnoma narxi o‘zgarmaydi). Qabul qilingan to‘lovlar va o‘qituvchi
   * foizi o‘z guruhida qoladi.
   */
  async transferGroup(actor: AuthUser, id: string, input: TransferStudentGroupInput, client: ClientInfo): Promise<StudentDto> {
    const access = await getStudentAccess(actor);
    const student = await findVisibleStudent(access, id);
    const fromGroupId = student.group?.id ?? null;
    const toGroupId = input.groupId;
    if (fromGroupId === toGroupId) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'groupId', message: toGroupId ? 'O‘quvchi allaqachon shu guruhda' : 'O‘quvchi hech qaysi guruhda emas' },
      ]);
    }

    await prisma.$transaction(async (tx) => {
      let toGroupName: string | null = null;
      let toCourseId: string | null = null;
      if (toGroupId) {
        // Guruh qatori qulflanadi: bir vaqtda bir nechta o'quvchi o'tkazilsa ham sig'imdan oshmaydi
        const [group] = await tx.$queryRaw<Array<{ id: string; name: string; courseId: string; capacity: number; status: string }>>`
          SELECT "id", "name", "courseId", "capacity", "status"::text AS "status" FROM "groups" WHERE "id" = ${toGroupId} FOR UPDATE
        `;
        const invalid = (message: string) => AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'groupId', message }]);
        if (!group) throw invalid('Guruh topilmadi');
        if (group.courseId !== student.course.id) toCourseId = group.courseId;
        if (group.status !== 'PLANNED' && group.status !== 'ACTIVE') {
          throw invalid(`«${group.name}» guruhi yopilgan — faqat rejalashtirilgan yoki faol guruhga o‘tkaziladi`);
        }
        const extraMembership = await tx.studentGroupMembership.findFirst({ where: { studentId: id, groupId: toGroupId, ...ACTIVE_MEMBERSHIP }, select: { id: true } });
        const occupied = (await groupOccupancy(tx, toGroupId)) - (extraMembership ? 1 : 0);
        if (occupied >= Number(group.capacity)) {
          throw invalid(`«${group.name}» guruhida bo‘sh o‘rin yo‘q`);
        }
        toGroupName = group.name;
      }

      await tx.student.update({ where: { id }, data: { groupId: toGroupId, ...(toCourseId ? { courseId: toCourseId } : {}) } });
      // Qo'shimcha guruh asosiyga aylandi — qo'shimcha a'zolik yopiladi (ikki marta sanalmaydi)
      if (toGroupId) await closeExtraMembership(tx, id, toGroupId, actor.id, 'Asosiy guruhga aylantirildi');
      await recordGroupChange(tx, { studentId: id, fromGroupId, toGroupId, reason: input.reason, changedById: actor.id });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.group_changed',
        entityType: 'student',
        entityId: id,
        metadata: {
          from: student.group?.name ?? null,
          to: toGroupName,
          reason: input.reason,
          ...(toCourseId ? { courseFrom: student.course.id, courseTo: toCourseId } : {}),
        },
        ...client,
      });
    });

    return toStudentDto(await prisma.student.findUniqueOrThrow({ where: { id }, select: studentSelect }));
  },

  /**
   * Qo'shimcha o'quv guruhiga qo'shish. Asosiy guruh, shartnoma, qarz va to'lovlar o'zgarmaydi — bitta
   * umumiy oylik to'lov saqlanadi. Guruh qatori qulflanadi (sig'im), takroriy faol a'zolik bazadagi
   * partial unique index bilan ham to'xtatiladi (parallel so'rovlar).
   */
  async addGroup(actor: AuthUser, id: string, input: AddStudentGroupInput, client: ClientInfo): Promise<StudentDto> {
    const access = await getStudentAccess(actor);
    const student = await findVisibleStudent(access, id);
    const invalid = (message: string) => AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'groupId', message }]);
    if (student.group?.id === input.groupId) throw invalid('Bu o‘quvchining asosiy guruhi');

    try {
      await prisma.$transaction(async (tx) => {
        const [group] = await tx.$queryRaw<Array<{ id: string; name: string; capacity: number; status: string }>>`
          SELECT "id", "name", "capacity", "status"::text AS "status" FROM "groups" WHERE "id" = ${input.groupId} FOR UPDATE
        `;
        if (!group) throw invalid('Guruh topilmadi');
        if (group.status !== 'PLANNED' && group.status !== 'ACTIVE') {
          throw invalid(`«${group.name}» guruhi yopilgan — faqat rejalashtirilgan yoki faol guruhga qo‘shiladi`);
        }
        const existing = await tx.studentGroupMembership.findFirst({ where: { studentId: id, groupId: group.id, ...ACTIVE_MEMBERSHIP }, select: { id: true } });
        if (existing) throw AppError.conflict(`O‘quvchi allaqachon «${group.name}» guruhida`, [{ field: 'groupId', message: 'O‘quvchi allaqachon shu guruhda' }]);
        if ((await groupOccupancy(tx, group.id)) >= Number(group.capacity)) throw invalid(`«${group.name}» guruhida bo‘sh o‘rin yo‘q`);

        await tx.studentGroupMembership.create({
          data: { studentId: id, groupId: group.id, reason: input.reason ?? null, addedById: actor.id },
        });
        // Tarix va ochiq vazifalar — mavjud guruh tarixi mexanizmi orqali
        await recordGroupChange(tx, { studentId: id, fromGroupId: null, toGroupId: group.id, reason: input.reason ?? 'Qo‘shimcha guruhga qo‘shildi', changedById: actor.id });
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'student.group_added',
          entityType: 'student',
          entityId: id,
          metadata: { group: group.name, primaryGroup: student.group?.name ?? null, reason: input.reason ?? null },
          ...client,
        });
      });
    } catch (error) {
      // Bir vaqtda ikki so'rov: ikkinchisini partial unique index to'xtatadi
      if ((error as { code?: string }).code === 'P2002') {
        throw AppError.conflict('O‘quvchi allaqachon shu guruhda', [{ field: 'groupId', message: 'O‘quvchi allaqachon shu guruhda' }]);
      }
      throw error;
    }
    return toStudentDto(await prisma.student.findUniqueOrThrow({ where: { id }, select: studentSelect }));
  },

  /** Qo'shimcha guruhdan chiqarish: a'zolik yopiladi (tarix saqlanadi), boshqa guruhlar va profil o'zgarmaydi */
  async removeGroup(actor: AuthUser, id: string, groupId: string, input: RemoveStudentGroupInput, client: ClientInfo): Promise<StudentDto> {
    const access = await getStudentAccess(actor);
    const student = await findVisibleStudent(access, id);
    if (student.group?.id === groupId) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'groupId', message: 'Asosiy guruh “Guruhga o‘tkazish” orqali o‘zgartiriladi' },
      ]);
    }
    const membership = await prisma.studentGroupMembership.findFirst({
      where: { studentId: id, groupId, ...ACTIVE_MEMBERSHIP },
      select: { id: true, group: { select: { name: true } } },
    });
    if (!membership) throw AppError.notFound('O‘quvchi bu qo‘shimcha guruhda emas');

    await prisma.$transaction(async (tx) => {
      const closed = await tx.studentGroupMembership.updateMany({
        where: { id: membership.id, ...ACTIVE_MEMBERSHIP },
        data: { leftAt: new Date(), removedById: actor.id, leftReason: input.reason },
      });
      if (closed.count === 0) throw AppError.conflict('A’zolik allaqachon yopilgan');
      await recordGroupChange(tx, { studentId: id, fromGroupId: groupId, toGroupId: null, reason: input.reason, changedById: actor.id });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.group_removed',
        entityType: 'student',
        entityId: id,
        metadata: { group: membership.group.name, reason: input.reason },
        ...client,
      });
    });
    return toStudentDto(await prisma.student.findUniqueOrThrow({ where: { id }, select: studentSelect }));
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
      // Holat tarixi — guruh tarixi bilan bir xil naqsh: kim, qachon, nimadan nimaga, nega
      await tx.studentStatusChange.create({
        data: {
          studentId: id,
          fromStatus: student.status,
          toStatus: input.status,
          reason: input.reason ?? null,
          changedById: actor.id,
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'student.status_changed',
        entityType: 'student',
        entityId: id,
        metadata: { from: student.status, to: input.status, reason: input.reason ?? null },
        ...client,
      });
      // Kurs tugatildi — COURSE_COMPLETED nishonlari darhol (keyingi davomatni kutmasdan)
      if (input.status === 'COMPLETED' || input.status === 'GRADUATED') await gamificationHooks.onMilestone(tx, id);
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
        parentPhone: true,
        telegram: true,
        email: true,
        gender: true,
        address: true,
        courseId: true,
        status: true,
        assignedToId: true,
        branchId: true,
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
          parentPhone: input.parentPhone ?? lead.parentPhone ?? null,
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
          branchId: lead.branchId,
          debt: {
            create: { totalAmount: contractPrice, paidAmount: 0, remainingAmount: contractPrice, status: 'UNPAID' },
          },
        },
        select: { id: true, number: true },
      });

      await assignReferralCode(tx, student.id, student.number);
      // Lead taklif kodi bilan kelgan bo'lsa, taklif "aylandi" holatiga o'tadi (bonus keyin qo'lda beriladi)
      await referralService.onLeadConverted(tx, lead.id, student.id);
      const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { durationMonths: true } });
      await createDefaultSchedule(tx, { studentId: student.id, total: contractPrice, months: course.durationMonths, startDate });
      await recordGroupChange(tx, {
        studentId: student.id,
        fromGroupId: null,
        toGroupId: input.groupId ?? null,
        reason: 'Leaddan o‘quvchiga aylantirildi',
        changedById: actor.id,
      });

      await tx.lead.update({ where: { id: lead.id }, data: { status: 'WON', convertedAt: new Date() } });

      // Leadni olib kelgan manager o‘quvchiga aylantirilganini bilib tursin
      if (lead.assignedToId && lead.assignedToId !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: lead.assignedToId,
          type: 'NEW_STUDENT',
          title: 'Lead o‘quvchiga aylantirildi',
          message: `${lead.firstName} ${lead.lastName ?? ''} (${formatStudentNumber(student.number)}) — shartnoma ${moneyUz(contractPrice)}`,
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
