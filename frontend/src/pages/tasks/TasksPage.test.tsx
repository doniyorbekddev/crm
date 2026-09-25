import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TasksPage from './TasksPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => false }));
vi.mock('@/services/task.service', () => ({
  taskService: {
    list: vi.fn().mockResolvedValue({
      openCount: 1,
      items: [
        {
          id: 't1',
          title: '3 darsga kelmadi: Ali Test',
          description: 'Ali Test (F-1): ketma-ket 3 darsga kelmadi.',
          status: 'OPEN',
          dueAt: '2026-09-20T10:00:00.000Z',
          overdue: true,
          link: '/students/s1',
          entityType: 'student',
          entityId: 's1',
          assignee: { id: 'u1', firstName: 'Bobur', lastName: 'I' },
          rule: { key: 'custom_1', name: '3 darsga kelmadi' },
          createdAt: '2026-09-19T10:00:00.000Z',
          completedAt: null,
        },
      ],
    }),
    setStatus: vi.fn().mockResolvedValue({ data: {}, message: 'Bajarildi' }),
  },
}));
const { taskService } = await import('@/services/task.service');

describe('TasksPage', () => {
  it('ochiq ishlar, muddati o‘tganlik va "Bajarildi"', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <TasksPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const item = (await screen.findByRole('link', { name: '3 darsga kelmadi: Ali Test' })).closest('li')!;
    expect(within(item).getByText('Muddati o‘tgan')).toBeInTheDocument();
    expect(within(item).getByText(/qoida: 3 darsga kelmadi/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Kimniki')).not.toBeInTheDocument();
    await userEvent.setup().click(within(item).getByRole('button', { name: 'Bajarildi' }));
    await waitFor(() => expect(taskService.setStatus).toHaveBeenCalledWith('t1', 'DONE'));
  });
});
