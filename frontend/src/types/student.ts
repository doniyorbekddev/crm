import type { Gender } from './lead';

export type StudentStatus = 'ACTIVE' | 'FROZEN' | 'COMPLETED' | 'DROPPED' | 'GRADUATED' | 'ALUMNI';
/** Xavf darajasi — holatdan mustaqil o‘lchov: o‘quvchi bir vaqtda "Faol" va "Kritik" bo‘lishi mumkin */
export type RiskLevel = 'HEALTHY' | 'ATTENTION' | 'AT_RISK' | 'CRITICAL';
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
  riskLevel: RiskLevel | null;
  /** 0–100; `null` — hisob uchun yetarli ma'lumot yo‘q */
  healthScore: number | null;
  riskUpdatedAt: string | null;
  /** Kabinet hisobi ochilganmi */
  hasPortalAccount: boolean;
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
  riskLevel?: RiskLevel;
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

/** Yangi guruhga qo‘shildi / boshqa guruhga o‘tkazildi / guruhdan chiqarildi */
export type GroupChangeKind = 'ENROLLED' | 'TRANSFERRED' | 'REMOVED';

export interface StudentGroupChange {
  id: string;
  kind: GroupChangeKind;
  /** Nom o‘sha paytdagi holatda; guruh o‘chirilgan bo‘lsa id null */
  from: { id: string | null; name: string } | null;
  to: { id: string | null; name: string } | null;
  reason: string | null;
  changedAt: string;
  changedBy: { id: string; firstName: string; lastName: string } | null;
  daysInPreviousGroup: number | null;
}

/** `groupId: null` — o‘quvchi guruhdan chiqariladi */
export interface TransferGroupPayload {
  groupId: string | null;
  reason: string;
}

export interface RiskFactor {
  key: 'attendance' | 'absences' | 'debt' | 'overdue' | 'homework' | 'exam';
  label: string;
  weight: number;
  score: number | null;
  value: string;
  hint: string;
}

export interface StudentRisk {
  studentId: string;
  healthScore: number | null;
  riskLevel: RiskLevel | null;
  factors: RiskFactor[];
  reasons: string[];
  updatedAt: string | null;
}

export interface StudentStatusChange {
  id: string;
  fromStatus: StudentStatus;
  toStatus: StudentStatus;
  reason: string | null;
  changedAt: string;
  changedBy: { id: string; firstName: string; lastName: string } | null;
}
