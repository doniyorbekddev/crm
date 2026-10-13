import { describe, expect, it } from 'vitest';
import { toCyrillic } from './transliterate';

describe('o‘zbek lotin → kirill', () => {
  it('asosiy harflar, qo‘sh harflar va maxsus belgilar', () => {
    expect(toCyrillic('O‘quvchilar')).toBe('Ўқувчилар');
    expect(toCyrillic('o‘qituvchi')).toBe('ўқитувчи');
    expect(toCyrillic('Guruh')).toBe('Гуруҳ');
    expect(toCyrillic('g‘oya')).toBe('ғоя');
    expect(toCyrillic('Shartnoma')).toBe('Шартнома');
    expect(toCyrillic('Chiqish')).toBe('Чиқиш');
    expect(toCyrillic('Yangi vazifa')).toBe('Янги вазифа');
    expect(toCyrillic('yozuv')).toBe('ёзув');
    expect(toCyrillic('Yuklash')).toBe('Юклаш');
    expect(toCyrillic('Xarajatlar')).toBe('Харажатлар');
    expect(toCyrillic('Hisobot')).toBe('Ҳисобот');
    expect(toCyrillic('Qarzdorlik')).toBe('Қарздорлик');
    expect(toCyrillic('Jadval')).toBe('Жадвал');
  });

  it('"e": so‘z boshida va unlidan keyin "э", undoshdan keyin "е"', () => {
    expect(toCyrillic('Eslatma')).toBe('Эслатма');
    expect(toCyrillic('ertaga')).toBe('эртага');
    expect(toCyrillic('Kelmadi')).toBe('Келмади');
    expect(toCyrillic('poeziya')).toBe('поэзия');
    expect(toCyrillic('Bekor qilish')).toBe('Бекор қилиш');
  });

  it('tutuq belgisi → ъ; apostrofning turli yozilishlari bir xil', () => {
    expect(toCyrillic('Ma’lumot')).toBe('Маълумот');
    expect(toCyrillic('a’lo')).toBe('аъло');
    expect(toCyrillic("O'quvchi")).toBe('Ўқувчи');
    expect(toCyrillic('Oʻquvchi')).toBe('Ўқувчи');
    expect(toCyrillic('to‘lov')).toBe('тўлов');
  });

  it('registr: bosh harf va to‘liq katta yozuv', () => {
    expect(toCyrillic('Shanba')).toBe('Шанба');
    expect(toCyrillic('Yakshanba')).toBe('Якшанба');
    expect(toCyrillic('Davomat')).toBe('Давомат');
  });

  it('qisqartmalar, raqamli belgilar, xorijiy so‘zlar va o‘rin belgilari o‘zgarmaydi', () => {
    expect(toCyrillic('CRM')).toBe('CRM');
    expect(toCyrillic('SMS yuborish')).toBe('SMS юбориш');
    expect(toCyrillic('{0} XP')).toBe('{0} XP');
    expect(toCyrillic('PDF, JPG, PNG — 10 MB gacha')).toBe('PDF, JPG, PNG — 10 MB гача');
    expect(toCyrillic('Excel fayl')).toBe('Excel файл');
    expect(toCyrillic('Click orqali')).toBe('Click орқали');
    expect(toCyrillic('{0} ta ochiq ish')).toBe('{0} та очиқ иш');
    expect(toCyrillic('ST-000045')).toBe('ST-000045');
    expect(toCyrillic('Telegram')).toBe('Телеграм');
  });

  it('tinish belgilari, raqamlar va bo‘sh joylar saqlanadi', () => {
    expect(toCyrillic('Saqlash (2)')).toBe('Сақлаш (2)');
    expect(toCyrillic('Bugun: 3 ta dars — 14:00')).toBe('Бугун: 3 та дарс — 14:00');
    expect(toCyrillic('1-qism')).toBe('1-қисм');
  });
});
