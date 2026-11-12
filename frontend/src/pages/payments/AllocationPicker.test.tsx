import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentScheduleService } from '@/services/paymentSchedule.service';
import type { Installment, PaymentSchedule, ScheduleMonth } from '@/types/paymentSchedule';
import { AUTO_ALLOCATION, AllocationPicker, allocationIssue, allocationPayload } from './AllocationPicker';
import type { AllocationValue } from './AllocationPicker';

vi.mock('@/services/paymentSchedule.service', () => ({ paymentScheduleService: { get: vi.fn() } }));

function installment(sequence: number, dueDate: string, status: Installment['status'], overdueDays = 0): Installment {
  return { id: `i${sequence}`, sequence, dueDate, amount: 600_000, paid: 0, remaining: 600_000, status, overdueDays, note: null, cancelledAt: null, cancelReason: null, locked: false };
}

function month(key: string): ScheduleMonth {
  const [year = 0, value = 1] = key.split('-').map(Number);
  return { key, year, month: value, amount: 600_000, paid: 0, remaining: 600_000, cancelledAmount: 0, allocated: 0, status: 'UNPAID' };
}

/** To'lov kuni — har oyning 15-sanasi; oktyabr to'lanmagan; bugun 11-noyabr */
const SCHEDULE: PaymentSchedule = {
  studentId: 's1',
  monthlyFee: 600_000,
  contractTotal: 2_400_000,
  paid: 0,
  scheduledTotal: 2_400_000,
  mismatch: false,
  dueToDate: 600_000,
  overdueAmount: 600_000,
  overdueDays: 27,
  nextDue: { dueDate: '2026-11-15', amount: 600_000 },
  installments: [installment(1, '2026-10-15', 'OVERDUE', 27), installment(2, '2026-11-15', 'UPCOMING'), installment(3, '2026-12-15', 'UPCOMING'), installment(4, '2027-01-15', 'UPCOMING')],
  months: [month('2026-10'), month('2026-11'), month('2026-12'), month('2027-01')],
};

function Harness({ amount, onSuggest, onValue }: { amount: number; onSuggest: (value: number) => void; onValue: (value: AllocationValue) => void }) {
  const [value, setValue] = useState<AllocationValue>(AUTO_ALLOCATION);
  return (
    <AllocationPicker
      studentId="s1"
      amount={amount}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
      onSuggestAmount={onSuggest}
    />
  );
}

function renderPicker(amount = 0) {
  const onSuggest = vi.fn();
  const onValue = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness amount={amount} onSuggest={onSuggest} onValue={onValue} />
    </QueryClientProvider>,
  );
  return { onSuggest, onValue };
}

describe('To‘lov oynasi — qaysi oy uchun', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T10:00:00+05:00'));
    vi.mocked(paymentScheduleService.get).mockResolvedValue(SCHEDULE);
  });
  afterEach(() => vi.useRealTimers());

  it('oktyabr — qarz, noyabr — "4 kun qoldi"; keyingi oylar yashirin; belgilangan oylar summasi taklif qilinadi', async () => {
    const user = userEvent.setup();
    const { onSuggest, onValue } = renderPicker();

    expect(await screen.findByText('qarz · 27 kun kechikdi')).toBeInTheDocument();
    expect(screen.getByText('4 kun qoldi')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Dekabr 2026 uchun to‘lash' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keyingi oylar \(2\)/ })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Oktabr 2026 uchun to‘lash' }));
    expect(onSuggest).toHaveBeenLastCalledWith(600_000);
    await user.click(screen.getByRole('checkbox', { name: 'Noyabr 2026 uchun to‘lash' }));
    expect(onSuggest).toHaveBeenLastCalledWith(1_200_000);

    const value = onValue.mock.lastCall?.[0] as AllocationValue;
    expect(value.mode).toBe('months');
    // Faqat oktyabr uchun bir oylik to'lov — oktyabrga yoziladi, noyabr qarz bo'lib qoladi
    expect(allocationPayload(value, 600_000)).toEqual([{ period: '2026-10', amount: 600_000 }]);
    expect(allocationPayload(value, 1_200_000)).toEqual([
      { period: '2026-10', amount: 600_000 },
      { period: '2026-11', amount: 600_000 },
    ]);
    expect(allocationIssue(value, 1_500_000)).toMatch(/ortiq/);
    expect(allocationIssue(value, 1_200_000)).toBeNull();

    await user.click(screen.getByRole('button', { name: /Keyingi oylar/ }));
    expect(screen.getByRole('checkbox', { name: 'Dekabr 2026 uchun to‘lash' })).toBeInTheDocument();
  });

  it('oy belgilanmasa — avtomatik (eng eski qarzdan), server o‘zi biriktiradi', async () => {
    renderPicker(600_000);
    expect(await screen.findByText('yopiladi')).toBeInTheDocument();
    expect(allocationPayload(AUTO_ALLOCATION, 600_000)).toBeUndefined();
  });
});
