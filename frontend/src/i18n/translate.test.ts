import { describe, expect, it } from 'vitest';
import en from './catalog/en.json';
import ru from './catalog/ru.json';
import source from './catalog/source.json';
import type { Catalog, SourceCatalog } from './translate';
import { createTranslator, cyrillicTranslator, translatorFromCatalog } from './translate';

const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort().join(',');

describe('tarjima funksiyasi', () => {
  const translate = createTranslator(
    new Map([
      ['Saqlash', 'Сохранить'],
      ['Bugun', 'Сегодня'],
      ['Yanvar', 'Январь'],
    ]),
    [
      ['{0} ta ochiq ish', '{0} открытых задач'],
      ['{0} dan {1} gacha', 'с {0} по {1}'],
      ['Muddat: {0}', 'Срок: {0}'],
      ['{0} — {1} o‘quvchi', '{1} учеников в {0}'],
      ['{0} {1}', 'XATO'],
    ],
  );

  it('to‘liq mos matn tarjima qilinadi; chetdagi bo‘sh joy va qator ichidagi ortiqcha bo‘shliq saqlanadi/e’tiborga olinmaydi', () => {
    expect(translate('Saqlash')).toBe('Сохранить');
    expect(translate('  Saqlash ')).toBe('  Сохранить ');
    expect(translate('\n      Saqlash\n    ')).toBe('\n      Сохранить\n    ');
  });

  it('lug‘atda yo‘q matn (foydalanuvchi ma’lumoti) o‘zgarmaydi', () => {
    expect(translate('Ali Valiyev')).toBe('Ali Valiyev');
    expect(translate('FE-01')).toBe('FE-01');
    expect(translate('ali@example.com')).toBe('ali@example.com');
    expect(translate('12 345')).toBe('12 345');
    expect(translate('Saqlash tugmasi')).toBe('Saqlash tugmasi');
  });

  it('shablon: o‘zgaruvchi qism saqlanadi, lug‘atda bo‘lsa o‘zi ham tarjima qilinadi, tartib o‘zgarishi mumkin', () => {
    expect(translate('5 ta ochiq ish')).toBe('5 открытых задач');
    expect(translate('Muddat: Bugun')).toBe('Срок: Сегодня');
    expect(translate('Muddat: 14.09.2026')).toBe('Срок: 14.09.2026');
    expect(translate('Yanvar dan Mart gacha')).toBe('с Январь по Mart');
    expect(translate('FE-01 — 12 o‘quvchi')).toBe('12 учеников в FE-01');
  });

  it('bir so‘zli shablon faqat son bilan ishlaydi — foydalanuvchi matni yarim tarjima bo‘lmaydi', () => {
    const numeric = createTranslator(new Map(), [['{0} dars', '{0} уроков'], ['{0} kun oldin', '{0} дн. назад']]);
    expect(numeric('12 dars')).toBe('12 уроков');
    expect(numeric('1 200 dars')).toBe('1 200 уроков');
    expect(numeric('Birinchi dars')).toBe('Birinchi dars');
    expect(numeric('3 kun oldin')).toBe('3 дн. назад');
    // Ikki so'zli shablon — har qanday qiymat bilan
    expect(numeric('bir kun oldin')).toBe('bir дн. назад');
  });

  it('o‘zgarmas qismi yo‘q shablon ("{0} {1}") ishlatilmaydi — aks holda har qanday matnga mos kelardi', () => {
    expect(translate('Ali Valiyev')).not.toBe('XATO');
  });
});

describe('lug‘atlar (ru, en) va kirill', () => {
  const catalogs: Array<[string, Catalog]> = [['ru', ru as Catalog], ['en', en as Catalog]];

  it.each(catalogs)('%s: har bir tarjimada o‘rin belgilari manbadagi bilan bir xil', (_name, catalog) => {
    const broken = Object.entries(catalog.patterns).filter(([key, value]) => placeholders(key) !== placeholders(value));
    expect(broken).toEqual([]);
    expect(Object.keys(catalog.exact).length).toBeGreaterThan(3000);
  });

  it('asosiy interfeys matnlari uchala tilda tarjima qilingan', () => {
    const toRu = translatorFromCatalog(ru as Catalog);
    const toEn = translatorFromCatalog(en as Catalog);
    const toCyrl = cyrillicTranslator(source as SourceCatalog);
    for (const text of ['Saqlash', 'Bekor qilish', 'Davomat', 'O‘quvchilar', 'Guruhlar', 'To‘lovlar', 'Sozlamalar', 'Chiqish', 'Bugungi darslar']) {
      expect(toRu(text), text).toMatch(/[А-Яа-яЁё]/);
      expect(toEn(text), text).not.toBe(text);
      expect(toEn(text), text).toMatch(/^[\x20-\x7e’—…]+$/);
      expect(toCyrl(text), text).toMatch(/[А-Яа-яЎўҚқҒғҲҳ]/);
    }
    expect(toRu('Saqlash')).toBe('Сохранить');
    expect(toEn('Saqlash')).toBe('Save');
    expect(toCyrl('O‘quvchilar')).toBe('Ўқувчилар');
    // Kirill ham foydalanuvchi ma'lumotiga tegmaydi
    expect(toCyrl('Zafar Tohirov')).toBe('Zafar Tohirov');
    expect(toCyrl('ali@example.com')).toBe('ali@example.com');
  });
});
