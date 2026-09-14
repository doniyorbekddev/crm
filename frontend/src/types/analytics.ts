export type ProfitabilityDimension = 'course' | 'group' | 'teacher';

export interface AnalyticsRangeParams {
  from?: string;
  to?: string;
}

export interface UnitEconomics {
  from: string;
  to: string;
  newStudents: number;
  leads: number;
  wonLeads: number;
  marketingSpend: number;
  cac: number | null;
  costPerLead: number | null;
  ltv: number | null;
  payingStudents: number;
  avgLifetimeMonths: number | null;
  monthlyArpu: number | null;
  activeStudents: number;
  ltvToCac: number | null;
  paybackMonths: number | null;
}

export interface ProfitabilityRow {
  id: string;
  name: string;
  subtitle: string | null;
  revenue: number;
  teacherCost: number;
  contribution: number;
  margin: number | null;
  activeStudents: number;
  revenuePerStudent: number | null;
}

export interface Profitability {
  from: string;
  to: string;
  dimension: ProfitabilityDimension;
  rows: ProfitabilityRow[];
  totals: { revenue: number; teacherCost: number; unallocatedCost: number; contribution: number; margin: number | null };
}

export interface CohortRow {
  key: string;
  label: string;
  size: number;
  retention: Array<number | null>;
  revenuePerStudent: number | null;
  dropped: number;
}

export interface Cohorts {
  months: number;
  rows: CohortRow[];
  average: Array<number | null>;
}

export interface SourceAnalyticsRow {
  id: string;
  name: string;
  leads: number;
  won: number;
  lost: number;
  conversion: number;
  students: number;
  revenue: number;
  revenuePerLead: number | null;
  avgDaysToConvert: number | null;
}

export interface SourceAnalytics {
  from: string;
  to: string;
  rows: SourceAnalyticsRow[];
  totals: { leads: number; won: number; students: number; revenue: number; conversion: number };
}
