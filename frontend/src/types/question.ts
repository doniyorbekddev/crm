export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT' | 'TEXT' | 'LONG_TEXT' | 'CODE' | 'FILE_UPLOAD';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type AttemptStatus = 'IN_PROGRESS' | 'EXPIRED' | 'SUBMITTED' | 'NEEDS_REVIEW' | 'GRADED';

export interface QuestionOption {
  id: string;
  text: string;
  /** Faqat xodimga qaytariladi */
  isCorrect?: boolean;
  sortOrder: number;
}

export interface Question {
  id: string;
  courseId: string;
  topicId: string | null;
  topicTitle: string | null;
  text: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  points: number;
  answerHint: string | null;
  /** Natijadan keyin o'quvchiga ko'rsatiladi */
  explanation: string | null;
  tags: string[];
  /** SHORT_TEXT javob kaliti */
  acceptedAnswers: string[];
  isActive: boolean;
  createdAt: string;
  usedInExams: number;
  options: QuestionOption[];
}

export interface QuestionPayload {
  courseId?: string;
  topicId?: string;
  text: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  points: number;
  answerHint?: string;
  explanation?: string;
  tags?: string[];
  acceptedAnswers?: string[];
  isActive?: boolean;
  options: Array<{ text: string; isCorrect?: boolean }>;
}

export interface TopicBreakdown {
  topicId: string | null;
  topicTitle: string;
  score: number;
  maxScore: number;
  percent: number;
}

export interface AttemptAnswer {
  id: string;
  examQuestionId: string;
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  topicTitle: string | null;
  points: number;
  score: number;
  isCorrect: boolean | null;
  optionIds: string[];
  text: string | null;
  /** FILE_UPLOAD javobiga fayl yuklangan */
  hasFile: boolean;
  feedback: string | null;
  needsReview: boolean;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  attemptNo: number;
  status: AttemptStatus;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  startedAt: string;
  submittedAt: string | null;
  answers: AttemptAnswer[];
  topics: TopicBreakdown[];
  strongTopics: string[];
  weakTopics: string[];
}
