import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroupMasteryModal } from './GroupMasteryModal';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => false }));
vi.mock('@/services/mastery.service', () => ({
  masteryService: {
    group: vi.fn().mockResolvedValue({
      groupId: 'g1',
      settings: { thresholds: { developing: 40, good: 60, mastered: 80 }, weights: { exam: 50, homework: 30, attendance: 10, lessons: 10 } },
      topics: [
        { id: 't1', title: 'Massivlar', moduleTitle: 'JS', average: 75, mastered: 1 },
        { id: 't2', title: 'DOM', moduleTitle: 'JS', average: null, mastered: 0 },
      ],
      students: [
        {
          id: 's1',
          fullName: 'Test Anvar',
          overall: 100,
          cells: { t1: { score: 100, status: 'MASTERED' }, t2: { score: null, status: 'LEARNING' } },
        },
        { id: 's2', fullName: 'Test Barno', overall: 50, cells: { t1: { score: 50, status: 'LEARNING' }, t2: { score: null, status: 'NOT_STARTED' } } },
      ],
    }),
  },
}));

describe('GroupMasteryModal', () => {
  it('o‘quvchi × mavzu matritsasi, guruh o‘rtachasi; ruxsatsiz — chegaralar tugmasi yo‘q', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GroupMasteryModal group={{ id: 'g1', name: 'Frontend-12' }} onClose={() => {}} />
      </QueryClientProvider>,
    );
    const anvar = await screen.findByRole('row', { name: /Test Anvar/ });
    expect(within(anvar).getByText('100')).toHaveAttribute('title', 'Massivlar: O‘zlashtirilgan');
    expect(within(anvar).getByText('—')).toHaveAttribute('title', 'DOM: O‘rganilmoqda');
    const barno = screen.getByRole('row', { name: /Test Barno/ });
    expect(within(barno).getByText('·')).toHaveAttribute('title', 'DOM: Boshlanmagan');
    expect(screen.getByRole('row', { name: /Guruh o‘rtachasi/ })).toHaveTextContent('75%');
    expect(screen.queryByRole('button', { name: 'Chegaralar' })).not.toBeInTheDocument();
  });
});
