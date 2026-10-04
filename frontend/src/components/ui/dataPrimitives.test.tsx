import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Users } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from './Combobox';
import { DataTable } from './DataTable';
import type { DataTableColumn, SortState } from './DataTable';
import { FilterBar, FilterField } from './FilterBar';
import { Modal } from './Modal';
import { MultiSelect } from './MultiSelect';
import { Select } from './Select';
import { Tab, TabList, Tabs } from './Tabs';

/** Dizayn tizimi PHASE 1 — Combobox, MultiSelect, FilterBar, DataTable poydevori */

const GROUPS = [
  { value: 'fe1', label: 'Frontend-01', description: 'Dush/Chor/Juma' },
  { value: 'be1', label: 'Backend-01' },
  { value: 'old', label: 'Arxiv guruh', disabled: true },
  { value: 'py1', label: 'Python-01' },
];

describe('Combobox', () => {
  function Example({ onClose = vi.fn() }: { onClose?: () => void }) {
    const [value, setValue] = useState<string | null>(null);
    return (
      <Modal open title="Guruhga qo‘shish" onClose={onClose}>
        <Combobox aria-label="Guruh" options={GROUPS} value={value} onChange={setValue} />
        <p data-testid="value">{value ?? 'yo‘q'}</p>
      </Modal>
    );
  }

  it('yozib filtrlash, ↓ + Enter bilan tanlash; o‘chirilgan band o‘tkazib yuboriladi', async () => {
    render(<Example />);
    const input = screen.getByRole('combobox', { name: 'Guruh' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(4);

    await userEvent.type(input, '01');
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Frontend-01Dush/Chor/Juma',
      'Backend-01',
      'Python-01',
    ]);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('be1');
    expect(input).toHaveValue('Backend-01');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // O'chirilgan band klaviaturada tanlanmaydi
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringMatching(/-3$/));
  });

  it('Esc faqat ro‘yxatni yopadi (Modal ochiq qoladi); tozalash tugmasi; topilmasa — xabar', async () => {
    const onClose = vi.fn();
    render(<Example onClose={onClose} />);
    const input = screen.getByRole('combobox', { name: 'Guruh' });
    await userEvent.click(input);
    await userEvent.type(input, 'zzz');
    expect(screen.getByRole('listbox')).toHaveTextContent('Hech narsa topilmadi');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(input);
    await userEvent.click(screen.getByRole('option', { name: /Python-01/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('py1');
    await userEvent.click(screen.getByRole('button', { name: 'Tanlovni tozalash' }));
    expect(screen.getByTestId('value')).toHaveTextContent('yo‘q');
  });
});

describe('MultiSelect', () => {
  it('bir nechta tanlash, qisqa xulosa, klaviatura va tozalash', async () => {
    function Example() {
      const [value, setValue] = useState<string[]>([]);
      return <MultiSelect label="Guruhlar" options={GROUPS} value={value} onChange={setValue} />;
    }
    render(<Example />);
    const trigger = screen.getByRole('combobox', { name: 'Guruhlar' });
    expect(trigger).toHaveTextContent('Tanlang');
    await userEvent.click(trigger);
    const list = screen.getByRole('listbox', { name: 'Guruhlar' });
    expect(list).toHaveAttribute('aria-multiselectable', 'true');

    await userEvent.click(within(list).getByRole('option', { name: /Frontend-01/ }));
    await userEvent.click(within(list).getByRole('option', { name: /Arxiv guruh/ })); // o'chirilgan
    expect(trigger).toHaveTextContent('Frontend-01');
    expect(within(list).getByRole('option', { name: /Frontend-01/ })).toHaveAttribute('aria-selected', 'true');

    // Klaviatura: faol band Frontend-01 da — ↓ Backend-01 ga o'tadi, Enter belgilaydi
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(within(list).getByRole('option', { name: /Backend-01/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(list).getByRole('option', { name: /Python-01/ }));
    expect(trigger).toHaveTextContent('3 ta tanlangan');

    await userEvent.click(screen.getByRole('button', { name: 'Tozalash' }));
    expect(trigger).toHaveTextContent('Tanlang');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function Example({ onClear }: { onClear: () => void }) {
    const [search, setSearch] = useState('');
    return (
      <FilterBar search={{ value: search, onChange: setSearch, label: 'O‘quvchi qidirish' }} activeCount={2} onClear={onClear}>
        <FilterField>
          <Select aria-label="Holat">
            <option>Faol</option>
          </Select>
        </FilterField>
      </FilterBar>
    );
  }

  it('kompyuter: filtrlar bir qatorda, "Tozalash" faol filtr bo‘lsa ko‘rinadi', async () => {
    const onClear = vi.fn();
    render(<Example onClear={onClear} />);
    expect(screen.getByRole('searchbox', { name: 'O‘quvchi qidirish' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Holat' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Tozalash' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('telefon: filtrlar "Filtrlar" tugmasi ortida (soni bilan), panelda ochiladi', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<Example onClear={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: 'O‘quvchi qidirish' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Holat' })).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Filtrlar/ });
    expect(button).toHaveTextContent('2');
    await userEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Filtrlar' });
    expect(within(dialog).getByRole('combobox', { name: 'Holat' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Natijani ko‘rsatish' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

interface Student {
  id: string;
  name: string;
  debt: number;
}
const STUDENTS: Student[] = [
  { id: 's1', name: 'Ali Valiyev', debt: 0 },
  { id: 's2', name: 'Vali Aliyev', debt: 500_000 },
  { id: 's3', name: 'Sardor Karimov', debt: 120_000 },
];
const COLUMNS: DataTableColumn<Student>[] = [
  { key: 'name', label: 'O‘quvchi', cell: (row) => row.name, sortable: true, required: true },
  { key: 'debt', label: 'Qarz', cell: (row) => String(row.debt), sortable: true, align: 'right' },
  { key: 'phone', label: 'Telefon', cell: () => '+998', visible: false },
];
const EMPTY = { icon: Users, title: 'O‘quvchilar yo‘q', description: 'Birinchi o‘quvchini qo‘shing' };

describe('DataTable', () => {
  it('holatlar: yuklanish → xato (qayta urinish) → bo‘sh', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<DataTable label="O‘quvchilar" columns={COLUMNS} rows={undefined} rowKey={(row) => row.id} loading empty={EMPTY} />);
    expect(screen.getByLabelText('Yuklanmoqda')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    rerender(<DataTable label="O‘quvchilar" columns={COLUMNS} rows={undefined} rowKey={(row) => row.id} error={new Error('Tarmoq xatosi')} onRetry={onRetry} empty={EMPTY} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<DataTable label="O‘quvchilar" columns={COLUMNS} rows={[]} rowKey={(row) => row.id} empty={EMPTY} />);
    expect(screen.getByText('O‘quvchilar yo‘q')).toBeInTheDocument();
    expect(screen.getByText('Birinchi o‘quvchini qo‘shing')).toBeInTheDocument();
  });

  it('yashirin ustun chizilmaydi; saralash: o‘sish → kamayish → yo‘q, aria-sort bilan', async () => {
    function Example() {
      const [sort, setSort] = useState<SortState | null>(null);
      return (
        <>
          <DataTable label="O‘quvchilar" columns={COLUMNS} rows={STUDENTS} rowKey={(row) => row.id} empty={EMPTY} sort={sort} onSortChange={setSort} />
          <p data-testid="sort">{sort ? `${sort.key}:${sort.direction}` : 'yo‘q'}</p>
        </>
      );
    }
    render(<Example />);
    const table = screen.getByRole('table', { name: 'O‘quvchilar' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['O‘quvchi', 'Qarz']);
    expect(within(table).getAllByRole('row')).toHaveLength(4);

    const header = within(table).getByRole('columnheader', { name: 'Qarz' });
    expect(header).toHaveAttribute('aria-sort', 'none');
    const button = within(header).getByRole('button', { name: 'Qarz' });
    await userEvent.click(button);
    expect(screen.getByTestId('sort')).toHaveTextContent('debt:asc');
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(button);
    expect(screen.getByTestId('sort')).toHaveTextContent('debt:desc');
    expect(header).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(button);
    expect(screen.getByTestId('sort')).toHaveTextContent('yo‘q');
  });

  it('tanlash va ommaviy amallar; qator amallari bitta menyuda; qator bosilishi', async () => {
    const onBulk = vi.fn();
    const onEdit = vi.fn();
    const onRowClick = vi.fn();
    function Example() {
      const [selected, setSelected] = useState<Set<string>>(new Set());
      return (
        <DataTable
          label="O‘quvchilar"
          columns={COLUMNS}
          rows={STUDENTS}
          rowKey={(row) => row.id}
          empty={EMPTY}
          selection={{ selected, onChange: setSelected, rowLabel: (row) => row.name, isSelectable: (row) => row.id !== 's3' }}
          bulkActions={(keys) => (
            <button type="button" onClick={() => onBulk(keys)}>
              Xabar yuborish
            </button>
          )}
          rowActions={(row) => [{ label: 'Tahrirlash', icon: Pencil, onSelect: () => onEdit(row.id) }]}
          onRowClick={onRowClick}
        />
      );
    }
    render(<Example />);
    expect(screen.queryByRole('region', { name: 'Ommaviy amallar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Tanlash: Sardor Karimov' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Tanlash: Ali Valiyev' }));
    expect(onRowClick).not.toHaveBeenCalled();
    const bulk = screen.getByRole('region', { name: 'Ommaviy amallar' });
    expect(bulk).toHaveTextContent('1 ta tanlandi');
    expect(screen.getByRole('checkbox', { name: 'Hammasini tanlash' })).toBePartiallyChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Hammasini tanlash' }));
    expect(bulk).toHaveTextContent('2 ta tanlandi');
    await userEvent.click(within(bulk).getByRole('button', { name: 'Xabar yuborish' }));
    expect(onBulk).toHaveBeenCalledWith(['s1', 's2']);
    await userEvent.click(within(bulk).getByRole('button', { name: 'Bekor qilish' }));
    expect(screen.queryByRole('region', { name: 'Ommaviy amallar' })).not.toBeInTheDocument();

    const row = screen.getByRole('row', { name: /Vali Aliyev/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Amallar' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tahrirlash' }));
    expect(onEdit).toHaveBeenCalledWith('s2');
    expect(onRowClick).not.toHaveBeenCalled();
    await userEvent.click(within(row).getByText('Vali Aliyev'));
    expect(onRowClick).toHaveBeenCalledWith(STUDENTS[1]);
  });

  it('zichlik almashtirgichi va sahifalash', async () => {
    const onPageChange = vi.fn();
    function Example() {
      const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
      return (
        <DataTable
          label="O‘quvchilar"
          columns={COLUMNS}
          rows={STUDENTS}
          rowKey={(row) => row.id}
          empty={EMPTY}
          density={density}
          onDensityChange={setDensity}
          pagination={{ page: 1, totalPages: 3, total: 9, limit: 3, onPageChange }}
        />
      );
    }
    render(<Example />);
    const toggle = screen.getByRole('button', { name: 'Zich qatorlar' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Keng qatorlar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('cell', { name: 'Ali Valiyev' })).toHaveClass('py-1.5');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Sahifalar' })).getByRole('button', { name: 'Keyingi sahifa' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('telefon: mobileCard berilsa jadval o‘rniga kartalar', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<DataTable label="O‘quvchilar" columns={COLUMNS} rows={STUDENTS} rowKey={(row) => row.id} empty={EMPTY} mobileCard={(row) => <p>{row.name} — karta</p>} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'O‘quvchilar' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Ali Valiyev — karta')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('sarlavha uyasi (filtr tablari), qator klassi, eskirgan ma’lumot va sahifalashni bloklash', async () => {
    const onTab = vi.fn();
    render(
      <DataTable
        label="O‘quvchilar"
        columns={COLUMNS}
        rows={STUDENTS}
        rowKey={(row) => row.id}
        empty={EMPTY}
        stale
        rowClassName={(row) => row.debt > 0 && 'opacity-60'}
        header={
          <Tabs value="all" onValueChange={onTab} panels={false}>
            <TabList label="Holat bo‘yicha filtr">
              <Tab value="all" count={3}>
                Barchasi
              </Tab>
              <Tab value="overdue" count={2} countTone="danger">
                Muddati o‘tgan
              </Tab>
            </TabList>
          </Tabs>
        }
        pagination={{ page: 1, totalPages: 2, total: 6, limit: 3, onPageChange: vi.fn(), disabled: true }}
      />,
    );
    // Filtr tablari panelsiz: mavjud bo'lmagan elementga aria-controls qo'yilmaydi
    const overdue = screen.getByRole('tab', { name: /^Muddati o‘tgan/ });
    expect(overdue).not.toHaveAttribute('aria-controls');
    expect(within(overdue).getByText('2')).toHaveClass('text-danger');
    await userEvent.click(overdue);
    expect(onTab).toHaveBeenCalledWith('overdue');

    expect(screen.getByRole('row', { name: /Vali Aliyev/ })).toHaveClass('opacity-60');
    expect(screen.getByRole('row', { name: /Ali Valiyev/ })).not.toHaveClass('opacity-60');
    expect(screen.getByRole('table').parentElement).toHaveClass('opacity-60');
    expect(screen.getByRole('button', { name: 'Keyingi sahifa' })).toBeDisabled();
  });
});
