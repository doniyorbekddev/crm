import { deflateRawSync } from 'node:zlib';
import type { Response } from 'express';
import { businessDateString } from './dates.js';

/**
 * Jadvalni CSV yoki Excel (.xlsx) faylga aylantirish (promt.md 46-bo‘lim).
 * XLSX tashqi kutubxonasiz yoziladi: bitta varaq, inline matnlar, ZIP (deflate) konteyner.
 */

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Ro‘yxat eksportida eng ko‘p qatorlar soni — katta bazada serverni bo‘g‘ib qo‘ymaslik uchun */
export const EXPORT_ROW_LIMIT = 5000;

export type ExportColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';
export type ExportCell = string | number | null;

export interface ExportColumn {
  key: string;
  label: string;
  type: ExportColumnType;
}

export interface ExportTable {
  title: string;
  /** Sarlavha ostidagi qator: davr, filtr, qatorlar soni */
  subtitle?: string;
  columns: ExportColumn[];
  rows: Array<Record<string, ExportCell>>;
  /** "Jami" qatori — faqat yig‘iladigan ustunlar */
  totals?: Record<string, number> | null;
}

/** "Eksport: 2026-09-13 · 120 ta" — cheklangan bo‘lsa necha qator chiqqani ham yoziladi */
export function exportSubtitle(shown: number, total: number, now: Date = new Date()): string {
  return `Eksport: ${businessDateString(now)} · ${total} ta${shown < total ? ` (birinchi ${shown} tasi)` : ''}`;
}

/** Pul ustunlari bo‘yicha jami */
export function sumColumns(columns: ExportColumn[], rows: Array<Record<string, ExportCell>>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of columns) {
    if (column.type !== 'money') continue;
    totals[column.key] = rows.reduce((sum, row) => sum + (typeof row[column.key] === 'number' ? (row[column.key] as number) : 0), 0);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * CSV formula injection himoyasi: foydalanuvchi kiritgan matn (ism, izoh) `=`, `+`, `-`, `@`,
 * tab yoki CR bilan boshlansa Excel uni formula sifatida ishga tushiradi (masalan `=HYPERLINK(...)`).
 * Bunday matn oldiga apostrof qo‘yiladi. Raqamlar (manfiy foyda ham) o‘zgarmaydi.
 */
export function neutralizeFormula(value: string | number): string {
  if (typeof value !== 'string') return String(value);
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Excel UTF-8 ni tanishi uchun fayl boshiga qo‘yiladigan BOM belgisi */
const BOM = String.fromCharCode(0xfeff);

export function tableToCsv(table: ExportTable): string {
  const escape = (value: ExportCell | undefined): string => {
    if (value === null || value === undefined) return '""';
    return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
  };

  const lines: string[] = [escape(table.title)];
  if (table.subtitle) lines.push(escape(table.subtitle));
  lines.push('');
  lines.push(table.columns.map((column) => escape(column.label)).join(','));
  for (const row of table.rows) {
    lines.push(table.columns.map((column) => escape(row[column.key] ?? '')).join(','));
  }
  if (table.totals) {
    lines.push(table.columns.map((column, index) => (index === 0 ? escape('Jami') : escape(table.totals?.[column.key] ?? ''))).join(','));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Oddiy ZIP yozuvchi (deflate). Fayl nomlari ASCII, bitta arxiv ~5000 qator uchun yetarli. */
export function createZip(files: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  // DOS sana/vaqt: 2026-01-01 00:00 — tarkib bir xil bo‘lsa fayl ham bir xil bo‘ladi
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const raw = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : file.content;
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

/** XML uchun xavfsiz matn: maxsus belgilar va XML’da ruxsat etilmagan boshqaruv belgilari */
export function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index: number): string {
  let result = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/** styles.xml dagi cellXfs indekslari */
const STYLE = { default: 0, title: 1, header: 2, number: 3, percent: 4, totalText: 5, totalNumber: 6, totalPercent: 7, subtitle: 8 } as const;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0&quot;%&quot;"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function stringCell(ref: string, value: string, style: number): string {
  const styleAttr = style ? ` s="${style}"` : '';
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style: number): string {
  return `<c r="${ref}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
}

function valueCell(ref: string, value: ExportCell | undefined, type: ExportColumnType, total: boolean): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && type !== 'text' && type !== 'date') {
    const style = type === 'percent' ? (total ? STYLE.totalPercent : STYLE.percent) : total ? STYLE.totalNumber : STYLE.number;
    return numberCell(ref, value, style);
  }
  return stringCell(ref, String(value), total ? STYLE.totalText : STYLE.default);
}

/** Excel varaq nomi: 31 belgigacha, `[]:*?/\` belgilarisiz */
function sheetName(title: string): string {
  return title.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hisobot';
}

export function tableToXlsx(table: ExportTable): Buffer {
  const rows: string[] = [];
  let rowNumber = 1;
  const pushRow = (cells: string) => {
    rows.push(`<row r="${rowNumber}">${cells}</row>`);
    rowNumber += 1;
  };

  pushRow(stringCell('A1', table.title, STYLE.title));
  if (table.subtitle) pushRow(stringCell(`A${rowNumber}`, table.subtitle, STYLE.subtitle));
  rowNumber += 1; // bo‘sh qator

  const headerRow = rowNumber;
  pushRow(table.columns.map((column, index) => stringCell(`${columnLetter(index)}${rowNumber}`, column.label, STYLE.header)).join(''));

  for (const row of table.rows) {
    pushRow(table.columns.map((column, index) => valueCell(`${columnLetter(index)}${rowNumber}`, row[column.key], column.type, false)).join(''));
  }

  if (table.totals) {
    const totals = table.totals;
    pushRow(
      table.columns
        .map((column, index) => {
          const ref = `${columnLetter(index)}${rowNumber}`;
          return index === 0 ? stringCell(ref, 'Jami', STYLE.totalText) : valueCell(ref, totals[column.key], column.type, true);
        })
        .join(''),
    );
  }

  // Ustun kengligi: sarlavha va qiymatlar uzunligiga qarab (8–50 belgi)
  const widths = table.columns.map((column) => {
    const longest = table.rows.reduce((max, row) => {
      const value = row[column.key];
      const length = typeof value === 'number' ? value.toLocaleString('en-US').length : (value ?? '').length;
      return Math.max(max, length);
    }, column.label.length);
    return Math.min(Math.max(longest + 2, 8), 50);
  });
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const lastRef = `${columnLetter(Math.max(table.columns.length - 1, 0))}${headerRow}`;

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
${table.rows.length > 0 ? `<autoFilter ref="A${headerRow}:${lastRef.replace(/\d+$/, String(headerRow + table.rows.length))}"/>` : ''}
</worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(sheetName(table.title))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  return createZip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    { name: 'xl/workbook.xml', content: workbook },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
    { name: 'xl/styles.xml', content: STYLES_XML },
  ]);
}

/** Faylni javob sifatida yuboradi; nom faqat xavfsiz belgilardan iborat bo‘ladi */
export function sendTable(res: Response, table: ExportTable, baseName: string, format: ExportFormat): void {
  const safeName = baseName.replace(/[^A-Za-z0-9._-]/g, '_');
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    res.send(tableToXlsx(table));
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
  res.send(tableToCsv(table));
}
