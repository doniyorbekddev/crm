import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskFormModal, toLocalInput } from './TaskFormModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/task.service', () => ({
  taskService: {
    create: vi.fn().mockResolvedValue({ data: {}, message: 'Vazifa yaratildi' }),
    update: vi.fn().mockResolvedValue({ data: {}, message: 'Saqlandi' }),
    assignees: vi.fn().mockResolvedValue([{ id: 'u2', firstName: 'Bobur', lastName: 'Ustoz', role: 'O‘qituvchi' }]),
  },
}));
const { taskService } = await import('@/services/task.service');

function wrap(children: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>);
}

describe('TaskFormModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('yangi vazifa: bo‘sh sarlavha yuborilmaydi; ijrochi tanlansa so‘rovga kiradi', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<TaskFormModal open canAssign onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Yaratish' }));
    expect(await screen.findByText('Sarlavha kamida 2 belgi')).toBeInTheDocument();
    expect(taskService.create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Sarlavha/), 'Hisobot tayyorlash');
    await user.selectOptions(screen.getByLabelText('Ustuvorlik'), 'HIGH');
    await user.selectOptions(await screen.findByLabelText('Ijrochi'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Yaratish' }));

    await waitFor(() => expect(taskService.create).toHaveBeenCalledWith({ title: 'Hisobot tayyorlash', priority: 'HIGH', assigneeId: 'u2' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('ruxsatsiz xodimda ijrochi tanlovi yo‘q — vazifa o‘ziga', async () => {
    wrap(<TaskFormModal open canAssign={false} onClose={() => undefined} />);
    expect(screen.queryByLabelText('Ijrochi')).not.toBeInTheDocument();
    expect(taskService.assignees).not.toHaveBeenCalled();
  });

  it('tahrirlash: maydonlar to‘ldirilgan; bo‘shatilgan tavsif va muddat `null` bo‘lib ketadi; ijrochi bu yerda o‘zgartirilmaydi', async () => {
    const user = userEvent.setup();
    const task = { id: 't1', title: 'Eski nom', description: 'Eski tavsif', dueAt: '2026-10-09T05:00:00.000Z', priority: 'URGENT' as const };
    wrap(<TaskFormModal open canAssign task={task} onClose={() => undefined} />);

    expect(screen.getByRole('dialog', { name: 'Vazifani tahrirlash' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Sarlavha/)).toHaveValue('Eski nom');
    expect(screen.getByLabelText('Muddat')).toHaveValue(toLocalInput(task.dueAt));
    expect(screen.getByLabelText('Ustuvorlik')).toHaveValue('URGENT');
    expect(screen.queryByLabelText('Ijrochi')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Sarlavha/));
    await user.type(screen.getByLabelText(/Sarlavha/), 'Yangi nom');
    await user.clear(screen.getByLabelText('Tavsif'));
    await user.clear(screen.getByLabelText('Muddat'));
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(taskService.update).toHaveBeenCalledWith('t1', { title: 'Yangi nom', description: null, dueAt: null, priority: 'URGENT' }));
    expect(taskService.create).not.toHaveBeenCalled();
  });

  it('`toLocalInput`: ISO vaqt qurilma vaqtida, noto‘g‘ri qiymat — bo‘sh', () => {
    const local = new Date(2026, 9, 9, 14, 5);
    expect(toLocalInput(local.toISOString())).toBe('2026-10-09T14:05');
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('yaroqsiz')).toBe('');
  });
});
