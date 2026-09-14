import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatSalaryPeriod } from '../config/salaryLabels.js';
import type { AttendanceStatus, GroupStatus, Prisma, UserStatus, WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CreateTeacherProfileInput,
  TeacherListQuery,
  UpdateTeacherProfileInput,
} from '../validators/teacher.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';
import type { SalaryPeriodDto, SalaryRuleDto } from './salary.service.js';
import { monthRange, salaryService, toSalaryRuleDto } from './salary.service.js';
import { refundTotal } from './revenue.js';

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface TeacherDto {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: UserStatus;
    roleName: string;
  };
  specialization: string | null;
  experienceYears: number | null;
  hireDate: string | null;
  bio: string | null;
  isActive: boolean;
  /** Faol va rejalashtirilgan guruhlar soni */
  groups: number;
  students: number;
  /** Joriy oyda o‘tkazilgan darslar */
  lessonsThisMonth: number;
  /** salary.view ruxsati bo‘lmasa maosh modeli qaytarilmaydi */
  salaryRule: SalaryRuleDto | null;
  salaryVisible: boolean;
  createdAt: string;
}

export interface TeacherGroupDto {
  id: string;
  name: string;
  status: GroupStatus;
  room: string | null;
  scheduleDays: WeekDay[];
  startTime: string;
  endTime: string;
  students: number;
  course: { id: string; name: string };
}

export interface TeacherPerformanceDto {
  year: number;
  month: number;
  label: string;
  lessonsHeld: number;
  lessonsPlanned: number;
  lessonsCancelled: number;
  attendance: { present: number; absent: number; late: number; excused: number; total: number };
  /** Kelgan (kechikkan ham) foizi */
  attendanceRate: number;
  homework: number;
  exams: number;
  /** Guruhlari o‘quvchilaridan shu oyda tushgan to‘lovlar */
  revenue: number;
}

export interface TeacherDetailDto extends TeacherDto {
  groupList: TeacherGroupDto[];
  performance: TeacherPerformanceDto;
  salaryRules: SalaryRuleDto[];
  salaryPeriods: SalaryPeriodDto[];
  /** Joriy yilda to‘langan va qolgan maosh (salary.view ruxsati bo‘lmasa null) */
  salaryTotals: { year: number; paid: number; remaining: number } | null;
}

export interface TeacherCandidateDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
}

export interface MyTeachingDto {
  profile: {
    id: string;
    specialization: string | null;
    experienceYears: number | null;
    hireDate: string | null;
    isActive: boolean;
  };
  groupList: TeacherGroupDto[];
  performance: TeacherPerformanceDto;
  salaryRule: SalaryRuleDto | null;
  /** Faqat tasdiqlangan va to‘langan davrlar — hisoblanayotgani ko‘rsatilmaydi */
  salaryPeriods: SalaryPeriodDto[];
  salaryTotals: { year: number; paid: number; remaining: number };
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const profileSelect = {
  id: true,
  specialization: true,
  experienceYears: true,
  hireDate: true,
  bio: true,
  isActive: true,
  createdAt: true,
  userId: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      role: { select: { name: true } },
    },
  },
} satisfies Prisma.TeacherProfileSelect;

type ProfileRecord = Prisma.TeacherProfileGetPayload<{ select: typeof profileSelect }>;

const groupSelect = {
  id: true,
  name: true,
  status: true,
  room: true,
  scheduleDays: true,
  startTime: true,
  endTime: true,
  teacherId: true,
  course: { select: { id: true, name: true } },
  _count: { select: { students: { where: { deletedAt: null, status: 'ACTIVE' } } } },
} satisfies Prisma.GroupSelect;

type GroupRecord = Prisma.GroupGetPayload<{ select: typeof groupSelect }>;

const ACTIVE_GROUP_STATUSES: readonly GroupStatus[] = ['PLANNED', 'ACTIVE'];

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toGroupDto(group: GroupRecord): TeacherGroupDto {
  return {
    id: group.id,
    name: group.name,
    status: group.status,
    room: group.room,
    scheduleDays: group.scheduleDays,
    startTime: group.startTime,
    endTime: group.endTime,
    students: group._count.students,
    course: group.course,
  };
}

/** Seansda o‘qituvchi ko‘rsatilmagan bo‘lsa guruh o‘qituvchisi hisobga olinadi */
function sessionOwnerFilter(userIds: string[]): Prisma.AttendanceSessionWhereInput {
  return { OR: [{ teacherId: { in: userIds } }, { teacherId: null, group: { teacherId: { in: userIds } } }] };
}

/** Bir oyda har bir o‘qituvchi o‘tkazgan darslar soni */
async function countHeldLessons(userIds: string[], start: Date, end: Date): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;

  const sessions = await prisma.attendanceSession.findMany({
    where: { status: 'HELD', date: { gte: start, lt: end }, ...sessionOwnerFilter(userIds) },
    select: { teacherId: true, group: { select: { teacherId: true } } },
  });
  for (const session of sessions) {
    const ownerId = session.teacherId ?? session.group.teacherId;
    if (!ownerId) continue;
    counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
  }
  return counts;
}

function buildTeacherWhere(query: TeacherListQuery): Prisma.TeacherProfileWhereInput {
  const conditions: Prisma.TeacherProfileWhereInput[] = [{ user: { deletedAt: null } }];
  if (query.isActive !== undefined) conditions.push({ isActive: query.isActive });
  if (query.salaryType) {
    conditions.push({ salaryRules: { some: { isActive: true, type: query.salaryType } } });
  }
  for (const term of splitSearchTerms(query.search)) {
    conditions.push({
      OR: [
        { user: { firstName: { contains: term, mode: 'insensitive' } } },
        { user: { lastName: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { specialization: { contains: term, mode: 'insensitive' } },
      ],
    });
  }
  return { AND: conditions };
}

function buildTeacherOrderBy(query: TeacherListQuery): Prisma.TeacherProfileOrderByWithRelationInput[] {
  switch (query.sortBy) {
    case 'hireDate':
      return [{ hireDate: query.sortOrder }, { id: 'asc' }];
    case 'createdAt':
      return [{ createdAt: query.sortOrder }, { id: 'asc' }];
    case 'name':
      return [{ user: { firstName: query.sortOrder } }, { user: { lastName: query.sortOrder } }];
  }
}

/** Ro‘yxat uchun umumiy ko‘rsatkichlar bitta-bitta so‘rovda yig‘iladi (N+1 bo‘lmasligi uchun) */
async function buildTeacherDtos(profiles: ProfileRecord[], reference: Date, salaryVisible: boolean): Promise<TeacherDto[]> {
  const userIds = profiles.map((profile) => profile.userId);
  const profileIds = profiles.map((profile) => profile.id);
  const { start, end } = monthRange(reference.getUTCFullYear(), reference.getUTCMonth() + 1);

  const groups =
    userIds.length === 0
      ? []
      : await prisma.group.findMany({
          where: { teacherId: { in: userIds } },
          select: { teacherId: true, status: true, _count: { select: { students: { where: { deletedAt: null, status: 'ACTIVE' } } } } },
        });

  const rules =
    profileIds.length === 0 || !salaryVisible
      ? []
      : await prisma.teacherSalaryRule.findMany({
          where: { teacherProfileId: { in: profileIds }, isActive: true },
          orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            teacherProfileId: true,
            type: true,
            baseSalary: true,
            perLessonRate: true,
            perStudentRate: true,
            percentage: true,
            bonus: true,
            effectiveFrom: true,
            effectiveTo: true,
            isActive: true,
            note: true,
            createdAt: true,
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });

  const lessons = await countHeldLessons(userIds, start, end);
  const groupCounts = new Map<string, { groups: number; students: number }>();
  for (const group of groups) {
    if (!group.teacherId) continue;
    const current = groupCounts.get(group.teacherId) ?? { groups: 0, students: 0 };
    if (ACTIVE_GROUP_STATUSES.includes(group.status)) current.groups += 1;
    current.students += group._count.students;
    groupCounts.set(group.teacherId, current);
  }
  const ruleByProfile = new Map<string, SalaryRuleDto>();
  for (const rule of rules) {
    if (!ruleByProfile.has(rule.teacherProfileId)) {
      ruleByProfile.set(rule.teacherProfileId, toSalaryRuleDto(rule));
    }
  }

  return profiles.map((profile) => {
    const counts = groupCounts.get(profile.userId) ?? { groups: 0, students: 0 };
    return {
      id: profile.id,
      user: {
        id: profile.user.id,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        email: profile.user.email,
        phone: profile.user.phone,
        status: profile.user.status,
        roleName: profile.user.role.name,
      },
      specialization: profile.specialization,
      experienceYears: profile.experienceYears,
      hireDate: profile.hireDate ? toDateOnly(profile.hireDate) : null,
      bio: profile.bio,
      isActive: profile.isActive,
      groups: counts.groups,
      students: counts.students,
      lessonsThisMonth: lessons.get(profile.userId) ?? 0,
      salaryRule: salaryVisible ? (ruleByProfile.get(profile.id) ?? null) : null,
      salaryVisible,
      createdAt: profile.createdAt.toISOString(),
    };
  });
}

/** O‘qituvchining bir oylik ko‘rsatkichlari */
async function loadPerformance(userId: string, year: number, month: number): Promise<TeacherPerformanceDto> {
  const { start, end } = monthRange(year, month);
  const sessionWhere: Prisma.AttendanceSessionWhereInput = {
    date: { gte: start, lt: end },
    ...sessionOwnerFilter([userId]),
  };

  const sessions = await prisma.attendanceSession.groupBy({
    by: ['status'],
    where: sessionWhere,
    _count: { _all: true },
  });
  const sessionCount = (status: string) => sessions.find((row) => row.status === status)?._count._all ?? 0;

  const attendanceRows = await prisma.attendance.groupBy({
    by: ['status'],
    where: { date: { gte: start, lt: end }, group: { teacherId: userId } },
    _count: { _all: true },
  });
  const countOf = (status: AttendanceStatus) => attendanceRows.find((row) => row.status === status)?._count._all ?? 0;
  const attendance = {
    present: countOf('PRESENT'),
    absent: countOf('ABSENT'),
    late: countOf('LATE'),
    excused: countOf('EXCUSED'),
    total: attendanceRows.reduce((sum, row) => sum + row._count._all, 0),
  };

  const homework = await prisma.homework.count({
    where: {
      assignedAt: { gte: start, lt: end },
      OR: [{ teacherId: userId }, { teacherId: null, group: { teacherId: userId } }],
    },
  });
  const exams = await prisma.exam.count({
    where: {
      date: { gte: start, lt: end },
      OR: [{ teacherId: userId }, { teacherId: null, group: { teacherId: userId } }],
    },
  });
  const revenue = await prisma.payment.aggregate({
    where: { deletedAt: null, paidAt: { gte: start, lt: end }, teacherId: userId },
    _sum: { amount: true },
  });

  return {
    year,
    month,
    label: formatSalaryPeriod(year, month),
    lessonsHeld: sessionCount('HELD'),
    lessonsPlanned: sessionCount('PLANNED'),
    lessonsCancelled: sessionCount('CANCELLED'),
    attendance,
    attendanceRate:
      attendance.total === 0 ? 0 : Math.round(((attendance.present + attendance.late) / attendance.total) * 100),
    homework,
    exams,
    revenue: (revenue._sum.amount?.toNumber() ?? 0) - (await refundTotal({ gte: start, lt: end }, { teacherId: userId })),
  };
}

async function loadGroups(userId: string): Promise<TeacherGroupDto[]> {
  const groups = await prisma.group.findMany({
    where: { teacherId: userId },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    select: groupSelect,
  });
  return groups.map(toGroupDto);
}

async function loadSalaryTotals(teacherProfileId: string, year: number): Promise<{ year: number; paid: number; remaining: number }> {
  const aggregate = await prisma.teacherSalaryPeriod.aggregate({
    where: { teacherProfileId, year },
    _sum: { paidAmount: true, remainingAmount: true },
  });
  return {
    year,
    paid: aggregate._sum.paidAmount?.toNumber() ?? 0,
    remaining: aggregate._sum.remainingAmount?.toNumber() ?? 0,
  };
}

async function canViewSalary(actor: AuthUser): Promise<boolean> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return permissions.has(PERMISSIONS.SALARY_VIEW);
}

async function findProfileOrFail(id: string): Promise<ProfileRecord> {
  const profile = await prisma.teacherProfile.findFirst({ where: { id, user: { deletedAt: null } }, select: profileSelect });
  if (!profile) {
    throw AppError.notFound('O‘qituvchi topilmadi');
  }
  return profile;
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

export const teacherService = {
  async list(actor: AuthUser, query: TeacherListQuery): Promise<{ items: TeacherDto[]; total: number }> {
    const salaryVisible = await canViewSalary(actor);
    const where = buildTeacherWhere(query);
    const profiles = await prisma.teacherProfile.findMany({
      where,
      select: profileSelect,
      orderBy: buildTeacherOrderBy(query),
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.teacherProfile.count({ where });
    return { items: await buildTeacherDtos(profiles, new Date(), salaryVisible), total };
  },

  async getById(actor: AuthUser, id: string): Promise<TeacherDetailDto> {
    const profile = await findProfileOrFail(id);
    const salaryVisible = await canViewSalary(actor);
    const [base] = await buildTeacherDtos([profile], new Date(), salaryVisible);
    if (!base) {
      throw AppError.notFound('O‘qituvchi topilmadi');
    }

    const now = new Date();
    const year = now.getUTCFullYear();

    return {
      ...base,
      groupList: await loadGroups(profile.userId),
      performance: await loadPerformance(profile.userId, year, now.getUTCMonth() + 1),
      salaryRules: salaryVisible ? await salaryService.rules(profile.id) : [],
      salaryPeriods: salaryVisible ? await salaryService.history(profile.id, { limit: 12 }) : [],
      salaryTotals: salaryVisible ? await loadSalaryTotals(profile.id, year) : null,
    };
  },

  /** Profil ochish mumkin bo‘lgan xodimlar: dars belgilash ruxsati bor, profili hali yo‘q */
  async candidates(): Promise<TeacherCandidateDto[]> {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        teacherProfile: null,
        role: { permissions: { some: { permission: { key: PERMISSIONS.ATTENDANCE_MARK } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true, role: { select: { name: true } } },
    });
    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      roleName: user.role.name,
    }));
  },

  async create(actor: AuthUser, input: CreateTeacherProfileInput, client: ClientInfo): Promise<TeacherDetailDto> {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, teacherProfile: { select: { id: true } } },
    });
    if (!user) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'userId', message: 'Xodim topilmadi' }]);
    }
    if (user.teacherProfile) {
      throw AppError.conflict('Bu xodimda o‘qituvchi profili allaqachon mavjud');
    }

    const profileId = await prisma.$transaction(async (tx) => {
      const created = await tx.teacherProfile.create({
        data: {
          userId: user.id,
          specialization: input.specialization ?? null,
          experienceYears: input.experienceYears ?? null,
          hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00.000Z`) : null,
          bio: input.bio ?? null,
        },
        select: { id: true },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'teacher.profile_created',
        entityType: 'teacher',
        entityId: created.id,
        metadata: {
          teacher: `${user.firstName} ${user.lastName}`,
          specialization: input.specialization ?? null,
          experienceYears: input.experienceYears ?? null,
        },
        ...client,
      });
      return created.id;
    });

    return this.getById(actor, profileId);
  },

  async update(
    actor: AuthUser,
    id: string,
    input: UpdateTeacherProfileInput,
    client: ClientInfo,
  ): Promise<TeacherDetailDto> {
    const profile = await findProfileOrFail(id);

    await prisma.$transaction(async (tx) => {
      await tx.teacherProfile.update({
        where: { id },
        data: {
          specialization: input.specialization ?? null,
          experienceYears: input.experienceYears ?? null,
          hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00.000Z`) : null,
          bio: input.bio ?? null,
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: input.isActive === false ? 'teacher.deactivated' : 'teacher.profile_updated',
        entityType: 'teacher',
        entityId: id,
        metadata: {
          teacher: `${profile.user.firstName} ${profile.user.lastName}`,
          before: {
            specialization: profile.specialization,
            experienceYears: profile.experienceYears,
            hireDate: profile.hireDate ? toDateOnly(profile.hireDate) : null,
            isActive: profile.isActive,
          },
          after: {
            specialization: input.specialization ?? null,
            experienceYears: input.experienceYears ?? null,
            hireDate: input.hireDate ?? null,
            isActive: input.isActive ?? profile.isActive,
          },
        },
        ...client,
      });
    });

    return this.getById(actor, id);
  },

  /** O‘qituvchining o‘z paneli: guruhlari, oylik ko‘rsatkichlari va maoshi */
  async myTeaching(userId: string): Promise<MyTeachingDto> {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true, specialization: true, experienceYears: true, hireDate: true, isActive: true },
    });
    if (!profile) {
      throw AppError.notFound('Sizda o‘qituvchi profili yo‘q');
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const rules = await salaryService.rules(profile.id);
    const periods = await salaryService.history(profile.id, { limit: 12 });

    return {
      profile: {
        id: profile.id,
        specialization: profile.specialization,
        experienceYears: profile.experienceYears,
        hireDate: profile.hireDate ? toDateOnly(profile.hireDate) : null,
        isActive: profile.isActive,
      },
      groupList: await loadGroups(userId),
      performance: await loadPerformance(userId, year, now.getUTCMonth() + 1),
      salaryRule: rules.find((rule) => rule.isActive) ?? null,
      salaryPeriods: periods.filter((period) => period.lockedAt !== null),
      salaryTotals: await loadSalaryTotals(profile.id, year),
    };
  },
};
