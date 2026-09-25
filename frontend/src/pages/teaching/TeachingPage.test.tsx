import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TeachingGroup, TeachingOverview } from '@/types/teaching';
import TeachingPage from './TeachingPage';
import TeachingGroupPage from './TeachingGroupPage';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => false }));
vi.mock('@/pages/groups/GroupMasteryModal', () => ({ GroupMasteryModal: () => null }));

const CARD: TeachingOverview['groups'][number] = {
  id: 'g1',
  name: 'Frontend-12',
  course: { id: 'c1', name: 'Frontend' },
  teacher: null,
  schedule: { days: ['MONDAY', 'WEDNESDAY'], startTime: '14:00', endTime: '16:00' },
  students: 18,
  attendanceRate: 91,
  homeworkRate: 55,
  examAverage: 78,
  progress: null,
  risk: { HEALTHY: 14, ATTENTION: 2, AT_RISK: 1, CRITICAL: 1 },
  pending: { homeworkToGrade: 4, attemptsToReview: 2 },
  today: { isLessonDay: true, attendanceMarked: false },
};

vi.mock('@/services/teaching.service', () => ({
  teachingService: {
    overview: vi.fn().mockResolvedValue({
      totals: { groups: 1, students: 18, atRisk: 2, homeworkToGrade: 4, attemptsToReview: 2, lessonsToday: 1, unmarkedToday: 1 },
      groups: [
        {
          id: 'g1',
          name: 'Frontend-12',
          course: { id: 'c1', name: 'Frontend' },
          teacher: null,
          schedule: { days: ['MONDAY', 'WEDNESDAY'], startTime: '14:00', endTime: '16:00' },
          students: 18,
          attendanceRate: 91,
          homeworkRate: 55,
          examAverage: 78,
          progress: null,
          risk: { HEALTHY: 14, ATTENTION: 2, AT_RISK: 1, CRITICAL: 1 },
          pending: { homeworkToGrade: 4, attemptsToReview: 2 },
          today: { isLessonDay: true, attendanceMarked: false },
        },
      ],
    } satisfies TeachingOverview),
    group: vi.fn(),
  },
}));

const { teachingService } = await import('@/services/teaching.service');

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/teaching" element={<TeachingPage />} />
          <Route path="/teaching/groups/:id" element={<TeachingGroupPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** O'qituvchi markazi: guruh kartalari, kutilayotgan ishlar va guruh jadvali */
describe('TeachingPage', () => {
  it('guruh kartasi: ko‘rsatkichlar, xavf, bugungi dars va tez amallar', async () => {
    renderAt('/teaching');
    const link = await screen.findByRole('link', { name: 'Frontend-12' });
    expect(link).toHaveAttribute('href', '/teaching/groups/g1');
    expect(screen.getByText('Bugun dars · davomat yo‘q')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('2 xavf ostida', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Davomat/ })).toHaveAttribute('href', '/attendance?groupId=g1');
    expect(screen.getByRole('link', { name: /4 baholash/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 tekshirish/ })).toBeInTheDocument();
    // Ruxsatsiz — o'qituvchi tanlash yo'q
    expect(screen.queryByLabelText('O‘qituvchi')).not.toBeInTheDocument();
  });

  it('guruh jadvali: risk sabablari va oxirgi faollik', async () => {
    vi.mocked(teachingService.group).mockResolvedValue({
      group: CARD,
      students: [
        {
          id: 's1',
          number: 45,
          code: 'ST-000045',
          firstName: 'Anvar',
          lastName: 'Karimov',
          attendanceRate: 40,
          homeworkRate: 20,
          examAverage: 55,
          progress: 48,
          riskLevel: 'CRITICAL',
          healthScore: 22,
          reasons: ['Davomat: 40%', 'Ketma-ket topshirilmagan vazifa: 3 ta'],
          factors: [],
          lastActivityAt: null,
          lastLoginAt: null,
          hasPortalAccount: true,
        },
      ],
    } satisfies TeachingGroup);
    renderAt('/teaching/groups/g1');
    const row = await screen.findByRole('row', { name: /Karimov Anvar/ });
    expect(within(row).getByText('ST-000045')).toBeInTheDocument();
    expect(within(row).getByText('Davomat: 40%; Ketma-ket topshirilmagan vazifa: 3 ta')).toBeInTheDocument();
    expect(within(row).getByText('Kabinetga kirmagan')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Karimov Anvar' })).toHaveAttribute('href', '/students/s1');
  });
});
