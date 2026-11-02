import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types/auth';
import type { TaskDetail, TaskItem } from '@/types/task';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import TasksPage from './TasksPage';

/** ORG §3.7: Yangi → Jarayonda → Tekshiruvda → Bajarildi; ijrochi topshiradi, bergan xodim qabul qiladi yoki qaytaradi */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));
vi.mock('@/services/task.service', () => ({
  taskService: {
    list: vi.fn(),
    get: vi.fn(),
    assignees: vi.fn().mockResolvedValue([]),
    setStatus: vi.fn().mockResolvedValue({ data: {}, message: 'Saqlandi' }),
    addComment: vi.fn(),
    assign: vi.fn(),
  },
}));
const { taskService } = await import('@/services/task.service');

const ME = { id: 'me', firstName: 'Shodiya', lastName: 'S' };
const BOSS = { id: 'boss', firstName: 'Doniyorbek', lastName: 'CEO' };

function task(overrides: Partial<TaskItem>): TaskItem {
  return {
    id: 't1',
    title: 'Sinov darsiga yozish',
    description: null,
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    dueAt: null,
    overdue: false,
    expectedResult: '5 ta yozuv',
    needsReview: true,
    submittedAt: null,
    link: null,
    entityType: null,
    entityId: null,
    assignee: ME,
    createdBy: BOSS,
    rule: null,
    alertId: null,
    commentCount: 0,
    escalatedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

function detail(overrides: Partial<TaskDetail>): TaskDetail {
  return { ...task(overrides), comments: [], assignments: [], can: { edit: false, assign: false, changeStatus: true, review: false }, ...overrides };
}

function loginAs(id: string) {
  const user: AuthUser = {
    id,
    email: `${id}@test.uz`,
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    role: { id: 'r', key: 'SALES_MANAGER', name: 'Sotuv' },
    permissions: [],
    mustChangePassword: false,
  };
  useAuthStore.setState({ user });
}

function wrap(children: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Vazifa tekshiruvi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ijrochi: "Boshlash" va "Topshirish" (bergan xodim qabul qiladi), bekor qilish tugmasi yo‘q; kutilgan natija ko‘rinadi', async () => {
    loginAs('me');
    vi.mocked(taskService.list).mockResolvedValue({ items: [task({})], openCount: 1, total: 1, page: 1, limit: 20 });
    const user = userEvent.setup();
    wrap(<TasksPage />);

    const row = (await screen.findByText('Sinov darsiga yozish')).closest('li')!;
    expect(within(row).getByText('Yangi')).toBeInTheDocument();
    expect(within(row).getByText('Kutilgan natija: 5 ta yozuv')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /bekor qilish/ })).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Topshirish' }));
    await waitFor(() => expect(taskService.setStatus).toHaveBeenCalledWith('t1', 'REVIEW'));
    await user.click(within(row).getByRole('button', { name: 'Boshlash' }));
    await waitFor(() => expect(taskService.setStatus).toHaveBeenCalledWith('t1', 'IN_PROGRESS'));
    // Standart filtr — yopilmaganlar
    expect(taskService.list).toHaveBeenCalledWith(expect.objectContaining({ active: true, scope: 'mine' }));
  });

  it('"Qabul qilishim kerak" filtri men bergan vazifalar ichidan qidiradi; tekshiruvdagini qabul qilish', async () => {
    loginAs('boss');
    vi.mocked(taskService.list).mockResolvedValue({ items: [task({ status: 'REVIEW', submittedAt: '2026-11-02T10:00:00.000Z' })], openCount: 1, total: 1, page: 1, limit: 20 });
    const user = userEvent.setup();
    wrap(<TasksPage />);

    await user.selectOptions(await screen.findByLabelText('Holat'), 'review');
    await waitFor(() => expect(taskService.list).toHaveBeenLastCalledWith(expect.objectContaining({ review: true, scope: 'created' })));
    const row = (await screen.findByText('Sinov darsiga yozish')).closest('li')!;
    expect(within(row).getByText('Tekshiruvda')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Qabul qilish' }));
    await waitFor(() => expect(taskService.setStatus).toHaveBeenCalledWith('t1', 'DONE'));
  });

  it('tafsilot: rahbar izoh bilan qaytaradi; izohsiz qaytarib bo‘lmaydi', async () => {
    loginAs('boss');
    vi.mocked(taskService.get).mockResolvedValue(detail({ status: 'REVIEW', can: { edit: true, assign: false, changeStatus: true, review: true } }));
    const user = userEvent.setup();
    wrap(<TaskDetailDrawer taskId="t1" onClose={() => undefined} />);

    await user.click(await screen.findByRole('button', { name: 'Qaytarish' }));
    const submit = screen.getAllByRole('button', { name: 'Qaytarish' }).at(-1)!;
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Qaytarish sababi'), '2 tasi tasdiqlanmagan');
    await user.click(submit);
    await waitFor(() => expect(taskService.setStatus).toHaveBeenCalledWith('t1', 'IN_PROGRESS', '2 tasi tasdiqlanmagan'));
  });

  it('tafsilot: ijrochi tekshiruvdagi vazifani o‘zi qabul qila olmaydi — kutish xabari', async () => {
    loginAs('me');
    vi.mocked(taskService.get).mockResolvedValue(detail({ status: 'REVIEW' }));
    wrap(<TaskDetailDrawer taskId="t1" onClose={() => undefined} />);
    expect(await screen.findByText(/vazifani bergan xodim qabul qiladi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Qabul qilish' })).not.toBeInTheDocument();
  });
});
