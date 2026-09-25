export type AutomationTrigger =
  | 'STUDENT_ABSENT_STREAK'
  | 'PAYMENT_DUE_SOON'
  | 'PAYMENT_OVERDUE'
  | 'STUDENT_RISK_CRITICAL'
  | 'FOLLOWUP_OVERDUE'
  | 'STOCK_BELOW_MIN'
  | 'CERTIFICATE_ELIGIBLE'
  | 'HOMEWORK_COMPLETION_LOW'
  | 'EXAM_SCORE_LOW'
  | 'MASTERY_LOW'
  | 'NO_LOGIN_DAYS'
  | 'NO_SUBMISSION_DAYS';

/** Quruvchi (TZ §51) triggerlari */
export type BuilderTrigger = 'STUDENT_ABSENT_STREAK' | 'HOMEWORK_COMPLETION_LOW' | 'EXAM_SCORE_LOW' | 'MASTERY_LOW' | 'NO_LOGIN_DAYS' | 'NO_SUBMISSION_DAYS' | 'STUDENT_RISK_CRITICAL';
export type AutomationSchedule = 'HOURLY' | 'DAILY' | 'WEEKLY';
export type BuilderChannel = 'IN_APP' | 'TELEGRAM' | 'BOTH';

export type BuilderAction =
  | { type: 'NOTIFY'; audience: 'TEACHER' | 'MANAGER' | 'STUDENT' | 'PARENT'; channel: BuilderChannel }
  | { type: 'CREATE_TASK'; assignee: 'TEACHER' | 'MANAGER'; dueDays: number }
  | { type: 'CREATE_ALERT'; severity: 'INFO' | 'WARNING' | 'CRITICAL' }
  | { type: 'ASSIGN_HOMEWORK'; dueDays: number }
  | { type: 'RECOMMEND_QUIZ' };

export interface BuilderConditions {
  threshold?: number;
  days?: number;
  courseId?: string;
  groupId?: string;
}

export interface BuilderRulePayload {
  name: string;
  description?: string;
  trigger: BuilderTrigger;
  conditions: BuilderConditions;
  actions: BuilderAction[];
  schedule: AutomationSchedule;
  scheduleHour: number;
  scheduleWeekday: number;
  isActive: boolean;
}

export interface AutomationDryRun {
  matched: number;
  sample: Array<{ name: string; group: string | null; detail: string }>;
}

export type AutomationAudience = 'STAFF' | 'RESPONSIBLE' | 'STUDENT' | 'PARENT';

export interface AutomationRule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  audience: AutomationAudience;
  /** Qoida parametrlari: {absences: 2}, {daysBefore: 3} */
  params: Record<string, number>;
  isActive: boolean;
  lastRunAt: string | null;
  lastMatched: number;
  isCustom: boolean;
  conditions: BuilderConditions | null;
  actions: BuilderAction[] | null;
  schedule: AutomationSchedule | null;
  scheduleHour: number | null;
  scheduleWeekday: number | null;
  nextRunAt: string | null;
}

export interface AutomationRun {
  id: string;
  ruleKey: string;
  ruleName: string;
  startedAt: string;
  durationMs: number | null;
  matched: number;
  notified: number;
  skipped: number;
  error: string | null;
}

export interface AutomationRunParams {
  page: number;
  limit: number;
  ruleKey?: string;
}

export interface AutomationUpdatePayload {
  isActive?: boolean;
  audience?: AutomationAudience;
  params?: Record<string, number>;
}
