import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parentsService } from '@/services/parents.service';
import { ImportParentsModal } from './ImportParentsModal';

const PLAN = {
  dryRun: true,
  created: 1,
  linkedToExisting: 1,
  skippedAlreadyLinked: 2,
  items: [
    { phone: '+998935550001', parentName: 'Ali Valiyevning ota-onasi', action: 'CREATE', students: [{ id: 's1', name: 'Ali Valiyev', code: 'ST-000001' }, { id: 's2', name: 'Vali Valiyev', code: 'ST-000002' }] },
    { phone: '+998935550002', parentName: 'Zarina Karimova', action: 'LINK', students: [{ id: 's3', name: 'Sami Karimov', code: 'ST-000003' }] },
  ],
};

vi.mock('@/services/parents.service', () => ({
  parentsService: {
    importFromStudents: vi.fn(async (dryRun: boolean) => ({ data: { ...PLAN, dryRun }, message: dryRun ? 'Reja' : '1 ta ota-ona yaratildi' })),
  },
}));

describe('Ota-onalarni import qilish oynasi', () => {
  it('avval reja (yozmasdan), tasdiqlangandan keyin bajaradi', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportParentsModal onClose={vi.fn()} onDone={onDone} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Ali Valiyevning ota-onasi')).toBeInTheDocument();
    expect(screen.getByText('Ali Valiyev, Vali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('Mavjudga bog‘lanadi')).toBeInTheDocument();
    expect(parentsService.importFromStudents).toHaveBeenCalledWith(true);
    expect(parentsService.importFromStudents).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(parentsService.importFromStudents).toHaveBeenCalledWith(false);
  });
});
