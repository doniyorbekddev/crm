import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SnoozeModal, snoozePresets, validateSnooze } from './SnoozeModal';

describe('kechiktirish vaqti', () => {
  // 2026-10-07 — chorshanba
  const now = new Date(2026, 9, 7, 15, 30);

  it('tayyor variantlar: ertaga va dushanba — ertalab 09:00; hammasi kelajakda va 30 kundan oshmaydi', () => {
    const presets = new Map(snoozePresets(now).map((preset) => [preset.key, preset.until]));
    expect(presets.get('tomorrow')).toEqual(new Date(2026, 9, 8, 9, 0));
    expect(presets.get('monday')).toEqual(new Date(2026, 9, 12, 9, 0));
    // Dushanba kuni "dushanba" — keyingi hafta, bugun emas
    expect(new Map(snoozePresets(new Date(2026, 9, 12, 8, 0)).map((preset) => [preset.key, preset.until])).get('monday')).toEqual(new Date(2026, 9, 19, 9, 0));
    for (const until of presets.values()) {
      expect(until.getTime()).toBeGreaterThan(now.getTime());
      expect(until.getTime()).toBeLessThanOrEqual(now.getTime() + 30 * 86_400_000);
    }
  });

  it('aniq vaqt tekshiriladi: bo‘sh, o‘tmish va 30 kundan uzoq rad etiladi', () => {
    expect(validateSnooze('', now)).toEqual({ error: 'Vaqtni tanlang' });
    expect(validateSnooze('2026-10-07T15:00', now)).toEqual({ error: 'Vaqt kelajakda bo‘lishi kerak' });
    expect(validateSnooze('2026-12-01T10:00', now)).toEqual({ error: 'Ko‘pi bilan 30 kunga kechiktiriladi' });
    expect(validateSnooze('2026-10-09T10:00', now)).toEqual({ until: new Date(2026, 9, 9, 10, 0) });
  });

  it('variant bosilsa shu vaqt bilan tasdiqlanadi; noto‘g‘ri aniq vaqt yuborilmaydi', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<SnoozeModal open subject="Qarzdorlik oshdi" onClose={() => undefined} onConfirm={onConfirm} />);

    expect(screen.getByText('Qarzdorlik oshdi')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Yoki aniq vaqt'), '2020-01-01T10:00');
    await user.click(screen.getByRole('button', { name: 'Kechiktirish' }));
    expect(await screen.findByText('Vaqt kelajakda bo‘lishi kerak')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '1 soatdan keyin' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const until = onConfirm.mock.calls[0]![0] as Date;
    expect(Math.abs(until.getTime() - (Date.now() + 3_600_000))).toBeLessThan(5_000);
  });
});
