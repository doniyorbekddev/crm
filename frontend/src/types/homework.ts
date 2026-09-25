import type { PersonRef } from './lead';

export type HomeworkStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type SubmissionStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'LATE' | 'GRADED' | 'RETURNED' | 'MISSED';
export type HomeworkTarget = 'GROUP' | 'SELECTED' | 'INDIVIDUAL';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type ExamStatus = 'PLANNED' | 'HELD' | 'GRADED' | 'CANCELLED';

export interface HomeworkStats {
  students: number;
  submitted: number;
  graded: number;
  pending: number;
  missed: number;
  returned: number;
  submissionRate: number;
  averageScore: number;
}

export interface HomeworkAttachment {
  id: string;
  kind: 'FILE' | 'LINK' | 'VIDEO';
  title: string;
  url: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface RubricCriterion {
  key: string;
  title: string;
  /** Og‘irlik, % (yig‘indi 100) */
  weight: number;
}

export interface Rubric {
  id: string;
  name: string;
  description: string | null;
  criteria: RubricCriterion[];
  isActive: boolean;
  createdBy: PersonRef | null;
}

export interface RubricPayload {
  name: string;
  description?: string;
  criteria: RubricCriterion[];
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
  targetType: HomeworkTarget;
  difficulty: Difficulty | null;
  topic: { id: string; title: string } | null;
  lesson: { id: string; title: string } | null;
  rubric: { id: string; name: string } | null;
  attachmentCount: number;
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
  hasText: boolean;
  hasLink: boolean;
  hasCode: boolean;
  fileCount: number;
}

export interface HomeworkDetail extends Homework {
  submissions: Submission[];
  attachments: HomeworkAttachment[];
  rubricCriteria: RubricCriterion[] | null;
}

export interface SubmissionFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** O‘qituvchi ko‘radigan to‘liq topshiriq */
export interface SubmissionDetail extends Submission {
  homeworkId: string;
  late: boolean;
  answerText: string | null;
  linkUrl: string | null;
  codeText: string | null;
  codeLanguage: string | null;
  rubricScores: Record<string, number> | null;
  returnedAt: string | null;
  files: SubmissionFile[];
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
  targetType?: HomeworkTarget;
  studentIds?: string[];
  topicId?: string | null;
  lessonId?: string | null;
  difficulty?: Difficulty | null;
  rubricId?: string | null;
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
  rubricScores?: Record<string, number>;
}

export interface ExamResultRecord {
  studentId: string;
  score: number;
  comment?: string;
}
