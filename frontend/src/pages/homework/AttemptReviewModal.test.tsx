import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptAnswer, ExamAttempt } from '@/types/question';
import { AttemptReviewModal } from './AttemptReviewModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/questions.service', () => ({
  questionsService: {
    gradeAttempt: vi.fn().mockResolvedValue({ data: {}, message: 'Baholandi' }),
    downloadAnswerFile: vi.fn(),
  },
}));
const { questionsService } = await import('@/services/questions.service');

function answer(overrides: Partial<AttemptAnswer>): AttemptAnswer {
  return {
    id: 'a1',
    examQuestionId: 'eq1',
    questionId: 'q1',
    questionText: 'Savol',
    questionType: 'LONG_TEXT',
    topicTitle: null,
    points: 5,
    score: 0,
    isCorrect: null,
    optionIds: [],
    text: null,
    hasFile: false,
    feedback: null,
    needsReview: true,
    ...overrides,
  };
}

const attempt: ExamAttempt = {
  id: 'att1',
  examId: 'e1',
  examTitle: 'Yakuniy',
  studentId: 's1',
  studentName: 'Ali Valiyev',
  attemptNo: 1,
  status: 'NEEDS_REVIEW',
  score: 3,
  maxScore: 10,
  percentage: 30,
  passed: false,
  startedAt: '2026-09-20T10:00:00.000Z',
  submittedAt: '2026-09-20T10:30:00.000Z',
  answers: [
    answer({ id: 'auto', questionText: 'Avto savol', questionType: 'SINGLE_CHOICE', points: 3, score: 3, isCorrect: true, needsReview: false }),
    answer({ id: 'essay', questionText: 'Esse: massivlar', text: 'Massiv — tartiblangan to‘plam', points: 5 }),
    answer({ id: 'code', questionText: 'Kod yozing', questionType: 'CODE', text: 'const x = 1', points: 2 }),
  ],
  topics: [],
  strongTopics: [],
  weakTopics: [],
};

function renderModal(onGraded = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AttemptReviewModal attempt={attempt} onClose={() => {}} onGraded={onGraded} />
    </QueryClientProvider>,
  );
  return onGraded;
}

describe('AttemptReviewModal (qo‘lda baholash, TZ §65)', () => {
  it('faqat tekshirilishi kerak bo‘lgan javoblar ko‘rsatiladi, o‘quvchi javobi bilan', () => {
    renderModal();
    expect(screen.getByText('Tekshirilishi kerak: 2 ta javob.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/Avto savol/)).not.toBeInTheDocument();
    expect(screen.getByText('Massiv — tartiblangan to‘plam')).toBeInTheDocument();
    expect(screen.getByText('const x = 1')).toBeInTheDocument();
  });

  it('ball bo‘sh yoki savol balidan katta bo‘lsa baholab bo‘lmaydi', async () => {
    const user = userEvent.setup();
    renderModal();
    const submit = screen.getByRole('button', { name: 'Baholash' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Ball (0–5)'), '6');
    await user.type(screen.getByLabelText('Ball (0–2)'), '2');
    expect(submit).toBeDisabled();
    await user.clear(screen.getByLabelText('Ball (0–5)'));
    await user.type(screen.getByLabelText('Ball (0–5)'), '4');
    expect(submit).toBeEnabled();
  });

  it('har javob uchun ball va izoh yuboriladi (bo‘sh izoh yuborilmaydi)', async () => {
    const user = userEvent.setup();
    const onGraded = renderModal();
    await user.type(screen.getByLabelText('Ball (0–5)'), '4');
    await user.type(screen.getByLabelText('Ball (0–2)'), '0');
    await user.type(screen.getAllByLabelText('Izoh')[0]!, '  Misol yetishmaydi ');
    await user.click(screen.getByRole('button', { name: 'Baholash' }));
    await waitFor(() => expect(onGraded).toHaveBeenCalled());
    expect(questionsService.gradeAttempt).toHaveBeenCalledWith('att1', [
      { answerId: 'essay', score: 4, feedback: 'Misol yetishmaydi' },
      { answerId: 'code', score: 0 },
    ]);
  });
});
