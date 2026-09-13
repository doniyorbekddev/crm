import { describe, expect, it } from 'vitest';
import { columnLetter, crc32, escapeXml, tableToCsv, tableToXlsx } from '../../src/utils/tableExport.js';
import type { ExportTable } from '../../src/utils/tableExport.js';
import { readZip } from '../helpers/zip.js';

const table: ExportTable = {
  title: 'Hisobot: [test]/2026 juda uzun nomli varaq sarlavhasi',
  subtitle: 'Eksport: 2026-09-13 · 2 ta',
  columns: [
    { key: 'name', label: 'Ism', type: 'text' },
    { key: 'amount', label: 'Summa', type: 'money' },
    { key: 'rate', label: 'Ulush', type: 'percent' },
    { key: 'date', label: 'Sana', type: 'date' },
  ],
  rows: [
    { name: '=HYPERLINK("http://evil")', amount: 1_500_000, rate: 60, date: '2026-09-01' },
    { name: 'Ali & <Vali>', amount: 1_000_000, rate: 40, date: null },
  ],
  totals: { amount: 2_500_000 },
};

describe('XLSX yozuvchi', () => {
  it('yordamchi funksiyalar', () => {
    expect(crc32(Buffer.from('hello'))).toBe(0x3610a686);
    expect([0, 25, 26, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
    expect(escapeXml(`<a & "b">${String.fromCharCode(1)}`)).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });

  it('to‘g‘ri tuzilgan ZIP va varaq hosil qiladi', () => {
    const archive = tableToXlsx(table);
    expect(archive.subarray(0, 2).toString()).toBe('PK');

    const files = readZip(archive);
    expect([...files.keys()].sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort(),
    );

    const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
    // Matn inline satr sifatida — formula sifatida bajarilmaydi
    expect(sheet).toContain('<t xml:space="preserve">=HYPERLINK(&quot;http://evil&quot;)</t>');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('Ali &amp; &lt;Vali&gt;');
    // Pul — #,##0 formatli son, foiz — 0"%" formatli son
    expect(sheet).toContain('<c r="B5" s="3"><v>1500000</v></c>');
    expect(sheet).toContain('<c r="C5" s="4"><v>60</v></c>');
    expect(sheet).toContain('<c r="B7" s="6"><v>2500000</v></c>');
    expect(sheet).toContain('<autoFilter ref="A4:D6"/>');
    expect(sheet).toContain('ySplit="4"');

    const workbook = files.get('xl/workbook.xml') ?? '';
    const sheetName = /<sheet name="([^"]*)"/.exec(workbook)?.[1] ?? '';
    expect(sheetName.length).toBeLessThanOrEqual(31);
    expect(sheetName).not.toMatch(/[[\]:*?/\\]/);
  });

  it('CSV sarlavha, izoh qatori va jami bilan', () => {
    const lines = tableToCsv(table).replace(/^\ufeff/, '').split('\r\n');
    expect(lines[0]).toBe(`"${table.title}"`);
    expect(lines[1]).toBe('"Eksport: 2026-09-13 · 2 ta"');
    expect(lines[3]).toBe('"Ism","Summa","Ulush","Sana"');
    expect(lines[4]).toBe(`"'=HYPERLINK(""http://evil"")","1500000","60","2026-09-01"`);
    expect(lines[6]).toBe('"Jami","2500000","",""');
  });
});
