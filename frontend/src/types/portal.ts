import type { StudentProfile } from './studentProfile';
import type { PaymentSchedule } from './paymentSchedule';
import type { PaymentMethod } from './payment';
import type { Difficulty, ExamStatus, ExamType, HomeworkAttachment, HomeworkStatus, RubricCriterion, SubmissionFile, SubmissionStatus } from './homework';
import type { RiskLevel } from './student';
import type { AttemptStatus, ExamAttempt, QuestionType } from './question';
import type { StudentExamRow } from './studentProfile';

export interface PortalChild {
  studentId: string;
  firstName: string;
  lastName: string;
  /** "ST-000045" */
  code: string;
  groupName: string | null;
  courseName: string;
}

export interface PortalMe {
  kind: 'STUDENT' | 'PARENT';
  fullName: string;
  /** Ota-ona uchun farzandlar; o‘quvchi uchun bitta yozuv */
  children: PortalChild[];
  /** Sarlavhadagi qo‘ng‘iroqcha uchun */
  unreadNotifications: number;
  /** Telegram bog‘langan va tasdiqlangan */
  telegramLinked: boolean;
}

export type PortalProfile = StudentProfile;
export type PortalSchedule = PaymentSchedule;

export interface PortalAccount {
  userId: string;
  email: string;
  /** Kirish uchun: o‘quvchida ID raqami (ST-000045), ota-onada email */
  login: string;
  /** Vaqtinchalik parol — faqat yaratish javobida ko‘rinadi */
  temporaryPassword: string;
}

export interface PortalLesson {
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  status: 'PLANNED' | 'HELD' | 'CANCELLED';
  topic?: string | null;
}

export interface PortalLessons {
  group: { id: string; name: string; course: string } | null;
  /** O‘qituvchi haqida faqat ism va yo‘nalish — aloqa ma’lumotlari ko‘rsatilmaydi */
  teacher: { name: string; specialization: string | null } | null;
  lessons: PortalLesson[];
}

export interface PortalPaymentHistoryItem {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
}

export interface PortalPayments {
  schedule: PaymentSchedule;
  /** So‘nggi 20 ta to‘lov */
  history: PortalPaymentHistoryItem[];
}

export interface HomeworkSubmitPayload {
  answerText?: string;
  linkUrl?: string;
  codeText?: string;
  codeLanguage?: string;
}

export interface PortalOverview {
  /** Kurs dasturi bo‘yicha progress 0–100; dastur yo‘q — null */
  courseProgress: number | null;
  /** Yumshoq ko‘rinish: daraja va sabablar, ball yo‘q */
  risk: { level: RiskLevel; reasons: string[] } | null;
  nextLesson: PortalLesson | null;
  pendingHomework: { count: number; next: { homeworkId: string; title: string; deadline: string } | null };
  nextExam: { examId: string; title: string; date: string } | null;
}

export interface PortalHomeworkDetail {
  homework: {
    id: string;
    title: string;
    description: string | null;
    status: HomeworkStatus;
    assignedAt: string;
    deadline: string;
    maxPoints: number;
    xpReward: number;
    groupName: string;
    courseName: string | null;
    teacherName: string | null;
    difficulty: Difficulty | null;
    topic: { id: string; title: string } | null;
    lesson: { id: string; title: string } | null;
  };
  attachments: HomeworkAttachment[];
  submission: {
    status: SubmissionStatus;
    submittedAt: string | null;
    score: number | null;
    feedback: string | null;
    answerText: string | null;
    linkUrl: string | null;
    codeText: string | null;
    codeLanguage: string | null;
    hasAttachment: boolean;
    files: SubmissionFile[];
    xpAwarded: number;
    gradedAt: string | null;
    returnedAt: string | null;
  };
  rubric: { criteria: RubricCriterion[]; scores: Record<string, number> | null } | null;
  maxFiles: number;
  canSubmit: boolean;
  isLate: boolean;
}

export interface PortalExamDetail {
  exam: {
    id: string;
    title: string;
    description: string | null;
    date: string;
    maxScore: number;
    passScore: number | null;
    status: ExamStatus;
    groupName: string;
  };
  result: StudentExamRow | null;
  attempts: ExamAttempt[];
}

export interface BulkPortalAccountRow {
  studentId: string;
  code: string;
  fullName: string;
  groupName: string | null;
  login: string;
  temporaryPassword: string;
}

export interface BulkPortalAccountsResult {
  created: BulkPortalAccountRow[];
  /** Allaqachon kabineti bor */
  skipped: number;
}

export interface BulkParentPortalAccountRow {
  parentId: string;
  fullName: string;
  /** Farzandlari (vergul bilan) */
  children: string;
  login: string;
  temporaryPassword: string;
}

export interface BulkParentPortalAccountsResult {
  created: BulkParentPortalAccountRow[];
  skipped: number;
  duplicatePhones: string[];
}

/** Ota-ona bosh sahifasidagi farzand kartasi */
export interface PortalChildSummary {
  studentId: string;
  code: string;
  fullName: string;
  groupName: string | null;
  courseName: string;
  attendanceRate: number;
  homeworkRate: number;
  examAverage: number | null;
  totalXp: number;
  level: number;
  debt: { remaining: number; overdue: number };
  risk: RiskLevel | null;
  nextLesson: PortalLesson | null;
}

export interface WeeklyReport {
  student: { id: string; code: string; fullName: string; groupName: string | null; courseName: string };
  week: { start: string; end: string; label: string };
  attendance: { present: number; late: number; excused: number; absent: number; total: number; rate: number | null; absentDates: string[] };
  homework: {
    total: number;
    submitted: number;
    late: number;
    missed: number;
    pending: number;
    averagePercent: number | null;
    items: Array<{ title: string; deadline: string; status: SubmissionStatus; score: number | null; maxPoints: number }>;
  };
  exams: Array<{ title: string; date: string; percentage: number; grade: string | null; passed: boolean | null }>;
  xp: { earned: number; total: number; level: number };
  progress: { coursePercent: number | null; topicsCompleted: string[] };
  topics: { strong: string[]; weak: string[] };
  feedback: Array<{ source: 'homework' | 'exam'; title: string; text: string; author: string | null; date: string }>;
  summary: string[];
}

/** Onlayn topshiriladigan imtihon (TZ §21–25) */
export interface AvailableExam {
  examId: string;
  title: string;
  type: ExamType;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number | null;
  maxAttempts: number;
  attemptsUsed: number;
  openAttemptId: string | null;
  questionCount: number;
  canStart: boolean;
  /** Boshlab bo'lmasa — sababi */
  reason: string | null;
  lastResult: { percentage: number; status: AttemptStatus } | null;
}

export interface AttemptQuestionView {
  id: string;
  order: number;
  text: string;
  type: QuestionType;
  points: number;
  options: Array<{ id: string; text: string }>;
  answer: { optionIds: string[]; text: string | null; hasFile: boolean };
  /** Faqat topshirilgandan keyin */
  result?: { score: number; isCorrect: boolean | null; correctOptionIds: string[]; explanation: string | null; feedback: string | null };
}

export interface AttemptView {
  attemptId: string;
  examId: string;
  examTitle: string;
  examType: ExamType;
  status: AttemptStatus;
  startedAt: string;
  deadline: string | null;
  questions: AttemptQuestionView[];
  summary: { score: number; maxScore: number; percentage: number; passed: boolean } | null;
}
