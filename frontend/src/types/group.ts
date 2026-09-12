import type { PersonRef } from './lead';

export type WeekDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type GroupStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface GroupItem {
  id: string;
  name: string;
  room: string | null;
  /** "2026-10-01" — vaqtsiz sana */
  startDate: string;
  endDate: string | null;
  scheduleDays: WeekDay[];
  startTime: string;
  endTime: string;
  capacity: number;
  studentCount: number;
  freeSeats: number;
  status: GroupStatus;
  createdAt: string;
  course: { id: string; name: string };
  teacher: PersonRef | null;
}

export interface GroupListParams {
  page: number;
  limit: number;
  search?: string;
  courseId?: string;
  teacherId?: string;
  status?: GroupStatus;
  sortBy?: 'name' | 'startDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface GroupPayload {
  name: string;
  courseId: string;
  teacherId?: string;
  room?: string;
  startDate: string;
  endDate?: string;
  scheduleDays: WeekDay[];
  startTime: string;
  endTime: string;
  capacity: number;
  status: GroupStatus;
}

export interface GroupFormLookups {
  courses: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; firstName: string; lastName: string; roleName: string }>;
}
