export type AcademicDimension = 'course' | 'group' | 'teacher' | 'topic' | 'homework' | 'exam' | 'student';

export interface AcademicRow {
  key: string;
  label: string;
  sublabel: string | null;
  students: number | null;
  attendanceRate: number | null;
  homeworkRate: number | null;
  averageScore: number | null;
  examAverage: number | null;
  passRate: number | null;
  mastery: number | null;
  progress: number | null;
  retention: number | null;
  atRisk: number | null;
  feedback: number | null;
  weakTopics?: Array<{ id: string; title: string; mastery: number }>;
  lateRate?: number | null;
  missedRate?: number | null;
  masteredShare?: number | null;
}

export interface AcademicAnalytics {
  dimension: AcademicDimension;
  from: string;
  to: string;
  rows: AcademicRow[];
  totals: Omit<AcademicRow, 'key' | 'label' | 'sublabel' | 'weakTopics' | 'lateRate' | 'missedRate' | 'masteredShare'>;
  observations: string[];
}
