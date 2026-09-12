export type ReportType =
  | 'sales'
  | 'managers'
  | 'courses'
  | 'groups'
  | 'payments'
  | 'debts'
  | 'attendance'
  | 'sources';

export type ReportGroupBy = 'day' | 'week' | 'month';
export type ReportColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export type ReportCell = string | number | null;

export interface ReportKpi {
  label: string;
  value: number;
  type: ReportColumnType;
}

export interface Report {
  type: ReportType;
  title: string;
  description: string;
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
  totals: Record<string, number> | null;
  kpis: ReportKpi[];
  truncatedFrom: number | null;
}

export interface ReportParams {
  from?: string;
  to?: string;
  groupBy?: ReportGroupBy;
  courseId?: string;
  groupId?: string;
  managerId?: string;
}
