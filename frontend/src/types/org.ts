import type { EmployeePosition, EmployeeStatus } from '@/types/employee';

/** ORG tizimi: tashkiliy tuzilma va umumiy turlar */
export interface OrgPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface OrgStaffUser extends OrgPerson {
  roleName: string;
}

export interface OrgMember {
  kind: 'employee' | 'teacher';
  id: string;
  userId: string | null;
  name: string;
  position: string;
  positionKey: EmployeePosition | 'TEACHER';
  status: EmployeeStatus;
  manager: OrgPerson | null;
  hireDate: string | null;
  probationEndDate: string | null;
  probationDaysLeft: number | null;
  onLeaveToday: boolean;
}

export interface OrgStructure {
  leaders: OrgStaffUser[];
  departments: Array<{ name: string; members: OrgMember[] }>;
  vacancies: Array<{ position: EmployeePosition; label: string }>;
  summary: { members: number; employees: number; teachers: number; onProbation: number; onLeave: number; withoutAccount: number };
}
