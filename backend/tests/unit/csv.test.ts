import { describe, expect, it } from 'vitest';
import { neutralizeFormula, toCsv } from '../../src/services/report.service.js';
import type { ReportDto } from '../../src/services/report.service.js';

describe('CSV formula injection himoyasi', () => {
  it('formula bilan boshlanadigan matn oldiga apostrof qo‘yiladi', () => {
    expect(neutralizeFormula('=HYPERLINK("http://evil","bosing")')).toBe(`'=HYPERLINK("http://evil","bosing")`);
    expect(neutralizeFormula('+998901234567')).toBe(`'+998901234567`);
    expect(neutralizeFormula('-2+3')).toBe(`'-2+3`);
    expect(neutralizeFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutralizeFormula('\tTAB')).toBe(`'\tTAB`);
  });

  it('oddiy matn va raqamlar o‘zgarmaydi (manfiy foyda ham)', () => {
    expect(neutralizeFormula('Aziz Karimov')).toBe('Aziz Karimov');
    expect(neutralizeFormula(-600_000)).toBe('-600000');
    expect(neutralizeFormula(0)).toBe('0');
  });

  it('eksport faylida himoya qo‘llanadi', () => {
    const report: ReportDto = {
      type: 'debts',
      title: 'Sinov',
      description: '',
      from: '2026-09-01',
      to: '2026-09-30',
      columns: [
        { key: 'student', label: 'O‘quvchi', type: 'text' },
        { key: 'profit', label: 'Foyda', type: 'money' },
      ],
      rows: [{ student: '=cmd|"/C calc"!A0', profit: -1500 }],
      totals: null,
      kpis: [],
      truncatedFrom: null,
    };
    const csv = toCsv(report);
    expect(csv).toContain(`"'=cmd|""/C calc""!A0","-1500"`);
  });
});
