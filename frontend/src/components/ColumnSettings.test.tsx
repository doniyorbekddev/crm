import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnCells, ColumnHeaders } from '@/components/ui/ColumnTable';
import { Table, TBody, THead, TR } from '@/components/ui/Table';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';
import { ColumnSettings } from './ColumnSettings';

const saved: Record<string, unknown> = {};
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/services/preferences.service', () => ({
  preferencesService: {
    list: vi.fn(async () => ({ ...saved })),
    save: vi.fn(async (key: string, value: unknown) => {
      saved[key] = value;
      return value;
    }),
  },
}));
const { preferencesService } = await import('@/services/preferences.service');

type Row = { id: string; name: string; phone: string; debt: number };
const columns: Array<ColumnDef<Row>> = [
  { key: 'name', label: 'Ism', required: true, cell: (row) => row.name },
  { key: 'phone', label: 'Telefon', cell: (row) => row.phone },
  { key: 'debt', label: 'Qarz', cell: (row) => row.debt },
  { key: 'actions', label: 'Amallar', header: <span className="sr-only">Amallar</span>, fixed: true, cell: () => '…' },
];
const rows: Row[] = [{ id: '1', name: 'Ali', phone: '+998901234567', debt: 500 }];

function Demo() {
  const control = useTableColumns('students', columns);
  return (
    <>
      <ColumnSettings control={control} />
      <Table>
        <THead>
          <tr>
            <ColumnHeaders columns={control.visibleColumns} />
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <ColumnCells columns={control.visibleColumns} row={row} />
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}

function renderDemo() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Demo />
    </QueryClientProvider>,
  );
}

const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent);

describe('ColumnSettings (GAP-03)', () => {
  beforeEach(() => {
    for (const key of Object.keys(saved)) delete saved[key];
    vi.clearAllMocks();
  });

  it('yashirish, tartib, kenglik va standart holat — profilga saqlanadi', async () => {
    const user = userEvent.setup();
    renderDemo();
    await waitFor(() => expect(headers()).toEqual(['Ism', 'Telefon', 'Qarz', 'Amallar']));

    await user.click(screen.getByRole('button', { name: 'Ustunlar' }));
    const dialog = screen.getByRole('dialog', { name: 'Jadval ustunlari' });
    // Majburiy ustun o'chirilmaydi, amallar ustuni ro'yxatda yo'q
    expect(within(dialog).getByLabelText('Ism')).toBeDisabled();
    expect(within(dialog).queryByLabelText('Amallar')).not.toBeInTheDocument();

    await user.click(within(dialog).getByLabelText('Telefon'));
    await waitFor(() => expect(headers()).toEqual(['Ism', 'Qarz', 'Amallar']));
    expect(screen.queryByText('+998901234567')).not.toBeInTheDocument();

    // Oynada yashirin ustunlar ham bor: birinchi surish yashirin "Telefon" bilan o'rin almashadi
    await user.click(within(dialog).getByRole('button', { name: 'Qarz — yuqoriga' }));
    await user.click(within(dialog).getByRole('button', { name: 'Qarz — yuqoriga' }));
    await waitFor(() => expect(headers()).toEqual(['Qarz', 'Ism', 'Amallar']));
    expect(within(dialog).getByRole('button', { name: 'Qarz — yuqoriga' })).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Qarz kengligi'), '200');
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Qarz' })).toHaveStyle({ width: '200px' }));

    expect(vi.mocked(preferencesService.save).mock.calls.at(-1)).toEqual([
      'table.students.columns',
      { columns: [{ key: 'debt', visible: true, width: 200 }, { key: 'name', visible: true }, { key: 'phone', visible: false }] },
    ]);
    expect(screen.getByRole('button', { name: 'Ustunlar (1 yashirin)' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Standart holat' }));
    await waitFor(() => expect(headers()).toEqual(['Ism', 'Telefon', 'Qarz', 'Amallar']));
    expect(vi.mocked(preferencesService.save).mock.calls.at(-1)).toEqual(['table.students.columns', { columns: [] }]);
  });
});
