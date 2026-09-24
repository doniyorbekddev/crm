import { prisma } from '../config/database.js';
import { employeesOnLeaveToday } from './employeeLeave.service.js';
import { branchFilter } from './branchAccess.js';
import type { EmployeePosition, EmployeeStatus, Prisma, SalaryPeriodStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { currentBusinessMonth } from '../utils/dates.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CreateEmployeeInput, EmployeeListQuery, UpdateEmployeeInput } from '../validators/employee.validator.js';
import { auditService } from './audit.service.js';
import { getBranchAccess, resolveBranchId } from './branchAccess.js';

/**
 * Xodimlar (HR) — o‘qituvchidan tashqari xodimlar (promt 52–55-bo‘limlar).
 * Maoshi umumiy payroll davri orqali hisoblanadi (salary.service), shu yerda faqat profil va holat.
 */

export interface EmployeeDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  department: string | null;
  position: EmployeePosition;
  /** salary.view ruxsati bo‘lmasa null */
  baseSalary: number | null;
  status: EmployeeStatus;
  hireDate: string;
  terminationDate: string | null;
  contractNumber: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  /** Shartnoma muddati tugashiga necha kun qolgani (muddatsiz bo‘lsa null) */
  contractDaysLeft: number | null;
  /** Bugun ta’tilda ekani — tasdiqlangan ta’til sanalaridan hisoblanadi */
  onLeaveToday: boolean;
  /**
   * Maxfiy ma’lumot: `employee.sensitive` ruxsati bo‘lmasa butun blok `null` bo‘ladi
   * (maydonlarni alohida yashirish o‘rniga — shunda “bo‘sh” va “ko‘rsatilmadi” farqlanadi).
   */
  sensitive: {
    birthDate: string | null;
    address: string | null;
    passportNumber: string | null;
    emergencyContact: string | null;
    emergencyPhone: string | null;
  } | null;
  note: string | null;
  createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string } | null;
  /** Joriy oy maoshi (hisoblangan bo‘lsa) */
  currentSalary: {
    id: string;
    year: number;
    month: number;
    status: SalaryPeriodStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  } | null;
}

export interface EmployeeCandidateDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
}

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  department: true,
  position: true,
  baseSalary: true,
  status: true,
  hireDate: true,
  terminationDate: true,
  contractNumber: true,
  contractStartDate: true,
  contractEndDate: true,
  birthDate: true,
  address: true,
  passportNumber: true,
  emergencyContact: true,
  emergencyPhone: true,
  note: true,
  createdAt: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

type EmployeeRecord = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const DAY_MS = 86_400_000;

async function withCurrentSalaries(records: EmployeeRecord[], salaryVisible = true, sensitiveVisible = false): Promise<EmployeeDto[]> {
  const { year, month } = currentBusinessMonth();
  const onLeave = await employeesOnLeaveToday(records.map((record) => record.id));
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const periods = records.length && salaryVisible
    ? await prisma.teacherSalaryPeriod.findMany({
        where: { employeeId: { in: records.map((record) => record.id) }, year, month },
        select: { id: true, employeeId: true, year: true, month: true, status: true, totalAmount: true, paidAmount: true, remainingAmount: true },
      })
    : [];

  return records.map((record) => {
    const period = periods.find((row) => row.employeeId === record.id);
    return {
      id: record.id,
      firstName: record.firstName,
      lastName: record.lastName,
      phone: record.phone,
      email: record.email,
      department: record.department,
      position: record.position,
      baseSalary: salaryVisible ? record.baseSalary.toNumber() : null,
      status: record.status,
      hireDate: toDateOnly(record.hireDate),
      terminationDate: record.terminationDate ? toDateOnly(record.terminationDate) : null,
      contractNumber: record.contractNumber,
      contractStartDate: record.contractStartDate ? toDateOnly(record.contractStartDate) : null,
      contractEndDate: record.contractEndDate ? toDateOnly(record.contractEndDate) : null,
      contractDaysLeft: record.contractEndDate
        ? Math.round((record.contractEndDate.getTime() - today.getTime()) / DAY_MS)
        : null,
      onLeaveToday: onLeave.has(record.id),
      sensitive: sensitiveVisible
        ? {
            birthDate: record.birthDate ? toDateOnly(record.birthDate) : null,
            address: record.address,
            passportNumber: record.passportNumber,
            emergencyContact: record.emergencyContact,
            emergencyPhone: record.emergencyPhone,
          }
        : null,
      note: record.note,
      createdAt: record.createdAt.toISOString(),
      user: record.user,
      currentSalary: period
        ? {
            id: period.id,
            year: period.year,
            month: period.month,
            status: period.status,
            totalAmount: period.totalAmount.toNumber(),
            paidAmount: period.paidAmount.toNumber(),
            remainingAmount: period.remainingAmount.toNumber(),
          }
        : null,
    };
  });
}

async function findOrFail(id: string): Promise<EmployeeRecord> {
  const employee = await prisma.employee.findUnique({ where: { id }, select: employeeSelect });
  if (!employee) {
    throw AppError.notFound('Xodim topilmadi');
  }
  return employee;
}

/** Akkaunt faqat bitta xodimga bog‘lanadi; o‘qituvchi akkaunti bog‘lanmaydi (maoshi o‘qituvchilar bo‘limida) */
async function assertUserLinkable(userId: string, exceptEmployeeId?: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, employee: { select: { id: true } }, teacherProfile: { select: { id: true } } },
  });
  if (!user) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'userId', message: 'Foydalanuvchi topilmadi' }]);
  }
  if (user.employee && user.employee.id !== exceptEmployeeId) {
    throw AppError.conflict('Bu foydalanuvchi boshqa xodimga bog‘langan', [{ field: 'userId', message: 'Allaqachon bog‘langan' }]);
  }
  if (user.teacherProfile) {
    throw AppError.conflict('Bu foydalanuvchi o‘qituvchi — maoshi o‘qituvchilar bo‘limida hisoblanadi', [
      { field: 'userId', message: 'O‘qituvchi akkaunti' },
    ]);
  }
}

function assertDates(status: EmployeeStatus, hireDate: Date, terminationDate: Date | null): void {
  if (status === 'RESIGNED' && !terminationDate) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'terminationDate', message: 'Ishdan ketgan sanani kiriting' }]);
  }
  if (terminationDate && terminationDate < hireDate) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
      { field: 'terminationDate', message: 'Ishdan ketgan sana ishga kirgan sanadan oldin bo‘lmasligi kerak' },
    ]);
  }
}

export const employeeService = {
  /** `salaryVisible: false` — maosh summalari (salary.view ruxsatisiz) qaytarilmaydi */
  async list(
    actor: AuthUser,
    query: EmployeeListQuery,
    salaryVisible = true,
    sensitiveVisible = false,
  ): Promise<{ items: EmployeeDto[]; total: number }> {
    const conditions: Prisma.EmployeeWhereInput[] = [branchFilter(await getBranchAccess(actor), query.branchId)];
    if (query.status) conditions.push({ status: query.status });
    if (query.position) conditions.push({ position: query.position });
    if (query.department) conditions.push({ department: query.department });
    for (const term of splitSearchTerms(query.search)) {
      const digits = term.replace(/\D/g, '');
      conditions.push({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    const where: Prisma.EmployeeWhereInput = { AND: conditions };

    const records = await prisma.employee.findMany({
      where,
      select: employeeSelect,
      orderBy: [{ status: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.employee.count({ where });
    return { items: await withCurrentSalaries(records, salaryVisible, sensitiveVisible), total };
  },

  async getById(id: string, salaryVisible = true, sensitiveVisible = false): Promise<EmployeeDto> {
    const [employee] = await withCurrentSalaries([await findOrFail(id)], salaryVisible, sensitiveVisible);
    return employee!;
  },

  /** Xodimga bog‘lash mumkin bo‘lgan tizim foydalanuvchilari */
  async candidates(): Promise<EmployeeCandidateDto[]> {
    const users = await prisma.user.findMany({
      where: { deletedAt: null, employee: null, teacherProfile: null },
      select: { id: true, firstName: true, lastName: true, email: true, role: { select: { name: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, roleName: user.role.name }));
  },

  async create(actor: AuthUser, input: CreateEmployeeInput, client: ClientInfo): Promise<EmployeeDto> {
    assertDates(input.status, input.hireDate, input.terminationDate ?? null);
    if (input.userId) await assertUserLinkable(input.userId);

    const id = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          position: input.position,
          baseSalary: input.baseSalary,
          status: input.status,
          hireDate: input.hireDate,
          branchId: resolveBranchId(await getBranchAccess(actor)),
          terminationDate: input.terminationDate ?? null,
          email: input.email ?? null,
          department: input.department ?? null,
          contractNumber: input.contractNumber ?? null,
          contractStartDate: input.contractStartDate ?? null,
          contractEndDate: input.contractEndDate ?? null,
          birthDate: input.birthDate ?? null,
          address: input.address ?? null,
          passportNumber: input.passportNumber ?? null,
          emergencyContact: input.emergencyContact ?? null,
          emergencyPhone: input.emergencyPhone ?? null,
          note: input.note ?? null,
          userId: input.userId ?? null,
          createdById: actor.id,
        },
        select: { id: true },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'employee.created',
        entityType: 'employee',
        entityId: employee.id,
        metadata: {
          name: `${input.firstName} ${input.lastName}`,
          position: input.position,
          baseSalary: input.baseSalary,
          hireDate: toDateOnly(input.hireDate),
        },
        ...client,
      });
      return employee.id;
    });

    return this.getById(id);
  },

  async update(actor: AuthUser, id: string, input: UpdateEmployeeInput, client: ClientInfo): Promise<EmployeeDto> {
    const existing = await findOrFail(id);
    const status = input.status ?? existing.status;
    const hireDate = input.hireDate ?? existing.hireDate;
    // Qayta faollashtirilganda ishdan ketgan sana tozalanadi (alohida berilmagan bo'lsa)
    const terminationDate =
      input.terminationDate !== undefined
        ? input.terminationDate
        : status !== 'RESIGNED' && existing.status === 'RESIGNED'
          ? null
          : existing.terminationDate;
    assertDates(status, hireDate, terminationDate);
    if (input.userId) await assertUserLinkable(input.userId, id);

    const before = {
      position: existing.position,
      baseSalary: existing.baseSalary.toNumber(),
      status: existing.status,
      terminationDate: existing.terminationDate ? toDateOnly(existing.terminationDate) : null,
    };

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
          ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.position === undefined ? {} : { position: input.position }),
          ...(input.baseSalary === undefined ? {} : { baseSalary: input.baseSalary }),
          ...(input.hireDate === undefined ? {} : { hireDate: input.hireDate }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.department === undefined ? {} : { department: input.department }),
          ...(input.contractNumber === undefined ? {} : { contractNumber: input.contractNumber }),
          ...(input.contractStartDate === undefined ? {} : { contractStartDate: input.contractStartDate }),
          ...(input.contractEndDate === undefined ? {} : { contractEndDate: input.contractEndDate }),
          ...(input.birthDate === undefined ? {} : { birthDate: input.birthDate }),
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(input.passportNumber === undefined ? {} : { passportNumber: input.passportNumber }),
          ...(input.emergencyContact === undefined ? {} : { emergencyContact: input.emergencyContact }),
          ...(input.emergencyPhone === undefined ? {} : { emergencyPhone: input.emergencyPhone }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.userId === undefined ? {} : { userId: input.userId }),
          status,
          terminationDate,
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'employee.updated',
        entityType: 'employee',
        entityId: id,
        metadata: { name: `${existing.firstName} ${existing.lastName}` },
        before,
        after: {
          position: input.position ?? existing.position,
          baseSalary: input.baseSalary ?? before.baseSalary,
          status,
          terminationDate: terminationDate ? toDateOnly(terminationDate) : null,
        },
        ...client,
      });
    });

    return this.getById(id);
  },
};
