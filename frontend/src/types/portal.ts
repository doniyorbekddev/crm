import type { StudentProfile } from './studentProfile';
import type { PaymentSchedule } from './paymentSchedule';
import type { PaymentMethod } from './payment';
import type { ExamStatus, HomeworkStatus, SubmissionStatus } from './homework';
import type { RiskLevel } from './student';
import type { ExamAttempt } from './question';
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
  answerText: string;
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
  };
  submission: {
    status: SubmissionStatus;
    submittedAt: string | null;
    score: number | null;
    feedback: string | null;
    answerText: string | null;
    hasAttachment: boolean;
    xpAwarded: number;
    gradedAt: string | null;
  };
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
