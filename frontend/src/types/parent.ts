import type { StudentStatus } from '@/types/student';

export type ParentRelation = 'MOTHER' | 'FATHER' | 'GUARDIAN' | 'OTHER';

export interface ParentStudentLink {
  linkId: string;
  studentId: string;
  /** "ST-000045" */
  code: string;
  firstName: string;
  lastName: string;
  status: StudentStatus;
  group: { id: string; name: string } | null;
  relation: ParentRelation;
  /** relation = OTHER bo'lganda markaz yozgan nom ("Buvi") */
  relationLabel: string | null;
  isPrimary: boolean;
}

export interface ParentItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  telegram: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  /** Kabinet hisobi ochilganmi */
  hasPortalAccount: boolean;
  students: ParentStudentLink[];
}

/** O‘quvchi profilidagi ota-ona qatori */
export interface StudentParent {
  linkId: string;
  parentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  telegram: string | null;
  email: string | null;
  notes: string | null;
  relation: ParentRelation;
  /** relation = OTHER bo'lganda markaz yozgan nom ("Buvi") */
  relationLabel: string | null;
  isPrimary: boolean;
}

export interface ParentListParams {
  page: number;
  limit: number;
  search?: string;
  studentId?: string;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ParentLinkPayload {
  studentId: string;
  relation: ParentRelation;
  relationLabel?: string;
  isPrimary: boolean;
}

/** Qarindoshlik tanlovi: tizim kodi + "Boshqa" uchun o'z nomi */
export interface RelationChoice {
  relation: ParentRelation;
  relationLabel: string | null;
}

export interface ParentPayload {
  firstName: string;
  lastName: string;
  phone: string;
  telegram?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface CreateParentPayload extends ParentPayload {
  students?: ParentLinkPayload[];
}
