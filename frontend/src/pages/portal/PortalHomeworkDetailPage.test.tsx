import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalContext } from '@/layouts/PortalContext';
import type { PortalHomeworkDetail } from '@/types/portal';
import PortalHomeworkDetailPage from './PortalHomeworkDetailPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/portal.service', () => ({
  portalService: {
    homeworkDetail: vi.fn(),
    submitHomework: vi.fn(),
    submitHomeworkAttachment: vi.fn(),
    downloadHomeworkAttachment: vi.fn(),
  },
}));

const { portalService } = await import('@/services/portal.service');

const DETAIL: PortalHomeworkDetail = {
  homework: {
    id: 'hw1',
    title: 'Massivlar',
    description: 'map va filter bilan mashq',
    status: 'PUBLISHED',
    assignedAt: '2026-09-20T09:00:00.000Z',
    deadline: '2099-01-01T09:00:00.000Z',
    maxPoints: 100,
    xpReward: 20,
    groupName: 'Frontend-12',
    courseName: 'Frontend',
    teacherName: 'Bobur Ismoilov',
  },
  submission: { status: 'PENDING', submittedAt: null, score: null, feedback: null, answerText: null, hasAttachment: false, xpAwarded: 0, gradedAt: null },
  canSubmit: true,
  isLate: false,
};

function renderPage(detail: PortalHomeworkDetail) {
  vi.mocked(portalService.homeworkDetail).mockResolvedValue(detail);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalContext.Provider
        value={{
          me: { kind: 'STUDENT', fullName: 'Aziz Test', children: [], unreadNotifications: 0, telegramLinked: false },
          activeChild: 'st1',
          setActiveChild: () => {},
        }}
      >
        <MemoryRouter initialEntries={['/portal/homework/hw1']}>
          <Routes>
            <Route path="/portal/homework/:id" element={<PortalHomeworkDetailPage />} />
          </Routes>
        </MemoryRouter>
      </PortalContext.Provider>
    </QueryClientProvider>,
  );
}

/**
 * Vazifa topshirish — kabinetning asosiy amali. Backend real testda tekshiriladi,
 * bu yerda forma to'g'ri so'rov yuborishi va holatga qarab yashirinishi sinaladi.
 */
describe('PortalHomeworkDetailPage', () => {
  beforeEach(() => {
    vi.mocked(portalService.submitHomework).mockReset();
    vi.mocked(portalService.submitHomeworkAttachment).mockReset();
  });

  it('matnli javob yuboriladi va servis to‘g‘ri argumentlar bilan chaqiriladi', async () => {
    vi.mocked(portalService.submitHomework).mockResolvedValue({ data: {}, message: 'ok' });
    renderPage(DETAIL);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { level: 1, name: 'Massivlar' })).toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: 'Topshirish' });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Javob matni'), 'Mening javobim');
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    await waitFor(() => expect(portalService.submitHomework).toHaveBeenCalledWith('hw1', { answerText: 'Mening javobim' }, 'st1'));
    expect(portalService.submitHomeworkAttachment).not.toHaveBeenCalled();
  });

  it('baholangan vazifada forma o‘rniga tushuntirish, ball va izoh ko‘rinadi', async () => {
    renderPage({
      ...DETAIL,
      submission: {
        status: 'GRADED',
        submittedAt: '2026-09-21T10:00:00.000Z',
        score: 85,
        feedback: 'Yaxshi, lekin filter sharti noto‘g‘ri',
        answerText: 'const a = []',
        hasAttachment: false,
        xpAwarded: 20,
        gradedAt: '2026-09-22T10:00:00.000Z',
      },
      canSubmit: false,
    });

    expect(await screen.findByText(/qayta topshirib bo‘lmaydi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Topshirish' })).not.toBeInTheDocument();
    expect(screen.getByText('85/100')).toBeInTheDocument();
    expect(screen.getByText(/filter sharti noto‘g‘ri/)).toBeInTheDocument();
  });
});
