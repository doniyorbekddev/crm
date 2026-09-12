import type { PersonRef } from './lead';
import type { WeekDay } from './group';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceRow {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: AttendanceStatus | null;
  note: string | null;
  markedAt: string | null;
  markedBy: PersonRef | null;
}

export type AttendanceSummary = Record<AttendanceStatus, number> & { unmarked: number; total: number };

export interface AttendanceSheet {
  session: { id: string; topic: string | null; startTime: string | null; endTime: string | null } | null;
  group: {
    id: string;
    name: string;
    courseName: string;
    room: string | null;
    startTime: string;
    endTime: string;
    scheduleDays: WeekDay[];
    teacher: PersonRef | null;
  };
  date: string;
  isScheduledDay: boolean;
  canMark: boolean;
  students: AttendanceRow[];
  summary: AttendanceSummary;
}

export interface MarkAttendancePayload {
  date: string;
  records: Array<{ studentId: string; status: AttendanceStatus; note?: string }>;
}

export interface StudentAttendanceItem {
  id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  groupName: string;
}

export interface StudentAttendanceHistory {
  items: StudentAttendanceItem[];
  summary: Record<AttendanceStatus, number> & { total: number; attendanceRate: number };
}
