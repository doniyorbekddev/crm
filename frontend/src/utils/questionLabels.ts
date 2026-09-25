import type { QuestionDifficulty, QuestionType } from '@/types/question';

/** Savol turlari — tartib formadagi ro'yxat tartibi */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Bitta to‘g‘ri javob',
  MULTIPLE_CHOICE: 'Bir nechta to‘g‘ri javob',
  TRUE_FALSE: 'To‘g‘ri / noto‘g‘ri',
  SHORT_TEXT: 'Qisqa javob (avtomatik)',
  TEXT: 'Matnli javob (qo‘lda baholanadi)',
  LONG_TEXT: 'Uzun javob / esse (qo‘lda)',
  CODE: 'Kod yozish (qo‘lda)',
  FILE_UPLOAD: 'Fayl yuklash (qo‘lda)',
};

export const QUESTION_TYPE_SHORT: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Bitta javob',
  MULTIPLE_CHOICE: 'Bir nechta javob',
  TRUE_FALSE: 'To‘g‘ri/noto‘g‘ri',
  SHORT_TEXT: 'Qisqa javob',
  TEXT: 'Matnli',
  LONG_TEXT: 'Esse',
  CODE: 'Kod',
  FILE_UPLOAD: 'Fayl',
};

export const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  EASY: 'Oson',
  MEDIUM: 'O‘rtacha',
  HARD: 'Qiyin',
};

/** Variantli (avtomatik baholanadigan) turlar — backenddagi ro'yxat bilan bir xil */
export const CHOICE_QUESTION_TYPES: readonly QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'];

export function isChoiceQuestion(type: QuestionType): boolean {
  return CHOICE_QUESTION_TYPES.includes(type);
}
