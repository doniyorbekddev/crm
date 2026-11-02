import { prisma } from '../../config/database.js';
import { EMPLOYEE_POSITION_LABELS } from '../../config/employeeLabels.js';
import type { EmployeePosition, EmployeeStatus } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { branchFilter, getBranchAccess } from '../branchAccess.js';
import { employeesOnLeaveToday } from '../employeeLeave.service.js';
import { businessToday, ceoUsers, daysBetween, fullName, staffRoleWhere, toDateOnly } from './common.js';
import type { Person } from './common.js';

/**
 * Tashkiliy tuzilma (ORG §2, §16): markaz rahbari → bo'limlar → xodimlar va o'qituvchilar.
 *
 * Bo'lim xodim kartasidagi "Bo'lim" maydonidan olinadi; u bo'sh bo'lsa — lavozimdan (hujjatdagi bo'linish bo'yicha).
 * O'qituvchilar har doim o'quv bo'limida. Kimga hisobot berishi ko'rsatilmagan xodim — markaz rahbariga bo'ysunadi.
 * Kelajakdagi lavozimlarda faol xodim bo'lmasa, "vakant" deb ko'rsatiladi.
 */

export const DEPARTMENTS = {
  SALES: 'Sotuv va qabulxona',
  MARKETING: 'Marketing va kontent',
  ACADEMIC: 'O‘quv bo‘limi',
  FINANCE: 'Moliya',
  MANAGEMENT: 'Boshqaruv',
  SUPPORT: 'Xo‘jalik va boshqalar',
} as const;

const POSITION_DEPARTMENT: Record<EmployeePosition, string> = {
  SALES_MANAGER: DEPARTMENTS.SALES,
  CALL_CENTER: DEPARTMENTS.SALES,
  RECEPTIONIST: DEPARTMENTS.SALES,
  ADMINISTRATOR: DEPARTMENTS.SALES,
  MARKETING_MANAGER: DEPARTMENTS.MARKETING,
  CONTENT_CREATOR: DEPARTMENTS.MARKETING,
  ACADEMIC_COORDINATOR: DEPARTMENTS.ACADEMIC,
  ACCOUNTANT: DEPARTMENTS.FINANCE,
  MANAGER: DEPARTMENTS.MANAGEMENT,
  OPERATIONS_MANAGER: DEPARTMENTS.MANAGEMENT,
  STUDENT_SUCCESS_MANAGER: DEPARTMENTS.MANAGEMENT,
  CLEANER: DEPARTMENTS.SUPPORT,
  SECURITY: DEPARTMENTS.SUPPORT,
  OTHER: DEPARTMENTS.SUPPORT,
};

const DEPARTMENT_ORDER: readonly string[] = Object.values(DEPARTMENTS);

/** Hujjatdagi kelajakdagi lavozimlar — faol xodim bo'lmasa vakant */
export const FUTURE_POSITIONS: readonly EmployeePosition[] = ['OPERATIONS_MANAGER', 'STUDENT_SUCCESS_MANAGER', 'ACADEMIC_COORDINATOR'];

const WORKING: readonly EmployeeStatus[] = ['ACTIVE', 'ON_LEAVE'];

export function departmentOf(position: EmployeePosition, department: string | null): string {
  return department?.trim() || POSITION_DEPARTMENT[position];
}

export interface OrgMember {
  kind: 'employee' | 'teacher';
  /** Xodim kartasi yoki o'qituvchi profili ID'si */
  id: string;
  userId: string | null;
  name: string;
  position: string;
  positionKey: EmployeePosition | 'TEACHER';
  status: EmployeeStatus;
  manager: Person | null;
  hireDate: string | null;
  probationEndDate: string | null;
  /** Sinov tugashiga qolgan kun (tugagan bo'lsa null) */
  probationDaysLeft: number | null;
  onLeaveToday: boolean;
}

export interface OrgDepartment {
  name: string;
  members: OrgMember[];
}

export interface OrgStructureDto {
  leaders: Array<Person & { roleName: string }>;
  departments: OrgDepartment[];
  vacancies: Array<{ position: EmployeePosition; label: string }>;
  summary: { members: number; employees: number; teachers: number; onProbation: number; onLeave: number; withoutAccount: number };
}

function probationLeft(end: Date | null, status: EmployeeStatus, today: Date): number | null {
  if (!end || !WORKING.includes(status) || end < today) return null;
  return daysBetween(today, end);
}

export const orgStructureService = {
  /** Faol xodim hisoblari (rahbar, mas'ul tanlash uchun) — o'quvchi va ota-ona kabinetlarisiz, filial doirasida */
  async people(actor: AuthUser): Promise<Array<Person & { roleName: string }>> {
    const access = await getBranchAccess(actor);
    const users = await prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE', role: staffRoleWhere, ...(access.canViewAll ? {} : { branchId: access.branchId }) },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    });
    return users.map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, roleName: user.role.name }));
  },

  async get(actor: AuthUser, now: Date = new Date()): Promise<OrgStructureDto> {
    const access = await getBranchAccess(actor);
    const branch = branchFilter(access);
    const today = businessToday(now);

    const [leaders, employees, teachers] = await Promise.all([
      ceoUsers(),
      prisma.employee.findMany({
        where: { ...branch, status: { in: [...WORKING] } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          position: true,
          positionTitle: true,
          department: true,
          status: true,
          hireDate: true,
          probationEndDate: true,
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.teacherProfile.findMany({
        where: { employmentStatus: { in: [...WORKING] }, user: { deletedAt: null, ...branch } },
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
        select: {
          id: true,
          userId: true,
          specialization: true,
          employmentStatus: true,
          hireDate: true,
          probationEndDate: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const onLeave = await employeesOnLeaveToday(employees.map((employee) => employee.id), now);

    const groups = new Map<string, OrgMember[]>();
    const push = (department: string, member: OrgMember) => groups.set(department, [...(groups.get(department) ?? []), member]);

    for (const employee of employees) {
      push(departmentOf(employee.position, employee.department), {
        kind: 'employee',
        id: employee.id,
        userId: employee.userId,
        name: fullName(employee),
        position: employee.position === 'OTHER' && employee.positionTitle ? employee.positionTitle : EMPLOYEE_POSITION_LABELS[employee.position],
        positionKey: employee.position,
        status: employee.status,
        manager: employee.manager,
        hireDate: toDateOnly(employee.hireDate),
        probationEndDate: employee.probationEndDate ? toDateOnly(employee.probationEndDate) : null,
        probationDaysLeft: probationLeft(employee.probationEndDate, employee.status, today),
        onLeaveToday: onLeave.has(employee.id) || employee.status === 'ON_LEAVE',
      });
    }
    for (const teacher of teachers) {
      push(DEPARTMENTS.ACADEMIC, {
        kind: 'teacher',
        id: teacher.id,
        userId: teacher.userId,
        name: fullName(teacher.user),
        position: teacher.specialization ? `O‘qituvchi · ${teacher.specialization}` : 'O‘qituvchi',
        positionKey: 'TEACHER',
        status: teacher.employmentStatus,
        manager: null,
        hireDate: teacher.hireDate ? toDateOnly(teacher.hireDate) : null,
        probationEndDate: teacher.probationEndDate ? toDateOnly(teacher.probationEndDate) : null,
        probationDaysLeft: probationLeft(teacher.probationEndDate, teacher.employmentStatus, today),
        onLeaveToday: teacher.employmentStatus === 'ON_LEAVE',
      });
    }

    const rank = (name: string) => {
      const index = DEPARTMENT_ORDER.indexOf(name);
      return index === -1 ? DEPARTMENT_ORDER.length - 1 : index;
    };
    const departments = [...groups]
      .map(([name, members]) => ({ name, members }))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

    const filled = new Set(employees.map((employee) => employee.position));
    const members = departments.flatMap((department) => department.members);
    return {
      leaders,
      departments,
      vacancies: FUTURE_POSITIONS.filter((position) => !filled.has(position)).map((position) => ({ position, label: EMPLOYEE_POSITION_LABELS[position] })),
      summary: {
        members: members.length,
        employees: employees.length,
        teachers: teachers.length,
        onProbation: members.filter((member) => member.probationDaysLeft !== null).length,
        onLeave: members.filter((member) => member.onLeaveToday).length,
        withoutAccount: members.filter((member) => member.userId === null).length,
      },
    };
  },
};
