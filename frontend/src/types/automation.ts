export type AutomationTrigger =
  | 'STUDENT_ABSENT_STREAK'
  | 'PAYMENT_DUE_SOON'
  | 'PAYMENT_OVERDUE'
  | 'STUDENT_RISK_CRITICAL'
  | 'FOLLOWUP_OVERDUE'
  | 'STOCK_BELOW_MIN'
  | 'CERTIFICATE_ELIGIBLE';

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
