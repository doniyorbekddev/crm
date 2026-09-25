import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalContext } from '@/layouts/PortalContext';
import type { AttemptView } from '@/types/portal';
import PortalAttemptPage from './PortalAttemptPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/portal.service', () => ({
  portalService: {
    attempt: vi.fn(),
    saveExamAnswer: vi.fn(),
    uploadExamAnswerFile: vi.fn(),
    submitExam: vi.fn(),
  },
}));

const { portalService } = await import('@/services/portal.service');

const IN_PROGRESS: AttemptView = {
  attemptId: 'at1',
  examId: 'ex1',
  examTitle: 'Haftalik JS testi',
  examType: 'WEEKLY_TEST',
  status: 'IN_PROGRESS',
  startedAt: '2026-09-25T09:00:00.000Z',
  deadline: '2099-01-01T00:00:00.000Z',
  questions: [
    {
      id: 'q1',
      order: 1,
      text: 'Massiv uzunligi qaysi xossada?',
      type: 'SINGLE_CHOICE',
      points: 1,
      options: [
        { id: 'o1', text: 'length' },
        { id: 'o2', text: 'size' },
      ],
      answer: { optionIds: [], text: null, hasFile: false },
    },
    { id: 'q2', order: 2, text: 'Closure nima?', type: 'LONG_TEXT', points: 5, options: [], answer: { optionIds: [], text: null, hasFile: false } },
  ],
  summary: null,
};

function renderPage(view: AttemptView, kind: 'STUDENT' | 'PARENT' = 'STUDENT') {
  vi.mocked(portalService.attempt).mockResolvedValue(view);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalContext.Provider
        value={{
          me: { kind, fullName: 'Aziz Test', children: [], unreadNotifications: 0, telegramLinked: false },
          activeChild: 'st1',
          setActiveChild: () => {},
        }}
      >
        <MemoryRouter initialEntries={['/portal/attempts/at1']}>
          <Routes>
            <Route path="/portal/attempts/:id" element={<PortalAttemptPage />} />
          </Routes>
        </MemoryRouter>
      </PortalContext.Provider>
    </QueryClientProvider>,
  );
}

/** Onlayn imtihon sahifasi: avtosaqlash, topshirishni tasdiqlash, natija va ota-ona ko'rinishi */
describe('PortalAttemptPage', () => {
  beforeEach(() => {
    vi.mocked(portalService.saveExamAnswer).mockReset().mockResolvedValue();
    vi.mocked(portalService.submitExam).mockReset();
  });

  it('variant tanlanganda darhol, matn yozish to‘xtagach saqlanadi; taymer ko‘rinadi', async () => {
    renderPage(IN_PROGRESS);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Haftalik JS testi' })).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Qolgan vaqt' })).toBeInTheDocument();
    expect(screen.getByText('0/2 javob berildi', { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'length' }));
    await waitFor(() => expect(portalService.saveExamAnswer).toHaveBeenCalledWith('at1', 'q1', { optionIds: ['o1'] }));
    expect(await screen.findByText('Saqlandi')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: '2. Closure nima?' }), 'Ichki funksiya');
    await waitFor(() => expect(portalService.saveExamAnswer).toHaveBeenCalledWith('at1', 'q2', { text: 'Ichki funksiya' }), { timeout: 2000 });
    // Har harf uchun emas — yozish to'xtagach bir marta
    expect(vi.mocked(portalService.saveExamAnswer).mock.calls.filter((call) => call[1] === 'q2')).toHaveLength(1);
  });

  it('topshirishdan oldin javobsiz savollar haqida ogohlantiradi va tasdiqlangach yuboradi', async () => {
    vi.mocked(portalService.submitExam).mockResolvedValue({
      message: 'Imtihon topshirildi',
      data: { ...IN_PROGRESS, status: 'GRADED', summary: { score: 0, maxScore: 6, percentage: 0, passed: false } },
    });
    renderPage(IN_PROGRESS);
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Topshirish' }))[0]!);
    expect(await screen.findByText(/2 ta savolga javob berilmagan/)).toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Topshirish' }));
    await waitFor(() => expect(portalService.submitExam).toHaveBeenCalledWith('at1'));
    expect(await screen.findByText('O‘tmadi')).toBeInTheDocument();
  });

  it('natija: to‘g‘ri javob, tushuntirish va o‘qituvchi izohi', async () => {
    renderPage({
      ...IN_PROGRESS,
      status: 'GRADED',
      summary: { score: 5, maxScore: 6, percentage: 83, passed: true },
      questions: [
        {
          ...IN_PROGRESS.questions[0]!,
          answer: { optionIds: ['o2'], text: null, hasFile: false },
          result: { score: 0, isCorrect: false, correctOptionIds: ['o1'], explanation: 'length elementlar sonini beradi', feedback: null },
        },
        {
          ...IN_PROGRESS.questions[1]!,
          answer: { optionIds: [], text: 'Ichki funksiya', hasFile: false },
          result: { score: 5, isCorrect: true, correctOptionIds: [], explanation: null, feedback: 'Zo‘r misol' },
        },
      ],
    });
    expect(await screen.findByText('83%')).toBeInTheDocument();
    expect(screen.getByText('O‘tdi')).toBeInTheDocument();
    expect(screen.getByText(/length elementlar sonini beradi/)).toBeInTheDocument();
    expect(screen.getByText(/Zo‘r misol/)).toBeInTheDocument();
    expect(screen.getByText(/sizning javobingiz/)).toHaveTextContent('size');
    expect(screen.queryByRole('button', { name: 'Topshirish' })).not.toBeInTheDocument();
  });

  it('ota-ona tugallanmagan urinishda javob bera olmaydi', async () => {
    renderPage(IN_PROGRESS, 'PARENT');
    expect(await screen.findByText('Imtihon hali topshirilmoqda.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(portalService.attempt).toHaveBeenCalledWith('at1', 'st1');
  });
});
