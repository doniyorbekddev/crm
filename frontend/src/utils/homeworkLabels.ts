import type { BadgeTone } from '@/components/ui/Badge';
import type { ExamStatus, HomeworkStatus, SubmissionStatus } from '@/types/homework';

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

export const SUBMISSION_STATUS_ORDER: readonly SubmissionStatus[] = ['PENDING', 'SUBMITTED', 'LATE', 'GRADED', 'MISSED'];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: 'Kutilmoqda',
  SUBMITTED: 'Topshirdi',
  LATE: 'Kechikdi',
  GRADED: 'Baholandi',
  MISSED: 'Topshirmadi',
};

export const SUBMISSION_STATUS_TONES: Record<SubmissionStatus, BadgeTone> = {
  PENDING: 'gray',
  SUBMITTED: 'blue',
  LATE: 'yellow',
  GRADED: 'green',
  MISSED: 'red',
};

export const EXAM_STATUS_ORDER: readonly ExamStatus[] = ['PLANNED', 'HELD', 'GRADED', 'CANCELLED'];

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  HELD: 'O‘tkazildi',
  GRADED: 'Baholandi',
  CANCELLED: 'Bekor qilingan',
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
