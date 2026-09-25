import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AiAnalysis, HomeworkReviewResult } from '@/types/aiAcademic';
import { AiReviewPanel } from './AiReviewPanel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/aiAcademic.service', () => ({ aiAcademicService: { latestReview: vi.fn(), review: vi.fn(), accept: vi.fn() } }));
const { aiAcademicService } = await import('@/services/aiAcademic.service');

const REVIEW: AiAnalysis<HomeworkReviewResult> = {
  id: 'an1',
  kind: 'HOMEWORK_REVIEW',
  subjectType: 'submission',
  subjectId: 'hw1:st1',
  status: 'READY',
  source: 'LLM',
  summary: 'Asosan to‘g‘ri. Taklif etilgan ball: 72/100.',
  result: {
    homeworkId: 'hw1',
    studentId: 'st1',
    maxPoints: 100,
    criteria: { correctness: 80, completeness: 70, quality: 60, understanding: 75 },
    suggestedScore: 72,
    errors: ['Bo‘sh massiv holati yo‘q'],
    suggestions: ['textContent ishlating'],
    codeFindings: [],
    similarity: [{ studentId: 'st2', studentName: 'Barno Test', score: 91, sameLink: false }],
    filesNote: null,
    items: [
      { type: 'FACT', text: 'Topshirilgan: kod (javascript).' },
      { type: 'FACT', text: 'Yuqori o‘xshashlik aniqlandi: Barno Test bilan 91% (signal, hukm emas).' },
      { type: 'OBSERVATION', text: 'Bo‘sh massiv holati yo‘q' },
      { type: 'RECOMMENDATION', text: 'textContent ishlating' },
    ],
  },
  model: 'claude-sonnet-5',
  createdAt: '2026-09-26T10:00:00.000Z',
  createdBy: null,
  decidedAt: null,
  decision: null,
};

function renderPanel(onUseScore = vi.fn(), onAccepted = vi.fn()) {
  vi.mocked(aiAcademicService.latestReview).mockResolvedValue(REVIEW);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiReviewPanel homeworkId="hw1" studentId="st1" maxPoints={100} feedback="  Yaxshi ish  " onUseScore={onUseScore} onAccepted={onAccepted} />
    </QueryClientProvider>,
  );
  return { onUseScore, onAccepted };
}

/** AI vazifa tekshiruvi: taklif — o'qituvchi qabul qiladi yoki tahrirlaydi (§34) */
describe('AiReviewPanel', () => {
  it('mezonlar, o‘xshashlik signali (hukm emas) va fakt/kuzatuv/tavsiya ko‘rinadi', async () => {
    renderPanel();
    expect(await screen.findByText('72/100')).toBeInTheDocument();
    expect(screen.getByText('To‘g‘rilik')).toBeInTheDocument();
    expect(screen.getByText(/Barno Test: 91%/)).toHaveTextContent('Bu hukm emas');
    expect(screen.getByRole('region', { name: 'Kuzatuv' })).toHaveTextContent('Bo‘sh massiv holati yo‘q');
    expect(screen.getByRole('region', { name: 'Tavsiya' })).toHaveTextContent('textContent ishlating');
    // O'xshashlik faktlar ro'yxatida takrorlanmaydi (alohida ogohlantirishda)
    expect(screen.getByRole('region', { name: 'Fakt' })).not.toHaveTextContent('o‘xshashlik');
  });

  it('"Qabul qilish" — o‘qituvchi izohi bilan; "Ballni tahrirlash" — formaga qo‘yadi', async () => {
    vi.mocked(aiAcademicService.accept).mockResolvedValue({ message: 'ok', data: { ...REVIEW, status: 'ACCEPTED', decision: { score: 72 } } });
    const { onUseScore, onAccepted } = renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ballni tahrirlash' }));
    expect(onUseScore).toHaveBeenCalledWith(72);
    await user.click(screen.getByRole('button', { name: 'Qabul qilish' }));
    await waitFor(() => expect(aiAcademicService.accept).toHaveBeenCalledWith('an1', { feedback: 'Yaxshi ish' }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });
});
