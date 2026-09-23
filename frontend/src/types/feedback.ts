export type FeedbackType = 'TEACHER' | 'COURSE' | 'ACADEMY' | 'NPS';

export interface Feedback {
  id: string;
  type: FeedbackType;
  rating: number | null;
  npsScore: number | null;
  comment: string | null;
  isAnonymous: boolean;
  /** Anonim fikrda null */
  student: { id: string; number: number; name: string } | null;
  teacher: { id: string; name: string } | null;
  course: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  isNegative: boolean;
  handledAt: string | null;
  handledBy: string | null;
  handleNote: string | null;
  createdAt: string;
}

export interface FeedbackStats {
  total: number;
  teacherAverage: number | null;
  courseAverage: number | null;
  academyAverage: number | null;
  /** −100 … +100; javob bo‘lmasa null */
  nps: number | null;
  npsResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  openNegative: number;
  ratingDistribution: Array<{ rating: number; count: number }>;
}

export interface FeedbackListParams {
  page: number;
  limit: number;
  type?: FeedbackType;
  teacherId?: string;
  studentId?: string;
  onlyNegative?: 'true';
  onlyOpen?: 'true';
}

export interface FeedbackPayload {
  type: FeedbackType;
  rating?: number;
  npsScore?: number;
  comment?: string;
  isAnonymous?: boolean;
  teacherId?: string;
}

export interface CreateFeedbackPayload extends FeedbackPayload {
  studentId: string;
}
