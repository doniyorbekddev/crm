import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { STATUS_REGISTRY, resolveStatus } from '@/utils/statusRegistry';
import { ActionMenu } from './ActionMenu';
import { Breadcrumb } from './Breadcrumb';
import { CurrencyInput } from './CurrencyInput';
import { Drawer } from './Drawer';
import { FileUpload } from './FileUpload';
import { IconButton } from './IconButton';
import { Modal } from './Modal';
import { StatCard } from './StatCard';
import { StatusBadge } from './StatusBadge';
import { Tab, TabList, TabPanel, Tabs } from './Tabs';
import { Timeline } from './Timeline';
import { Tooltip } from './Tooltip';

/** Dizayn tizimi PHASE 1 — yangi primitivlar: nom/rol, klaviatura, holatlar */

describe('IconButton va Tooltip', () => {
  it('nom majburiy (aria-label); fokusda maslahat chiqadi, Esc bilan yopiladi', async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Tahrirlash" onClick={onClick}>
        <Pencil aria-hidden />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Tahrirlash' });
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
    await userEvent.tab();
    expect(button).toHaveFocus();
    // Maslahat nomni takrorlaydi — ekran o'quvchidan yashirin, tugmaga "describedby" qo'shilmaydi
    expect(await screen.findByRole('tooltip', { hidden: true })).toHaveTextContent('Tahrirlash');
    expect(button).not.toHaveAttribute('aria-describedby');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('loading — bosilmaydi va band; tooltip=false — maslahat yo‘q', async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="O‘chirish" loading tooltip={false} onClick={onClick}>
        <Trash2 aria-hidden />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'O‘chirish' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('Tooltip qo‘shimcha ma’lumotni aria-describedby bilan bog‘laydi', async () => {
    render(
      <Tooltip content="Oxirgi 30 kun bo‘yicha" delay={0}>
        <button type="button">Davomat</button>
      </Tooltip>,
    );
    await userEvent.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Oxirgi 30 kun bo‘yicha');
    expect(screen.getByRole('button', { name: 'Davomat' })).toHaveAttribute('aria-describedby', tip.id);
    await userEvent.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Tabs', () => {
  function Example() {
    const [tab, setTab] = useState('overview');
    return (
      <Tabs value={tab} onValueChange={setTab}>
        <TabList label="Bo‘limlar">
          <Tab value="overview">Umumiy</Tab>
          <Tab value="locked" disabled>
            Yopiq
          </Tab>
          <Tab value="payments" count={3}>
            To‘lovlar
          </Tab>
        </TabList>
        <TabPanel value="overview">Umumiy mazmun</TabPanel>
        <TabPanel value="payments">To‘lovlar mazmuni</TabPanel>
      </Tabs>
    );
  }

  it('ARIA rollari, faol tab va panel bog‘lanishi', () => {
    render(<Example />);
    expect(screen.getByRole('tablist', { name: 'Bo‘limlar' })).toBeInTheDocument();
    const overview = screen.getByRole('tab', { name: 'Umumiy' });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(overview).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /To‘lovlar/ })).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel', { name: 'Umumiy' });
    expect(panel).toHaveTextContent('Umumiy mazmun');
    expect(overview).toHaveAttribute('aria-controls', panel.id);
  });

  it('strelkalar: o‘chirilgan tab o‘tkazib yuboriladi, chetda aylanadi; Home/End', async () => {
    render(<Example />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    const payments = screen.getByRole('tab', { name: /To‘lovlar/ });
    expect(payments).toHaveFocus();
    expect(payments).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('To‘lovlar mazmuni');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Umumiy' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(payments).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Umumiy' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Drawer', () => {
  function Example({ closeDisabled = false }: { closeDisabled?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Ochish
        </button>
        <Drawer open={open} title="Lead tafsiloti" description="Qisqa ma’lumot" onClose={() => setOpen(false)} closeDisabled={closeDisabled}>
          <input aria-label="Izoh" />
        </Drawer>
      </>
    );
  }

  it('dialog nomi va tavsifi; Esc yopadi; fokus ochgan tugmaga qaytadi', async () => {
    render(<Example />);
    const opener = screen.getByRole('button', { name: 'Ochish' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Lead tafsiloti' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Qisqa ma’lumot');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('yopish tugmasi ishlaydi; closeDisabled — Esc ham, tugma ham yopmaydi', async () => {
    const { unmount } = render(<Example />);
    await userEvent.click(screen.getByRole('button', { name: 'Ochish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yopish' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    render(<Example closeDisabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Ochish' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yopish' })).toBeDisabled();
  });
});

describe('StatusBadge va holatlar registri', () => {
  it('yorliq va ohang registrdan; API qiymati o‘zgarmaydi', () => {
    render(<StatusBadge kind="lead" status="WON" icon />);
    const badge = screen.getByText('Sotildi');
    expect(badge).toHaveClass('bg-success-subtle', 'text-success');
    expect(resolveStatus('lead', 'LOST')).toEqual({ label: 'Yo‘qotildi', tone: 'red' });
  });

  it('noma’lum holat — xom qiymat neytral ohangda (sahifa yiqilmaydi)', () => {
    render(<StatusBadge kind="student" status="KELAJAKDAGI_HOLAT" />);
    expect(screen.getByText('KELAJAKDAGI_HOLAT')).toHaveClass('bg-surface-muted');
  });

  it('har turdagi har holat uchun yorliq ham, ohang ham bor', () => {
    for (const [kind, entry] of Object.entries(STATUS_REGISTRY)) {
      const labels = Object.keys(entry.labels).sort();
      expect(Object.keys(entry.tones).sort(), kind).toEqual(labels);
      expect(labels.length, kind).toBeGreaterThan(0);
      for (const label of Object.values(entry.labels)) expect(label, kind).not.toBe('');
    }
  });
});

describe('StatCard', () => {
  it('qiymat, izoh va o‘zgarish; rang yo‘nalishdan emas, ma’nodan', () => {
    const { rerender } = render(<StatCard title="O‘quvchilar" value="1 248" trend="+12,5%" description="o‘tgan oyga nisbatan" icon={Users} />);
    expect(screen.getByText('1 248')).toBeInTheDocument();
    expect(screen.getByText('+12,5%')).toHaveClass('text-success');
    // Qarz o'sishi — salbiy
    rerender(<StatCard title="Qarz" value="4 mln" trend={{ label: '+8%', direction: 'up', positive: false }} />);
    expect(screen.getByText('+8%')).toHaveClass('text-danger');
    rerender(<StatCard title="Qarz" value="4 mln" trend="−3%" />);
    expect(screen.getByText('−3%')).toHaveClass('text-danger');
    rerender(<StatCard title="Qarz" value="4 mln" trend="0%" />);
    expect(screen.getByText('0%')).toHaveClass('text-fg-muted');
  });

  it('loading — qiymat o‘rnida skeleton', () => {
    const { container } = render(<StatCard title="Tushum" value="12 mln" loading />);
    expect(screen.queryByText('12 mln')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Breadcrumb va Timeline', () => {
  it('oxirgi band — joriy sahifa, oldingilari havola', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: 'O‘quvchilar', to: '/students' }, { label: 'Ali Valiyev' }]} />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Sahifa yo‘li' });
    expect(within(nav).getByRole('link', { name: 'O‘quvchilar' })).toHaveAttribute('href', '/students');
    expect(within(nav).getByText('Ali Valiyev')).toHaveAttribute('aria-current', 'page');
  });

  it('voqealar tartib bilan ro‘yxatda', () => {
    render(
      <Timeline
        label="Lead tarixi"
        items={[
          { id: '1', title: 'Qo‘ng‘iroq qilindi', time: '12.09.2026 14:30', meta: 'Sardor' },
          { id: '2', title: 'Sinov darsiga yozildi', tone: 'success' },
        ]}
      />,
    );
    const items = within(screen.getByRole('list', { name: 'Lead tarixi' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Qo‘ng‘iroq qilindi');
    expect(items[0]).toHaveTextContent('12.09.2026 14:30');
  });
});

describe('CurrencyInput va FileUpload', () => {
  it('yozishda xonalarga ajratadi, qiymat — son; bo‘sh — null; harflar tashlanadi', async () => {
    const seen: Array<number | null> = [];
    function Example() {
      const [value, setValue] = useState<number | null>(null);
      return (
        <CurrencyInput
          aria-label="Summa"
          value={value}
          onValueChange={(next) => {
            seen.push(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Example />);
    const input = screen.getByRole('textbox', { name: 'Summa' });
    await userEvent.type(input, '1500abc000');
    expect(input).toHaveValue('1 500 000');
    expect(seen.at(-1)).toBe(1_500_000);
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await userEvent.clear(input);
    expect(seen.at(-1)).toBeNull();
  });

  it('hajm va tur tekshiruvi: mos fayl qabul qilinadi, qolgani sabab bilan rad etiladi', () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    const { container } = render(<FileUpload onFiles={onFiles} onReject={onReject} accept=".pdf,image/*" maxSizeBytes={1024} multiple hint="PDF yoki rasm, 1 KB gacha" />);
    const input = container.querySelector('input[type="file"]')!;
    expect(input).toHaveAccessibleDescription('PDF yoki rasm, 1 KB gacha');
    const ok = new File(['abc'], 'chek.pdf', { type: 'application/pdf' });
    const big = new File([new Uint8Array(2048)], 'katta.png', { type: 'image/png' });
    const wrong = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' });
    fireEvent.change(input, { target: { files: [ok, big, wrong] } });
    expect(onFiles).toHaveBeenCalledWith([ok]);
    expect(onReject).toHaveBeenCalledTimes(2);
    expect(onReject.mock.calls[0]![0]).toContain('katta.png');
    expect(onReject.mock.calls[1]![0]).toContain('virus.exe');
  });
});

describe('ActionMenu — klaviatura', () => {
  it('ochilganda fokus birinchi bandda; ↓ keyingisi; Esc faqat menyuni yopadi (Modal ochiq qoladi)', async () => {
    const onEdit = vi.fn();
    const onClose = vi.fn();
    render(
      <Modal open title="Guruh" onClose={onClose}>
        <ActionMenu
          items={[
            { label: 'Tahrirlash', icon: Pencil, onSelect: onEdit },
            { label: 'O‘chirish', icon: Trash2, onSelect: vi.fn(), tone: 'danger' },
          ]}
        />
      </Modal>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Amallar' }));
    expect(screen.getByRole('menuitem', { name: 'Tahrirlash' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'O‘chirish' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Guruh' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Amallar' }));
    await act(async () => {
      await userEvent.keyboard('{Enter}');
    });
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
