/** Backend `services/staffAttendance/*` bilan bir xil */

export type StaffAction = 'CHECK_IN' | 'BREAK_START' | 'BREAK_END' | 'CHECK_OUT';
export type StaffPhase = 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT';
export type StaffDayStatus =
  | 'WORKING'
  | 'ON_BREAK'
  | 'COMPLETED'
  | 'LATE'
  | 'EARLY_DEPARTURE'
  | 'PENDING_REVIEW'
  | 'ABSENT'
  | 'EXCUSED'
  | 'NOT_YET'
  | 'OFF';
export type StaffArrival = 'PRESENT' | 'LATE';
export type PlanKind = 'WORK' | 'OFF' | 'HOLIDAY' | 'UNSCHEDULED';
export type PlanSource = 'FIXED' | 'LESSONS' | 'EXCEPTION' | null;

export interface StaffDay {
  userId: string;
  date: string;
  dayId: string | null;
  status: StaffDayStatus;
  arrival: StaffArrival | null;
  expected: boolean;
  phase: StaffPhase | null;
  planKind: PlanKind;
  planSource: PlanSource;
  planNote: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  lessons: Array<{ groupName: string; startTime: string; endTime: string }>;
  checkInAt: string | null;
  checkOutAt: string | null;
  breakStartedAt: string | null;
  breakSeconds: number;
  workedSeconds: number | null;
  scheduledSeconds: number;
  lateMinutes: number;
  earlyMinutes: number;
  excused: boolean;
  excuseLabel: string | null;
  reviewReason: string | null;
  corrected: boolean;
}

export interface StaffToday {
  subject: { id: string; name: string; position: string };
  serverTime: string;
  day: StaffDay;
  actions: StaffAction[];
  events: Array<{ type: StaffAction; occurredAt: string; source: string }>;
  openPreviousDay: string | null;
}

export interface ScanPreview {
  expiresAt: string;
  actions: StaffAction[];
  phase: StaffPhase | null;
}

export interface ScanResult {
  action: StaffAction;
  occurredAt: string;
  message: string;
  replayed: boolean;
  today: StaffToday;
}

export interface QrIssue {
  id: string;
  token: string;
  expiresAt: string;
  ttlSeconds: number;
  rotateSeconds: number;
  serverTime: string;
}

export interface StaffSummary {
  expectedDays: number;
  attendedDays: number;
  onTimeDays: number;
  lateDays: number;
  absentDays: number;
  excusedDays: number;
  earlyDepartureDays: number;
  reviewDays: number;
  scheduledSeconds: number;
  workedSeconds: number;
  breakSeconds: number;
  lateMinutes: number;
  earlyMinutes: number;
  attendancePercent: number | null;
}

export type PermissionRequestType = 'ABSENCE' | 'LATE_ARRIVAL' | 'EARLY_LEAVE';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PermissionRequest {
  id: string;
  userId: string;
  userName: string;
  type: PermissionRequestType;
  startDate: string;
  endDate: string;
  time: string | null;
  reason: string;
  status: RequestStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface PermissionRequestInput {
  type: PermissionRequestType;
  startDate: string;
  endDate?: string;
  time?: string;
  reason: string;
}

export interface StaffRow extends StaffDay {
  name: string;
  position: string;
  avatarPath: string | null;
}

export interface StaffOverview {
  date: string;
  serverTime: string;
  counts: {
    expected: number;
    working: number;
    onBreak: number;
    onTime: number;
    late: number;
    notArrived: number;
    absent: number;
    excused: number;
    checkedOut: number;
    review: number;
  };
  rows: StaffRow[];
  reviewQueue: Array<{ userId: string; name: string; date: string; checkInAt: string | null }>;
}

export interface StaffSchedule {
  mode: 'FIXED' | 'LESSONS';
  workDays: string[];
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  graceMinutes: number;
  absentAfterMinutes: number;
  lessonLeadMinutes: number;
  effectiveFrom: string;
}

export interface ScheduleRow {
  userId: string;
  name: string;
  position: string;
  kind: 'TEACHER' | 'EMPLOYEE';
  schedule: StaffSchedule | null;
  nextChange: string | null;
}

export interface ScheduleInput {
  mode: 'FIXED' | 'LESSONS';
  workDays: string[];
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  graceMinutes: number;
  absentAfterMinutes: number;
  lessonLeadMinutes: number;
  effectiveFrom?: string;
}

export interface DayEvent {
  id: string;
  type: StaffAction;
  time: string;
  occurredAt: string;
  source: 'QR' | 'CORRECTION';
  voided: boolean;
  recordedAt: string;
  ip: string | null;
  fromOwnDisplay: boolean;
}

export interface CorrectionSnapshotItem {
  id: string;
  type: StaffAction;
  label: string;
  time: string;
  source: string;
}

export interface DayDetail {
  subject: { id: string; name: string; position: string };
  day: StaffDay;
  schedule: StaffSchedule | null;
  events: DayEvent[];
  corrections: Array<{
    id: string;
    reason: string;
    before: CorrectionSnapshotItem[];
    after: CorrectionSnapshotItem[];
    createdAt: string;
    createdBy: string | null;
  }>;
  requests: PermissionRequest[];
}

export type CorrectionInput =
  | { action: 'ADD'; type: StaffAction; time: string; reason: string }
  | { action: 'VOID'; eventId: string; reason: string }
  | { action: 'REPLACE'; eventId: string; time: string; reason: string };

export interface StaffReport {
  from: string;
  to: string;
  rows: Array<{ userId: string; name: string; position: string; summary: StaffSummary }>;
  total: StaffSummary;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface ScheduleException {
  id: string;
  userId: string;
  name: string;
  date: string;
  type: 'DAY_OFF' | 'CUSTOM_HOURS';
  startTime: string | null;
  endTime: string | null;
  reason: string;
}
