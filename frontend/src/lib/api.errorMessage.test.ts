import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './api';

function apiError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, { status, statusText: '', headers: {}, config, data });
}

describe('getErrorMessage', () => {
  it('umumiy validatsiya xabari o‘rniga birinchi aniq sabab', () => {
    const error = apiError(422, {
      success: false,
      message: 'Kiritilgan ma’lumotlar noto‘g‘ri',
      errors: [{ field: 'contractPrice', message: '2026-yil noyabr uchun 345 000 so‘m to‘lov biriktirilgan — bu oy summasi undan kam bo‘lishi mumkin emas' }],
    });
    expect(getErrorMessage(error)).toBe('2026-yil noyabr uchun 345 000 so‘m to‘lov biriktirilgan — bu oy summasi undan kam bo‘lishi mumkin emas');
  });

  it('aniq server xabari va sababsiz xabar o‘zgarmaydi', () => {
    expect(getErrorMessage(apiError(422, { success: false, message: 'Umumiy chegirma 30% dan oshmasin', errors: [{ field: 'value', message: 'x' }] }))).toBe('Umumiy chegirma 30% dan oshmasin');
    expect(getErrorMessage(apiError(422, { success: false, message: 'Kiritilgan ma’lumotlar noto‘g‘ri', errors: [] }))).toBe('Kiritilgan ma’lumotlar noto‘g‘ri');
  });
});
