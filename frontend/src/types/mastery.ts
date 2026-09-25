export type MasteryStatus = 'NOT_STARTED' | 'LEARNING' | 'PRACTICING' | 'MASTERED';
export type MasteryLevel = 'WEAK' | 'DEVELOPING' | 'GOOD' | 'MASTERED';

export interface MasterySettings {
  thresholds: { developing: number; good: number; mastered: number };
  weights: { exam: number; homework: number; attendance: number; lessons: number };
}

export interface TopicMastery {
  topicId: string;
  title: string;
  score: number | null;
  status: MasteryStatus;
  level: MasteryLevel | null;
  sources: { exam: number | null; homework: number | null; attendance: number | null; lessons: number | null };
  evidence: { examQuestions: number; homework: number; sessions: number; lessons: number };
  calculatedAt: string | null;
}

export interface StudentMastery {
  studentId: string;
  courseId: string;
  settings: MasterySettings;
  overall: { score: number | null; mastered: number; practicing: number; learning: number; notStarted: number; topics: number };
  modules: Array<{ id: string; title: string; score: number | null; topics: TopicMastery[] }>;
}

export interface ProgressHistoryPoint {
  /** "2026-09" */
  month: string;
  attendanceRate: number;
  homeworkRate: number;
  averageScore: number;
  masteryScore: number | null;
  topicsMastered: number;
  totalXp: number;
  levelNumber: number;
}

export interface GroupMastery {
  groupId: string;
  settings: MasterySettings;
  topics: Array<{ id: string; title: string; moduleTitle: string; average: number | null; mastered: number }>;
  students: Array<{ id: string; fullName: string; overall: number | null; cells: Record<string, { score: number | null; status: MasteryStatus }> }>;
}
