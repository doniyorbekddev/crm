import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import MyWorkPage from './MyWorkPage';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => false }));
vi.mock('@/services/myWork.service', () => ({
  myWorkService: {
    get: vi.fn().mockResolvedValue({
      total: 7,
      overdue: 1,
      sections: [
        {
          key: 'tasks',
          title: 'Vazifalar',
          count: 7,
          overdue: 1,
          link: '/tasks',
          items: [{ id: 't1', title: 'Ota-onaga qo‘ng‘iroq', subtitle: 'Berdi: Rahbar Admin', dueAt: '2026-09-20T10:00:00.000Z', overdue: true, link: '/students/s1' }],
        },
        { key: 'approvals', title: 'Tasdiq kutayotganlar', count: 0, overdue: 0, link: '/expenses', items: [] },
      ],
    }),
  },
}));

describe('MyWorkPage', () => {
  it('bo‘limlar, sonlar, kechikkanlar va havolalar ko‘rinadi', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <MyWorkPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const tasks = await screen.findByRole('region', { name: 'Vazifalar' });
    expect(screen.getByText('7 ta ish kutmoqda, 1 tasi kechikkan')).toBeInTheDocument();
    expect(within(tasks).getByText('1 ta kechikkan')).toBeInTheDocument();
    expect(within(tasks).getByRole('link', { name: 'Ota-onaga qo‘ng‘iroq' })).toHaveAttribute('href', '/students/s1');
    expect(within(tasks).getByRole('link', { name: 'Vazifalar — hammasi' })).toHaveAttribute('href', '/tasks');
    // Ro'yxatda 1 tasi ko'rsatilgan, jami 7 ta
    expect(within(tasks).getByText(/Yana 6 ta/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Tasdiq kutayotganlar' })).getByText('Kutilayotgan ish yo‘q')).toBeInTheDocument();
    // Ruxsatsiz xodimda "Yangi vazifa" tugmasi yo'q
    expect(screen.queryByRole('button', { name: 'Yangi vazifa' })).not.toBeInTheDocument();
  });
});
