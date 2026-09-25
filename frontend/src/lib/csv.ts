/** Excel uchun CSV (`;` ajratgich, UTF-8 BOM) — eksportlar shu bitta joydan */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  const lines = rows.map((row) => row.map(csvCell).join(';'));
  // BOM — Excel UTF-8 ni to‘g‘ri o‘qishi uchun
  return String.fromCharCode(0xfeff) + [header.map(csvCell).join(';'), ...lines].join('\r\n');
}

export function downloadCsv(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
