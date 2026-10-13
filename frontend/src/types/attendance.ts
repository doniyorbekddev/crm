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
  /** Shu kuni belgilangan, lekin hozir guruhda faol bo'lmagan o'quvchilar — faqat ko'rish uchun */
  formerStudents?: AttendanceRow[];
  summary: AttendanceSummary;
  /** O'quv markaz vaqti bo'yicha bugungi sana */
  today?: string;
  sessionStatus?: 'PLANNED' | 'HELD' | 'CANCELLED' | null;
}

export type AttendanceDayGroupState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface AttendanceDayGroup {
  id: string;
  name: string;
  courseName: string;
  room: string | null;
  startTime: string;
  endTime: string;
  teacher: PersonRef | null;
  students: number;
  marked: number;
  absent: number;
  state: AttendanceDayGroupState;
  isScheduledDay: boolean;
}

/** Kunlik taxta: shu sanaga darsi bor guruhlar */
export interface AttendanceDay {
  date: string;
  today: string;
  groups: AttendanceDayGroup[];
  /** Shu kuni darsi yo'q faol guruhlar (qo'shimcha dars belgilash uchun) */
  otherGroups: Array<{ id: string; name: string; courseName: string; students: number }>;
}

export interface MarkAttendancePayload {
  date: string;
  /** O‘tilgan kurs mavzusi (LMS) — kelganlarda "o‘rganilmoqda" bo‘ladi */
  topicId?: string;
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
