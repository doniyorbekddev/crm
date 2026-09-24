import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

/**
 * Sahifalash — deyarli har bir ro'yxatda ishlatiladi, shuning uchun uning xatosi
 * butun CRM bo'ylab bilinadi. Shu sababli sof funksiya emas, komponent darajasida sinaladi.
 */
describe('Pagination', () => {
  const baseProps = { page: 1, totalPages: 5, total: 95, limit: 20, onPageChange: () => {} };

  it('natijalar oralig‘ini ko‘rsatadi', () => {
    render(<Pagination {...baseProps} page={2} />);
    expect(screen.getByText(/21–40 \/ 95 ta/)).toBeInTheDocument();
  });

  it('oxirgi sahifada oraliq umumiy sondan oshmaydi', () => {
    render(<Pagination {...baseProps} page={5} />);
    expect(screen.getByText(/81–95 \/ 95 ta/)).toBeInTheDocument();
  });

  it('natija bo‘lmasa umuman ko‘rinmaydi', () => {
    const { container } = render(<Pagination {...baseProps} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('bitta sahifa bo‘lsa tugmalar ko‘rsatilmaydi', () => {
    render(<Pagination {...baseProps} totalPages={1} total={12} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/1–12 \/ 12 ta/)).toBeInTheDocument();
  });

  it('birinchi sahifada "oldinga" tugmasi o‘chirilgan', () => {
    render(<Pagination {...baseProps} page={1} />);
    expect(screen.getByRole('button', { name: /oldingi/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /keyingi/i })).toBeEnabled();
  });

  it('oxirgi sahifada "keyingi" tugmasi o‘chirilgan', () => {
    render(<Pagination {...baseProps} page={5} />);
    expect(screen.getByRole('button', { name: /keyingi/i })).toBeDisabled();
  });

  it('sahifa tanlanganda callback chaqiriladi', async () => {
    const onPageChange = vi.fn();
    render(<Pagination {...baseProps} page={1} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: '3' }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('yuklanayotganda barcha tugmalar bloklanadi', () => {
    render(<Pagination {...baseProps} page={2} disabled />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('ko‘p sahifada qisqartirilgan ro‘yxat chiqadi', () => {
    render(<Pagination {...baseProps} page={10} totalPages={20} total={400} />);
    // 1 … 9 10 11 … 20
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
  });
});
