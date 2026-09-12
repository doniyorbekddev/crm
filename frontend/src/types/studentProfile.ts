import type { GamificationProfile } from './gamification';
import type { ExamStatus, HomeworkStatus, SubmissionStatus } from './homework';
import type { PersonRef } from './lead';
import type { StudentItem } from './student';

export interface ProgressPoint {
  month: string;
  label: string;
  attendanceRate: number | null;
  homeworkRate: number | null;
  examAverage: number | null;
  xp: number;
}

export interface StudentFeedback {
  type: 'homework' | 'exam';
  title: string;
  text: string;
  percentage: number | null;
  author: PersonRef | null;
  date: string;
}

export interface StudentActivity {
  type: 'attendance' | 'payment' | 'homework' | 'exam' | 'xp' | 'badge';
  title: string;
  description: string;
  date: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface StudentProfile {
  student: StudentItem;
  gamification: GamificationProfile;
  attendance: { total: number; present: number; absent: number; late: number; excused: number; rate: number };
  homework: {
    assigned: number;
    submitted: number;
    graded: number;
    late: number;
    missed: number;
    pending: number;
    rate: number;
    averagePercent: number;
  };
  exams: { count: number; averagePercent: number; best: number | null; lastGrade: string | null };
  payments: { total: number; count: number; lastPaidAt: string | null } | null;
  progress: ProgressPoint[];
  feedback: StudentFeedback[];
  activity: StudentActivity[];
}

export interface StudentHomeworkRow {
  homeworkId: string;
  title: string;
  groupName: string;
  deadline: string;
  homeworkStatus: HomeworkStatus;
  status: SubmissionStatus;
  submittedAt: string | null;
  score: number | null;
  maxPoints: number;
  feedback: string | null;
  xpAwarded: number;
}

export interface StudentExamRow {
  examId: string;
  title: string;
  groupName: string;
  date: string;
  examStatus: ExamStatus;
  score: number;
  maxScore: number;
  percentage: number;
  grade: string | null;
  passed: boolean | null;
  comment: string | null;
  xpAwarded: number;
}
