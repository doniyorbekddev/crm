import type { PersonRef } from './lead';

export type HomeworkStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type SubmissionStatus = 'PENDING' | 'SUBMITTED' | 'LATE' | 'GRADED' | 'MISSED';
export type ExamStatus = 'PLANNED' | 'HELD' | 'GRADED' | 'CANCELLED';

export interface HomeworkStats {
  students: number;
  submitted: number;
  graded: number;
  pending: number;
  missed: number;
  submissionRate: number;
  averageScore: number;
}

export interface Homework {
  id: string;
  title: string;
  description: string | null;
  status: HomeworkStatus;
  assignedAt: string;
  deadline: string;
  maxPoints: number;
  xpReward: number;
  attachmentPath: string | null;
  isOverdue: boolean;
  course: { id: string; name: string } | null;
  group: { id: string; name: string };
  teacher: PersonRef | null;
  stats: HomeworkStats;
}

export interface Submission {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  score: number | null;
  feedback: string | null;
  xpAwarded: number;
  gradedBy: PersonRef | null;
  gradedAt: string | null;
}

export interface HomeworkDetail extends Homework {
  submissions: Submission[];
}

export interface ExamStats {
  students: number;
  graded: number;
  averageScore: number;
  averagePercentage: number;
  passRate: number;
  highest: number;
  lowest: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  status: ExamStatus;
  date: string;
  maxScore: number;
  passScore: number | null;
  /** Vaqt chegarasi (daqiqa) — bo‘sh bo‘lsa cheklanmagan */
  durationMinutes: number | null;
  /** Ruxsat etilgan urinishlar (0 — cheklanmagan) */
  maxAttempts: number;
  xpReward: number;
  course: { id: string; name: string } | null;
  group: { id: string; name: string };
  teacher: PersonRef | null;
  stats: ExamStats;
}

export interface ExamResult {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  score: number | null;
  percentage: number | null;
  grade: string | null;
  comment: string | null;
  passed: boolean | null;
  xpAwarded: number;
  gradedAt: string | null;
  gradedBy: PersonRef | null;
}

export interface ExamDetail extends Exam {
  results: ExamResult[];
}

export interface HomeworkListParams {
  page: number;
  limit: number;
  search?: string;
  groupId?: string;
  courseId?: string;
  status?: HomeworkStatus;
  from?: string;
  to?: string;
  sortBy?: 'deadline' | 'assignedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface ExamListParams {
  page: number;
  limit: number;
  search?: string;
  groupId?: string;
  courseId?: string;
  status?: ExamStatus;
  from?: string;
  to?: string;
  sortBy?: 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface HomeworkPayload {
  title: string;
  description?: string;
  groupId: string;
  deadline: string;
  maxPoints: number;
  xpReward: number;
  status: HomeworkStatus;
}

export interface ExamPayload {
  title: string;
  description?: string;
  groupId: string;
  date: string;
  maxScore: number;
  passScore?: number;
  durationMinutes?: number;
  maxAttempts?: number;
  xpReward: number;
  status: ExamStatus;
}

export interface GradeRecord {
  studentId: string;
  status?: SubmissionStatus;
  score?: number;
  feedback?: string;
}

export interface ExamResultRecord {
  studentId: string;
  score: number;
  comment?: string;
}
