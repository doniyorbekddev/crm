import type { WeekDay } from './group';

export interface RoomGroupRef {
  id: string;
  name: string;
  scheduleDays: WeekDay[];
  startTime: string;
  endTime: string;
}

export interface Room {
  id: string;
  key: string;
  name: string;
  capacity: number;
  equipment: string[];
  note: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  /** Shu xonada dars qiladigan faol guruhlar */
  groups: RoomGroupRef[];
}

export interface RoomPayload {
  key?: string;
  name: string;
  capacity: number;
  equipment?: string[];
  note?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export type ConflictKind = 'ROOM' | 'TEACHER';

export interface ScheduleConflict {
  kind: ConflictKind;
  groupId: string;
  groupName: string;
  days: WeekDay[];
  startTime: string;
  endTime: string;
  /** Tayyor o‘zbekcha matn */
  message: string;
}

export interface ConflictCheckPayload {
  groupId?: string;
  roomId?: string;
  teacherId?: string;
  scheduleDays: WeekDay[];
  startTime: string;
  endTime: string;
  startDate: string;
  endDate?: string;
}
