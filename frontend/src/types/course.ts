import type { PersonRef } from './lead';

export type CourseCategory = 'PROGRAMMING' | 'LANGUAGE' | 'DESIGN' | 'COMPUTER_LITERACY' | 'SCHOOL_PREPARATION' | 'OTHER';
export type CourseStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface CourseItem {
  id: string;
  name: string;
  category: CourseCategory;
  description: string | null;
  durationMonths: number;
  price: number;
  discountAmount: number;
  finalPrice: number;
  status: CourseStatus;
  createdAt: string;
  teacher: PersonRef | null;
  counts: { groups: number; students: number; leads: number };
}

export interface CourseListParams {
  page: number;
  limit: number;
  search?: string;
  category?: CourseCategory;
  status?: CourseStatus;
  teacherId?: string;
  sortBy?: 'name' | 'price' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CoursePayload {
  name: string;
  category: CourseCategory;
  description?: string;
  durationMonths: number;
  price: number;
  discountAmount: number;
  teacherId?: string;
  status: CourseStatus;
}
