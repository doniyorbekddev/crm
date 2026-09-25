import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GroupAiModal } from './GroupAiModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/aiAcademic.service', () => ({
  aiAcademicService: {
    latestGroup: vi.fn().mockResolvedValue({
      id: 'g-an',
      kind: 'GROUP',
      subjectType: 'group',
      subjectId: 'g1',
      status: 'READY',
      source: 'RULES',
      summary: 'Guruhda Async JS mavzularini mustahkamlash kerak.',
      result: {
        metrics: { students: 12, attendanceRate: 90, homeworkRate: 72, examAverage: 68, progress: 61, atRisk: 2 },
        strongTopics: [{ id: 't1', title: 'HTML', average: 91 }],
        weakTopics: [{ id: 't2', title: 'Async JS', average: 38 }],
        actions: [{ type: 'REMEDIAL', topicId: 't2', title: 'Async JS', text: 'Async JS: mustahkamlash darsi va 10 savollik quiz' }],
        items: [{ type: 'FACT', text: 'Zaif mavzular: Async JS (38%).' }],
      },
      model: null,
      createdAt: '2026-09-26T10:00:00.000Z',
      createdBy: null,
      decidedAt: null,
      decision: null,
    }),
    analyzeGroup: vi.fn(),
    remedial: vi.fn().mockResolvedValue({
      id: 'rem1',
      kind: 'REMEDIAL',
      status: 'READY',
      source: 'RULES',
      summary: '',
      result: {
        groupId: 'g1',
        topic: { id: 't2', title: 'Async JS' },
        studentIds: [],
        steps: [
          { kind: 'LESSON', title: 'Dars: Promise', detail: 'material' },
          { kind: 'HOMEWORK', title: 'Takrorlash vazifasi: Async JS', detail: 'Qoralama' },
          { kind: 'QUIZ', title: 'Takrorlash testi: Async JS', detail: '10 savol' },
          { kind: 'RETEST', title: 'Qayta test', detail: '2 urinish' },
          { kind: 'MASTERY', title: 'O‘zlashtirish yangilanadi', detail: 'avtomatik' },
        ],
        quiz: { questionCount: 10, poolSize: 14 },
        items: [],
      },
    }),
    accept: vi.fn().mockResolvedValue({ message: 'ok', data: { decision: { homeworkId: 'hw9', examId: 'ex9' } } }),
    reject: vi.fn(),
  },
}));
const { aiAcademicService } = await import('@/services/aiAcademic.service');

describe('GroupAiModal', () => {
  it('zaif mavzu → remedial reja → tasdiqlash: qoralama vazifa va quiz', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <GroupAiModal group={{ id: 'g1', name: 'Frontend-12' }} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    expect(await screen.findByText('Guruhda Async JS mavzularini mustahkamlash kerak.')).toBeInTheDocument();
    expect(screen.getByText('Qoidalar rejimi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remedial reja' }));
    await waitFor(() => expect(aiAcademicService.remedial).toHaveBeenCalledWith({ groupId: 'g1', topicId: 't2' }));
    const plan = await screen.findByRole('region', { name: 'Remedial reja' });
    expect(plan).toHaveTextContent('Quiz: Takrorlash testi: Async JS');
    await user.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(aiAcademicService.accept).toHaveBeenCalledWith('rem1'));
    expect(await screen.findByRole('link', { name: 'qoralama vazifa' })).toHaveAttribute('href', '/homework');
    expect(screen.getByRole('link', { name: 'onlayn quiz' })).toBeInTheDocument();
  });
});
