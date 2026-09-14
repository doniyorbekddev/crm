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
  position: EmployeePosition;
  /** salary.view ruxsati bo‘lmasa null */
  baseSalary: number | null;
  status: EmployeeStatus;
  hireDate: string;
  terminationDate: string | null;
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
}

export interface EmployeeCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
}
