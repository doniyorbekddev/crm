import type { SalaryPeriodStatus } from '@/types/teacher';

export type EmployeePosition =
  | 'ADMINISTRATOR'
  | 'MANAGER'
  | 'SALES_MANAGER'
  | 'CALL_CENTER'
  | 'ACCOUNTANT'
  | 'CLEANER'
  | 'SECURITY'
  | 'OTHER';

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'RESIGNED';

export interface Employee {
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
  /** Shartnoma tugashiga necha kun qolgani (muddatsiz bo‘lsa null) */
  contractDaysLeft: number | null;
  onLeaveToday: boolean;
  /** `employee.sensitive` ruxsati bo‘lmasa butun blok null */
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

export interface EmployeeListParams {
  page: number;
  limit: number;
  search?: string;
  status?: EmployeeStatus;
  position?: EmployeePosition;
  department?: string;
  branchId?: string;
}

export interface EmployeePayload {
  firstName: string;
  lastName: string;
  phone: string | null;
  position: EmployeePosition;
  /** Maosh yashirilgan xodim tahrirlaganda yuborilmaydi (saqlangan qiymat o‘zgarmaydi) */
  baseSalary?: number;
  hireDate: string;
  status: EmployeeStatus;
  terminationDate: string | null;
  note: string | null;
  userId: string | null;
  email?: string | null;
  department?: string | null;
  contractNumber?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  birthDate?: string | null;
  address?: string | null;
  passportNumber?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
}

export type LeaveType = 'VACATION' | 'SICK' | 'UNPAID' | 'MATERNITY' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface EmployeeLeave {
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
  isActiveToday: boolean;
  createdAt: string;
}

export interface LeaveListParams {
  page: number;
  limit: number;
  employeeId?: string;
  status?: LeaveStatus;
  type?: LeaveType;
}

export interface CreateLeavePayload {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface EmployeeLeaveHistory {
  items: EmployeeLeave[];
  approvedDaysThisYear: number;
  onLeaveToday: boolean;
}

export interface EmployeeCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
}
