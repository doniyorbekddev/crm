import { describe, expect, it, vi } from 'vitest';
import { headerSort } from './tableSort';

const COLUMNS = { student: 'firstName', startDate: 'startDate' };

describe('headerSort', () => {
  it('joriy saralashni ustun kalitiga aylantiradi', () => {
    expect(headerSort('firstName:asc', COLUMNS, 'createdAt:desc', vi.fn()).sort).toEqual({ key: 'student', direction: 'asc' });
    expect(headerSort('startDate:desc', COLUMNS, 'createdAt:desc', vi.fn()).sort).toEqual({ key: 'startDate', direction: 'desc' });
  });

  it('ustuni yo‘q maydon bo‘yicha saralashda hech bir sarlavha belgilanmaydi', () => {
    expect(headerSort('createdAt:desc', COLUMNS, 'createdAt:desc', vi.fn()).sort).toBeNull();
    expect(headerSort('', COLUMNS, '', vi.fn()).sort).toBeNull();
  });

  it('sarlavha bosilganda API qiymatini beradi, bekor qilinganda standartga qaytadi', () => {
    const onChange = vi.fn();
    const { onSortChange } = headerSort('firstName:desc', COLUMNS, 'createdAt:desc', onChange);
    onSortChange({ key: 'startDate', direction: 'asc' });
    onSortChange(null);
    onSortChange({ key: 'unknown', direction: 'asc' });
    expect(onChange.mock.calls).toEqual([['startDate:asc'], ['createdAt:desc'], ['createdAt:desc']]);
  });

  it('standart tartib shu ustun bo‘yicha bo‘lsa, bekor qilish yo‘nalishni almashtiradi', () => {
    const onChange = vi.fn();
    headerSort('startDate:desc', COLUMNS, 'startDate:desc', onChange).onSortChange(null);
    headerSort('startDate:asc', COLUMNS, 'startDate:desc', onChange).onSortChange(null);
    expect(onChange.mock.calls).toEqual([['startDate:asc'], ['startDate:desc']]);
  });
});
