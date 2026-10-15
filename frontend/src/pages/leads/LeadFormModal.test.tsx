import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leadsService } from '@/services/leads.service';
import type { LeadFormLookups } from '@/types/lead';
import { LeadFormModal } from './LeadFormModal';

const REQUIRED = 'Iltimos, lid yoki ota-onaning telefon raqamidan kamida bittasini kiriting.';

vi.mock('@/services/leads.service', () => ({
  leadsService: {
    create: vi.fn(async () => ({ data: { id: 'l1' }, message: 'Lead qo‘shildi' })),
    update: vi.fn(async () => ({ data: { id: 'l1' }, message: 'Saqlandi' })),
  },
}));

const LOOKUPS: LeadFormLookups = {
  sources: [{ id: 's1', key: 'INSTAGRAM', name: 'Instagram' }],
  courses: [],
  managers: [],
};

function renderForm() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <LeadFormModal mode="create" lookups={LOOKUPS} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('Lead formasi — telefonlar va manba', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ikkala telefon bo‘sh bo‘lsa yuborilmaydi; ota-ona raqami bilan ro‘yxatdagi manba yuboriladi', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/^Ism/), 'Ali');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Manba/ }), 's1');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findAllByText(REQUIRED)).toHaveLength(2);
    expect(leadsService.create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Ota-onasining telefon raqami'), '+998 90 123 45 67');
    expect(screen.queryByText(REQUIRED)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await vi.waitFor(() => expect(leadsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(leadsService.create).mock.calls[0]![0]).toMatchObject({ phone: '', parentPhone: '+998 90 123 45 67', sourceId: 's1' });
  });

  it('"Boshqa — o‘zim yozaman" tanlansa manba nomi so‘raladi va sourceName yuboriladi', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/^Ism/), 'Ali');
    await user.type(screen.getByLabelText('Lidning telefon raqami'), '+998901234567');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Manba/ }), '__custom__');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText('Manba nomini yozing (kamida 2 belgi)')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Manba nomi/), 'Ko‘rgazma');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await vi.waitFor(() => expect(leadsService.create).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(leadsService.create).mock.calls[0]![0];
    expect(payload).toMatchObject({ sourceName: 'Ko‘rgazma', phone: '+998901234567' });
    expect(payload).not.toHaveProperty('sourceId');
  });
});
