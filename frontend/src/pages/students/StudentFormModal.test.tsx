import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { studentsService } from '@/services/students.service';
import type { StudentItem } from '@/types/student';
import { StudentFormModal } from './StudentFormModal';

const REQUIRED = 'Iltimos, o‘quvchi yoki ota-onaning telefon raqamidan kamida bittasini kiriting.';

vi.mock('@/services/students.service', () => ({
  studentsService: {
    formLookups: vi.fn(async () => ({
      courses: [
        { id: 'c1', name: 'Frontend', finalPrice: 1_000_000 },
        { id: 'c2', name: 'Ingliz tili', finalPrice: 800_000 },
      ],
      groups: [
        { id: 'g1', name: 'FE-01', courseId: 'c1', capacity: 10, studentCount: 3, freeSeats: 7 },
        { id: 'g2', name: 'EN-01', courseId: 'c2', capacity: 10, studentCount: 2, freeSeats: 8 },
        { id: 'g3', name: 'EN-02', courseId: 'c2', capacity: 5, studentCount: 5, freeSeats: 0 },
      ],
    })),
    create: vi.fn(async () => ({ data: {}, message: 'O‘quvchi qo‘shildi' })),
    update: vi.fn(async () => ({ data: {}, message: 'Saqlandi' })),
  },
}));

function renderForm(student?: StudentItem) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <StudentFormModal {...(student ? { student } : {})} onClose={vi.fn()} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onSaved };
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Ism/), 'Ali');
  await user.type(screen.getByLabelText(/^Familiya/), 'Valiyev');
  await screen.findByRole('option', { name: /Frontend/ });
  await user.selectOptions(screen.getByLabelText(/^Kurs/), 'c1');
}

describe('O‘quvchi formasi — telefonlar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ikki alohida, ixtiyoriy maydon ko‘rsatiladi', () => {
    renderForm();
    expect(screen.getByLabelText('O‘quvchining telefon raqami')).toBeInTheDocument();
    expect(screen.getByLabelText('Ota-onasining telefon raqami')).toBeInTheDocument();
    expect(screen.getAllByText('Ixtiyoriy · kamida bitta raqam kerak')).toHaveLength(2);
  });

  it('ikkalasi bo‘sh — xabar chiqadi, so‘rov yuborilmaydi, kiritilganlar saqlanadi', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findAllByText(REQUIRED)).toHaveLength(2);
    expect(studentsService.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Ism/)).toHaveValue('Ali');

    // Bitta raqam kiritilgach xato yo'qoladi va saqlanadi
    await user.type(screen.getByLabelText('Ota-onasining telefon raqami'), '+998901234567');
    expect(screen.queryByText(REQUIRED)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await vi.waitFor(() => expect(studentsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(studentsService.create).mock.calls[0]![0]).toMatchObject({ phone: '', parentPhone: '+998901234567' });
  });

  it('faqat o‘quvchi raqami bilan saqlanadi; noto‘g‘ri format maydon ostida ko‘rsatiladi', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequired(user);
    await user.type(screen.getByLabelText('O‘quvchining telefon raqami'), '123');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText('Telefon raqam noto‘g‘ri (masalan: +998901234567)')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('O‘quvchining telefon raqami'));
    await user.type(screen.getByLabelText('O‘quvchining telefon raqami'), '90 123 45 67');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await vi.waitFor(() => expect(studentsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(studentsService.create).mock.calls[0]![0]).toMatchObject({ phone: '90 123 45 67', parentPhone: '' });
  });

  it('tahrirlash: faqat ota-ona raqami bor eski yozuv ochiladi va ikkalasini o‘chirib bo‘lmaydi', async () => {
    const user = userEvent.setup();
    renderForm({
      id: 's1',
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: null,
      parentPhone: '+998935557788',
      course: { id: 'c1', name: 'Frontend' },
      group: null,
      contractPrice: 1_000_000,
      startDate: '2026-10-01',
    } as unknown as StudentItem);
    expect(screen.getByLabelText('O‘quvchining telefon raqami')).toHaveValue('');
    expect(screen.getByLabelText('Ota-onasining telefon raqami')).toHaveValue('+998935557788');
    await screen.findByRole('option', { name: /Frontend/ });

    await user.clear(screen.getByLabelText('Ota-onasining telefon raqami'));
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findAllByText(REQUIRED)).toHaveLength(2);
    expect(studentsService.update).not.toHaveBeenCalled();
  });

  it('guruh: barcha kurslarning ochiq guruhlari chiqadi, to‘lgani tanlanmaydi; boshqa kurs guruhi tanlansa kurs o‘zgaradi', async () => {
    const user = userEvent.setup();
    renderForm({
      id: 's1',
      firstName: 'Ali',
      lastName: 'Valiyev',
      phone: '+998901112233',
      parentPhone: null,
      course: { id: 'c1', name: 'Frontend' },
      group: { id: 'g1', name: 'FE-01' },
      contractPrice: 1_000_000,
      startDate: '2026-10-01',
    } as unknown as StudentItem);
    await screen.findByRole('option', { name: /EN-01/ });
    expect(screen.getByRole('option', { name: /FE-01/ })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'EN-02 · to‘lgan' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/^Guruh/), 'g2');
    expect(screen.getByLabelText(/^Kurs/)).toHaveValue('c2');
    expect(screen.getByText(/Kurs o‘zgaradi: «Frontend» → «Ingliz tili»/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await vi.waitFor(() => expect(studentsService.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(studentsService.update).mock.calls[0]![1]).toMatchObject({ courseId: 'c2', groupId: 'g2' });
  });
});
