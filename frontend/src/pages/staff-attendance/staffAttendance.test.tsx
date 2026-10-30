import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { ScanResult, StaffDay } from '@/types/staffAttendance';
import { qrLink, shortDuration } from '@/utils/staffAttendanceLabels';
import { tokenFromQr } from './QrScanner';
import { ScanSheet } from './ScanSheet';
import { planText, StaffStatusBadge } from './StaffStatus';

vi.mock('@/services/staffAttendance.service', () => ({
  staffAttendanceService: {
    preview: vi.fn(),
    scan: vi.fn(),
  },
}));

const TOKEN = 'a'.repeat(43);

const DAY: StaffDay = {
  userId: 'u1',
  date: '2026-10-30',
  dayId: 'd1',
  status: 'WORKING',
  arrival: 'LATE',
  expected: true,
  phase: 'WORKING',
  planKind: 'WORK',
  planSource: 'FIXED',
  planNote: null,
  scheduledStart: '09:00',
  scheduledEnd: '18:00',
  lessons: [],
  checkInAt: '2026-10-30T04:20:00.000Z',
  checkOutAt: null,
  breakStartedAt: null,
  breakSeconds: 0,
  workedSeconds: 0,
  scheduledSeconds: 28_800,
  lateMinutes: 20,
  earlyMinutes: 0,
  excused: false,
  excuseLabel: null,
  reviewReason: null,
  corrected: false,
};

function apiError(status: number, message: string, code: string) {
  const headers = new AxiosHeaders();
  return new AxiosError(message, String(status), undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: { success: false, message, errors: [{ field: 'qr', message: code }] },
  });
}

function renderSheet(onRescan = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ScanSheet token={TOKEN} onClose={vi.fn()} onRescan={onRescan} />
    </QueryClientProvider>,
  );
  return { onRescan };
}

describe('QR qiymati', () => {
  it('davomat havolasidan tokenni oladi, begona QR rad etiladi', () => {
    expect(tokenFromQr(qrLink('https://it-academycrm.uz', TOKEN))).toBe(TOKEN);
    expect(tokenFromQr(TOKEN)).toBe(TOKEN);
    expect(tokenFromQr('https://example.com/?q=1')).toBeNull();
    expect(tokenFromQr('salom dunyo')).toBeNull();
  });
});

describe('Davomatni belgilash oynasi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mumkin bo‘lgan amallarni ko‘rsatadi va tanlangan amalni yuboradi', async () => {
    vi.mocked(staffAttendanceService.preview).mockResolvedValue({ expiresAt: new Date(Date.now() + 50_000).toISOString(), actions: ['BREAK_START', 'CHECK_OUT'], phase: 'WORKING' });
    vi.mocked(staffAttendanceService.scan).mockResolvedValue({
      action: 'CHECK_OUT',
      occurredAt: '2026-10-30T13:00:00.000Z',
      message: 'Ishdan ketganingiz qayd etildi — 18:00',
      replayed: false,
      today: { subject: { id: 'u1', name: 'Ali Valiyev', position: 'Operator' }, serverTime: '', day: DAY, actions: [], events: [], openPreviousDay: null },
    } satisfies ScanResult);
    const user = userEvent.setup();
    renderSheet();

    expect(await screen.findByRole('button', { name: 'Tanaffusga chiqdim' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ishga keldim' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ishdan ketdim' }));
    expect(staffAttendanceService.scan).toHaveBeenCalledWith(TOKEN, 'CHECK_OUT');
    expect(await screen.findByText('Ishdan ketganingiz qayd etildi — 18:00')).toBeInTheDocument();
  });

  it('muddati o‘tgan QR — tushunarli xabar va qayta skanerlash', async () => {
    vi.mocked(staffAttendanceService.preview).mockRejectedValue(apiError(422, 'QR kod muddati tugagan', 'EXPIRED'));
    const user = userEvent.setup();
    const { onRescan } = renderSheet();
    expect(await screen.findByText('QR kod muddati tugagan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Qayta skanerlash' }));
    expect(onRescan).toHaveBeenCalled();
  });

  it('ishlatilgan QR — skanerlashda xabar beriladi', async () => {
    vi.mocked(staffAttendanceService.preview).mockResolvedValue({ expiresAt: new Date(Date.now() + 50_000).toISOString(), actions: ['CHECK_IN'], phase: null });
    vi.mocked(staffAttendanceService.scan).mockRejectedValue(apiError(409, 'Bu QR kod allaqachon ishlatilgan', 'USED'));
    const user = userEvent.setup();
    renderSheet();
    await user.click(await screen.findByRole('button', { name: 'Ishga keldim' }));
    expect(await screen.findByText('QR kod allaqachon ishlatilgan')).toBeInTheDocument();
  });
});

describe('Kun holati', () => {
  it('kechikish daqiqalari, reja matni va davomiylik', () => {
    render(<StaffStatusBadge day={DAY} />);
    expect(screen.getByText('Ishda')).toBeInTheDocument();
    expect(screen.getByText('20 daq kechikdi')).toBeInTheDocument();
    expect(planText(DAY)).toBe('09:00 – 18:00');
    expect(planText({ ...DAY, planKind: 'OFF', planSource: 'LESSONS' })).toBe('Dars yo‘q');
    expect(planText({ ...DAY, planKind: 'HOLIDAY', planNote: 'Bayram' })).toBe('Bayram: Bayram');
    expect(shortDuration(29_520)).toBe('8 s 12 daq');
    expect(shortDuration(null)).toBe('—');
  });
});
