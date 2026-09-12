import type { Gender } from './lead';

export type StudentStatus = 'ACTIVE' | 'FROZEN' | 'COMPLETED' | 'DROPPED' | 'GRADUATED';
export type DebtStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface StudentDebt {
  total: number;
  paid: number;
  remaining: number;
  status: DebtStatus;
}

export interface StudentItem {
  id: string;
  number: number;
  /** "ST-000045" */
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
  /** "2026-10-01" — vaqtsiz sana */
  startDate: string;
  status: StudentStatus;
  notes: string | null;
  createdAt: string;
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
  debt: StudentDebt | null;
}

export interface StudentListParams {
  page: number;
  limit: number;
  search?: string;
  status?: StudentStatus;
  courseId?: string;
  groupId?: string;
  sortBy?: 'createdAt' | 'firstName' | 'startDate' | 'number';
  sortOrder?: 'asc' | 'desc';
}

export type StudentSummaryParams = Omit<StudentListParams, 'page' | 'limit' | 'status'>;

export type StudentStatusSummary = Record<StudentStatus | 'ALL', number>;

export interface StudentPayload {
  firstName: string;
  lastName: string;
  phone: string;
  parentPhone?: string;
  telegram?: string;
  email?: string;
  birthDate?: string;
  gender?: Gender;
  address?: string;
  courseId: string;
  groupId?: string;
  contractNumber?: string;
  contractPrice?: number;
  startDate: string;
  notes?: string;
}

export interface ConvertLeadPayload {
  courseId?: string;
  groupId?: string;
  contractNumber?: string;
  contractPrice?: number;
  startDate?: string;
  parentPhone?: string;
}

export interface StudentFormLookups {
  courses: Array<{ id: string; name: string; finalPrice: number }>;
  groups: Array<{ id: string; name: string; courseId: string; capacity: number; studentCount: number; freeSeats: number }>;
}
