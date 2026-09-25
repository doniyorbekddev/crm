import type { BadgeTone } from '@/components/ui/Badge';
import type { Difficulty, ExamStatus, ExamType, HomeworkStatus, HomeworkTarget, SubmissionStatus } from '@/types/homework';

export const HOMEWORK_STATUS_ORDER: readonly HomeworkStatus[] = ['DRAFT', 'PUBLISHED', 'CLOSED'];

export const HOMEWORK_STATUS_LABELS: Record<HomeworkStatus, string> = {
  DRAFT: 'Qoralama',
  PUBLISHED: 'E’lon qilingan',
  CLOSED: 'Yopilgan',
};

export const HOMEWORK_STATUS_TONES: Record<HomeworkStatus, BadgeTone> = {
  DRAFT: 'gray',
  PUBLISHED: 'blue',
  CLOSED: 'green',
};

export const SUBMISSION_STATUS_ORDER: readonly SubmissionStatus[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'LATE', 'GRADED', 'RETURNED', 'MISSED'];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: 'Kutilmoqda',
  IN_PROGRESS: 'Bajarilmoqda',
  SUBMITTED: 'Topshirdi',
  LATE: 'Kechikdi',
  GRADED: 'Baholandi',
  RETURNED: 'Qaytarildi',
  MISSED: 'Topshirmadi',
};

export const SUBMISSION_STATUS_TONES: Record<SubmissionStatus, BadgeTone> = {
  PENDING: 'gray',
  IN_PROGRESS: 'purple',
  SUBMITTED: 'blue',
  LATE: 'yellow',
  GRADED: 'green',
  RETURNED: 'yellow',
  MISSED: 'red',
};

export const HOMEWORK_TARGET_ORDER: readonly HomeworkTarget[] = ['GROUP', 'SELECTED', 'INDIVIDUAL'];

export const HOMEWORK_TARGET_LABELS: Record<HomeworkTarget, string> = {
  GROUP: 'Butun guruh',
  SELECTED: 'Tanlangan o‘quvchilar',
  INDIVIDUAL: 'Bitta o‘quvchi',
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Oson',
  MEDIUM: 'O‘rta',
  HARD: 'Qiyin',
};

export const DIFFICULTY_TONES: Record<Difficulty, BadgeTone> = {
  EASY: 'green',
  MEDIUM: 'blue',
  HARD: 'red',
};

export const EXAM_STATUS_ORDER: readonly ExamStatus[] = ['PLANNED', 'HELD', 'GRADED', 'CANCELLED'];

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  HELD: 'O‘tkazildi',
  GRADED: 'Baholandi',
  CANCELLED: 'Bekor qilingan',
};

export const EXAM_TYPE_ORDER: readonly ExamType[] = ['DAILY_QUIZ', 'WEEKLY_TEST', 'MONTHLY_EXAM', 'MIDTERM', 'FINAL', 'PRACTICE', 'DIAGNOSTIC'];

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  DAILY_QUIZ: 'Kunlik quiz',
  WEEKLY_TEST: 'Haftalik test',
  MONTHLY_EXAM: 'Oylik imtihon',
  MIDTERM: 'Oraliq imtihon',
  FINAL: 'Yakuniy imtihon',
  PRACTICE: 'Mashq testi',
  DIAGNOSTIC: 'Diagnostik test',
};

export const EXAM_STATUS_TONES: Record<ExamStatus, BadgeTone> = {
  PLANNED: 'blue',
  HELD: 'yellow',
  GRADED: 'green',
  CANCELLED: 'red',
};

/** Foizdan baho — backenddagi qoida bilan bir xil */
export function gradeLetter(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

export const GRADE_TONES: Record<string, BadgeTone> = {
  A: 'green',
  B: 'blue',
  C: 'yellow',
  D: 'yellow',
  F: 'red',
};
