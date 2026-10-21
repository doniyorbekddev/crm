export type DataQualitySeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DataQualityCheck {
  key: string;
  label: string;
  impact: string;
  severity: DataQualitySeverity;
  count: number;
  action: { label: string; to: string } | null;
  sample: Array<{ id: string; title: string; subtitle: string | null; to: string }>;
}

export interface DataQualityReport {
  generatedAt: string;
  activeStudents: number;
  checks: DataQualityCheck[];
}
