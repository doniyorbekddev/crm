import type { AttendanceStatus } from './attendance';

export type SessionStatus = 'PLANNED' | 'HELD' | 'CANCELLED';

export interface AttendanceSessionItem {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  topic: string | null;
  note: string | null;
  status: SessionStatus;
  markedCount: number;
  createdAt: string;
  group: { id: string; name: string; course: { id: string; name: string } };
  teacher: { id: string; firstName: string; lastName: string } | null;
}

export interface SessionListParams {
  groupId?: string;
  teacherId?: string;
  from?: string;
  to?: string;
  status?: SessionStatus;
  limit?: number;
}

export interface SessionPayload {
  groupId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  topic?: string;
  note?: string;
  status?: SessionStatus;
}

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  EXCUSED: number;
  total: number;
  rate: number;
}

export interface CalendarDay {
  date: string;
  status: AttendanceStatus | null;
  statusLabel: string | null;
  note: string | null;
  groupName: string | null;
}

export interface AttendanceCalendar {
  year: number;
  month: number;
  student: { id: string; code: string; firstName: string; lastName: string };
  days: CalendarDay[];
  /** Tanlangan oy bo‘yicha hisob (backendda `month_`) */
  month_: AttendanceCounts;
  overall: AttendanceCounts;
}

export interface AttendanceStatsParams {
  from?: string;
  to?: string;
  courseId?: string;
  groupId?: string;
  teacherId?: string;
  studentId?: string;
}

export interface AttendanceStats {
  from: string;
  to: string;
  today: AttendanceCounts;
  week: AttendanceCounts;
  month: AttendanceCounts;
  range: AttendanceCounts;
  buckets: Array<{ key: string; label: string; students: number }>;
  byGroup: Array<{ groupId: string; groupName: string; courseName: string; total: number; rate: number }>;
  sessions: number;
  students: number;
}

export interface AttendanceRankingParams extends AttendanceStatsParams {
  limit?: number;
  minLessons?: number;
}

export interface AttendanceRankingRow {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  courseName: string;
  groupName: string | null;
  lessons: number;
  present: number;
  absent: number;
  late: number;
  rate: number;
  streak: number;
}

export interface TeacherOverview {
  date: string;
  groups: Array<{
    id: string;
    name: string;
    courseName: string;
    startTime: string;
    endTime: string;
    students: number;
    isScheduledToday: boolean;
    sessionId: string | null;
    markedToday: number;
  }>;
  todayLessons: number;
  markedLessons: number;
  todayAbsent: Array<{ studentId: string; firstName: string; lastName: string; groupName: string; phone: string }>;
  monthRate: number;
  monthCounts: AttendanceCounts;
}
