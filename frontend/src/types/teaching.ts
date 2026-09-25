import type { WeekDay } from './group';
import type { RiskFactor, RiskLevel } from './student';

export interface TeachingGroupCard {
  id: string;
  name: string;
  course: { id: string; name: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
  schedule: { days: WeekDay[]; startTime: string; endTime: string };
  students: number;
  attendanceRate: number | null;
  homeworkRate: number | null;
  examAverage: number | null;
  progress: number | null;
  risk: Record<RiskLevel, number>;
  pending: { homeworkToGrade: number; attemptsToReview: number };
  today: { isLessonDay: boolean; attendanceMarked: boolean };
}

export interface TeachingOverview {
  totals: { groups: number; students: number; atRisk: number; homeworkToGrade: number; attemptsToReview: number; lessonsToday: number; unmarkedToday: number };
  groups: TeachingGroupCard[];
}

export interface TeachingStudentRow {
  id: string;
  number: number;
  code: string;
  firstName: string;
  lastName: string;
  attendanceRate: number | null;
  homeworkRate: number | null;
  examAverage: number | null;
  progress: number | null;
  riskLevel: RiskLevel | null;
  healthScore: number | null;
  reasons: string[];
  factors: RiskFactor[];
  lastActivityAt: string | null;
  lastLoginAt: string | null;
  hasPortalAccount: boolean;
}

export interface TeachingGroup {
  group: TeachingGroupCard;
  students: TeachingStudentRow[];
}
