import type { EmployeePosition } from './employee';
import type { SalaryPeriod, SalaryRule } from './teacher';

type PersonRef = { id: string; firstName: string; lastName: string };

/** KPI o'lchov usuli — har biri mavjud CRM yozuvlaridan (MANUAL — sabab bilan qo'lda) */
export type KpiMetric =
  | 'ACQUIRED_STUDENTS'
  | 'LEAD_CONVERSION'
  | 'PAYMENT_COLLECTION'
  | 'ATTENDANCE_RATE'
  | 'STUDENT_RETENTION'
  | 'TASK_COMPLETION'
  | 'MANUAL';

export type KpiUnit = 'COUNT' | 'PERCENT';

export interface KpiDefinition {
  id: string;
  name: string;
  position: EmployeePosition;
  positionLabel: string;
  metric: KpiMetric;
  metricLabel: string;
  unit: KpiUnit;
  method: string;
  target: number;
  weight: number;
  description: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: PersonRef | null;
}

export interface KpiPositionSummary {
  position: EmployeePosition;
  label: string;
  weightSum: number;
  valid: boolean;
  employees: number;
}

export interface KpiOverview {
  definitions: KpiDefinition[];
  positions: KpiPositionSummary[];
  settings: { threshold: number };
}

export interface KpiDefinitionPayload {
  name: string;
  position: EmployeePosition;
  metric: KpiMetric;
  target: number;
  weight: number;
  description?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive?: boolean;
}

export interface KpiResult {
  kpiId: string;
  name: string;
  metric: KpiMetric;
  unit: KpiUnit;
  method: string;
  target: number;
  weight: number;
  /** null — ma'lumot yo'q (bahoga kirmadi) */
  actual: number | null;
  achievement: number | null;
  basis: string;
  manual: { reason: string; createdBy: PersonRef | null; updatedAt: string } | null;
}

export interface Acquisition {
  studentId: string;
  studentName: string;
  code: string;
  leadId: string;
  paymentId: string;
  paidAt: string;
  amount: number;
}

export interface KpiEvaluation {
  pool: number;
  threshold: number;
  weightSum: number;
  configValid: boolean;
  achievement: number | null;
  bonus: number;
  results: KpiResult[];
  acquisitions: Acquisition[];
  warnings: string[];
}

export interface SalesActivity {
  leadsAssigned: number;
  leadsContacted: number;
  trialsBooked: number;
  converted: number;
  acquired: Acquisition[];
  conversionRate: number | null;
}

export interface PayrollTimelineItem {
  id: string;
  action: string;
  label: string;
  at: string;
  actor: PersonRef | null;
  details: string | null;
}

export type PayeeKind = 'TEACHER' | 'EMPLOYEE';

export interface PayrollProfile {
  payee: {
    type: PayeeKind;
    id: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    roleLabel: string;
    position: EmployeePosition | null;
    department: string | null;
    branch: { id: string; name: string } | null;
    since: string | null;
  };
  rules: SalaryRule[];
  employeeTerms: { baseSalary: number; kpiBonusPool: number } | null;
  kpis: KpiDefinition[];
  current: SalaryPeriod | null;
  kpiPreview: KpiEvaluation | null;
  sales: SalesActivity | null;
  history: SalaryPeriod[];
  timeline: PayrollTimelineItem[];
}
