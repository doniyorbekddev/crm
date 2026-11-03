import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types/auth';
import type { ChecklistDetail, ComplaintDetail, KnowledgeDetail } from '@/types/org';

/** ORG · 2-bosqich UI: murojaatlar, chegirma vakolati, bilimlar bazasi, offboarding */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const granted = new Set<string>();
vi.mock('@/hooks/usePermission', () => ({ usePermission: (key: string | readonly string[]) => (typeof key === 'string' ? granted.has(key) : key.some((item) => granted.has(item))) }));
vi.mock('@/services/org.service', () => ({
  orgService: {
    complaints: vi.fn(),
    complaint: vi.fn(),
    complaintAssignees: vi.fn().mockResolvedValue([{ id: 'u2', firstName: 'Umidjon', lastName: 'O', roleName: 'O‘qituvchi' }]),
    complaintStatus: vi.fn().mockResolvedValue({ data: {}, message: 'Holat yangilandi' }),
    assignComplaint: vi.fn().mockResolvedValue({ data: {}, message: 'Yo‘naltirildi' }),
    people: vi.fn().mockResolvedValue([{ id: 'u3', firstName: 'Hamkasb', lastName: 'X', roleName: 'Sotuv' }]),
    knowledge: vi.fn(),
    article: vi.fn(),
    acknowledge: vi.fn().mockResolvedValue({ data: {}, message: 'Tanishganingiz qayd etildi' }),
    checklist: vi.fn(),
    checklists: vi.fn().mockResolvedValue([]),
    checklistAction: vi.fn().mockResolvedValue({ data: {}, message: 'Ishlar topshirildi' }),
    checklistItem: vi.fn().mockResolvedValue({ data: {}, message: 'Saqlandi' }),
    candidates: vi.fn().mockResolvedValue({ items: [], counts: { NEW: 0, INTERVIEW: 0, DEMO: 0, OFFER: 0, HIRED: 0, REJECTED: 0, WITHDRAWN: 0 } }),
  },
}));
vi.mock('@/services/discounts.service', () => ({
  discountsService: {
    requests: vi.fn(),
    decideRequest: vi.fn().mockResolvedValue({ data: {}, message: 'Chegirma tasdiqlandi va berildi' }),
    saveSettings: vi.fn(),
  },
}));
vi.mock('@/services/students.service', () => ({ studentsService: { list: vi.fn().mockResolvedValue({ items: [], meta: {} }) } }));
const { orgService } = await import('@/services/org.service');
const { discountsService } = await import('@/services/discounts.service');
const { default: ComplaintsPage } = await import('./ComplaintsPage');
const { default: KnowledgePage } = await import('./KnowledgePage');
const { default: HrProcessPage } = await import('./HrProcessPage');
const { DiscountAuthority } = await import('../discounts/DiscountAuthority');

function login(id: string) {
  const user: AuthUser = { id, email: `${id}@t.uz`, firstName: 'T', lastName: 'U', phone: null, status: 'ACTIVE', lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z', role: { id: 'r', key: 'ADMIN', name: 'Admin' }, permissions: [], mustChangePassword: false };
  useAuthStore.setState({ user });
}

function wrap(children: ReactNode, path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const person = (id: string, firstName: string) => ({ id, firstName, lastName: 'X' });

const COMPLAINT: ComplaintDetail = {
  id: 'c1',
  number: 7,
  source: 'PARENT',
  category: 'SCHEDULE',
  severity: 'HIGH',
  status: 'UNDER_REVIEW',
  title: 'Dars vaqti noqulay',
  description: 'Kechroqqa surish so‘raldi',
  contactName: 'Dilnoza',
  contactPhone: null,
  confidential: false,
  dueAt: '2026-11-04T10:00:00.000Z',
  overdue: true,
  escalatedAt: null,
  resolution: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: '2026-11-03T10:00:00.000Z',
  student: null,
  subjectUser: null,
  reporter: person('u1', 'Guli'),
  assignee: person('u2', 'Umidjon'),
  events: [{ id: 'e1', type: 'CREATED', fromStatus: null, toStatus: 'NEW', note: null, actor: person('u1', 'Guli'), createdAt: '2026-11-03T10:00:00.000Z' }],
  can: { manage: true, work: true, close: true, escalate: true },
};

describe('ORG · 2-bosqich UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    granted.clear();
    login('me');
  });

  it('murojaatlar: ro‘yxat belgilari; hal etish yechimsiz yuborilmaydi, yechim bilan — RESOLVED', async () => {
    granted.add('complaint.create');
    granted.add('complaint.view');
    vi.mocked(orgService.complaints).mockResolvedValue({ items: [COMPLAINT], total: 1, counts: { NEW: 0, UNDER_REVIEW: 1, RESOLVED: 0, CLOSED: 0, overdue: 1, escalated: 0 } });
    vi.mocked(orgService.complaint).mockResolvedValue(COMPLAINT);
    const user = userEvent.setup();
    wrap(<ComplaintsPage />);

    const row = (await screen.findByText('Dars vaqti noqulay')).closest('li')!;
    expect(within(row).getByText('Muddati o‘tgan')).toBeInTheDocument();
    expect(within(row).getByText('Muhim')).toBeInTheDocument();
    await user.click(within(row).getByRole('button'));
    const drawer = await screen.findByRole('dialog', { name: '#7 · Dars vaqti noqulay' });
    await user.click(within(drawer).getByRole('button', { name: 'Hal etildi' }));
    const save = within(drawer).getByRole('button', { name: 'Saqlash' });
    expect(save).toBeDisabled();
    await user.type(within(drawer).getByLabelText('Qanday hal etildi?'), 'Kechki guruhga o‘tkazildi');
    await user.click(save);
    await waitFor(() => expect(orgService.complaintStatus).toHaveBeenCalledWith('c1', 'RESOLVED', 'Kechki guruhga o‘tkazildi'));
  });

  it('chegirma vakolati: tasdiqlovchi so‘rovni tasdiqlaydi; o‘z so‘rovini tasdiqlay olmaydi — faqat qaytarib oladi', async () => {
    granted.add('discount.approve');
    vi.mocked(discountsService.requests).mockResolvedValue({
      items: [
        { id: 'r1', status: 'PENDING', student: { id: 's1', firstName: 'Aziz', lastName: 'K' }, label: 'Oila 10%', amount: 100_000, percent: 10, reason: 'Ikkinchi farzand', requestedBy: person('sales', 'Shodiya'), decidedBy: null, decidedAt: null, decisionNote: null, createdAt: '2026-11-03T10:00:00.000Z' },
        { id: 'r2', status: 'PENDING', student: { id: 's2', firstName: 'Bek', lastName: 'K' }, label: 'Maxsus', amount: 80_000, percent: 8, reason: 'O‘zim', requestedBy: person('me', 'Men'), decidedBy: null, decidedAt: null, decisionNote: null, createdAt: '2026-11-03T10:00:00.000Z' },
      ],
      pending: 2,
      canApprove: true,
    });
    const user = userEvent.setup();
    wrap(<DiscountAuthority settings={{ maxPercent: 30, allowStacking: true, approvalThresholdPercent: 5, rulesPreapproved: false, updatedAt: null }} />);

    const first = (await screen.findByText('Aziz K')).closest('li')!;
    expect(within(first).getByText(/umumiy 10%/)).toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(discountsService.decideRequest).toHaveBeenCalledWith('r1', 'approve', undefined));
    const own = screen.getByText('Bek K').closest('li')!;
    expect(within(own).queryByRole('button', { name: 'Tasdiqlash' })).not.toBeInTheDocument();
    expect(within(own).getByRole('button', { name: 'Qaytarib olish' })).toBeInTheDocument();
  });

  it('bilimlar bazasi: tanishish kerak bo‘lgan hujjat — ogohlantirish va "Tanishib chiqdim"', async () => {
    const article: KnowledgeDetail = {
      id: 'k1',
      title: 'Dars standarti',
      category: 'LESSON_STANDARD',
      status: 'PUBLISHED',
      position: null,
      version: 2,
      requiresAck: true,
      acknowledged: false,
      audience: [],
      publishedAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      updatedBy: person('a', 'Admin'),
      body: 'Dars 10 daqiqa oldin tayyorlanadi.',
      videoUrl: null,
      versions: [{ version: 2, title: 'Dars standarti', changeNote: 'Vaqt', editor: person('a', 'Admin'), createdAt: '2026-11-02T00:00:00.000Z' }],
      acknowledgements: null,
      can: { manage: false },
    };
    vi.mocked(orgService.knowledge).mockResolvedValue({ items: [article], pendingAck: 1, manage: false });
    vi.mocked(orgService.article).mockResolvedValue(article);
    const user = userEvent.setup();
    wrap(<KnowledgePage />);

    expect(await screen.findByText(/1 ta hujjat bilan tanishib chiqishingiz kerak/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hujjat yozish' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Dars standarti/ }));
    await user.click(await screen.findByRole('button', { name: 'Tanishib chiqdim' }));
    await waitFor(() => expect(orgService.acknowledge).toHaveBeenCalledWith('k1'));
  });

  it('offboarding: tizim bandlari belgilanmaydi; ishlar tanlangan xodimga topshiriladi; bajarilmagan band bor — yakunlash yopiq', async () => {
    granted.add('employee.manage');
    const detail: ChecklistDetail = {
      id: 'h1',
      kind: 'OFFBOARDING',
      status: 'OPEN',
      employeeId: 'e1',
      userId: 'leaver',
      subjectName: 'Ketuvchi X',
      reason: 'O‘z xohishi',
      lastWorkingDay: '2026-11-15',
      dueDate: null,
      completedAt: null,
      createdAt: '2026-11-03T00:00:00.000Z',
      createdBy: null,
      completedBy: null,
      progress: { done: 1, total: 3 },
      items: [
        { id: 'i1', key: 'reason', title: 'Ishdan ketish sababi va sanasi qayd qilindi', responsible: null, done: true, doneAt: null, doneBy: null, note: null, system: false },
        { id: 'i2', key: 'tasks', title: 'Vazifalar topshirildi', responsible: null, done: false, doneAt: null, doneBy: null, note: null, system: true },
        { id: 'i3', key: null, title: 'Hujjatlar qaytarildi', responsible: null, done: false, doneAt: null, doneBy: null, note: null, system: false },
      ],
      facts: { openWork: { tasks: 2, followUps: 0, complaints: 0 }, assets: [], account: { exists: true, active: false }, contractSigned: false },
    };
    vi.mocked(orgService.checklist).mockResolvedValue(detail);
    const user = userEvent.setup();
    wrap(<HrProcessPage />, '/hr-process?tab=offboarding&checklist=h1');

    const drawer = await screen.findByRole('dialog', { name: 'Offboarding · Ketuvchi X' });
    expect(within(drawer).getByText(/Ochiq: 2 vazifa/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('checkbox', { name: 'Vazifalar topshirildi' })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Yakunlash' })).toBeDisabled();
    await user.selectOptions(within(drawer).getByLabelText('Ishlarni kimga topshirish'), 'u3');
    await user.click(within(drawer).getByRole('button', { name: 'Topshirish' }));
    await waitFor(() => expect(orgService.checklistAction).toHaveBeenCalledWith('h1', 'handover', { assigneeId: 'u3' }));
    await user.click(within(drawer).getByRole('checkbox', { name: 'Hujjatlar qaytarildi' }));
    await waitFor(() => expect(orgService.checklistItem).toHaveBeenCalledWith('h1', 'i3', true));
  });
});
