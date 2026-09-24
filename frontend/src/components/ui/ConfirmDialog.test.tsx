import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Tasdiqlash oynasi qaytarib bo'lmaydigan amallardan oldin chiqadi (to'lovni bekor qilish,
 * o'quvchini o'chirish). Shuning uchun uning xatti-harakati — ayniqsa "jarayon ketayotganda
 * yopilmasligi" — sinalishi kerak.
 */
describe('ConfirmDialog', () => {
  const base = { open: true, title: 'To‘lovni bekor qilish', description: 'Qaytarib bo‘lmaydi', onConfirm: () => {}, onCancel: () => {} };

  it('yopiq holatda hech narsa chizmaydi', () => {
    render(<ConfirmDialog {...base} open={false} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('sarlavha va izohni ko‘rsatadi', () => {
    render(<ConfirmDialog {...base} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('To‘lovni bekor qilish');
    expect(screen.getByText('Qaytarib bo‘lmaydi')).toBeInTheDocument();
  });

  it('tasdiqlash va bekor qilish tugmalari ishlaydi', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel} confirmLabel="O‘chirish" />);

    await userEvent.click(screen.getByRole('button', { name: 'O‘chirish' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Escape bosilganda yopiladi', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} onCancel={onCancel} />);

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('jarayon ketayotganda Escape ham, bekor qilish ham ishlamaydi', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} onCancel={onCancel} loading />);

    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Bekor qilish' })).toBeDisabled();
  });
});
