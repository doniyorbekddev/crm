/**
 * Kabinet login/parollarini tarqatish: CSV va chop etish kartochkalari.
 * Parollar faqat brauzerda — serverga qayta yuborilmaydi va hech qayerda saqlanmaydi.
 * O‘quvchi (login — ID raqami) va ota-ona (login — telefon) uchun bir xil.
 */
export interface CredentialRow {
  fullName: string;
  /** Ikkinchi qator: o‘quvchida "ST-000045 · Guruh", ota-onada farzandlari */
  subtitle: string | null;
  login: string;
  temporaryPassword: string;
}

function csvCell(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function credentialsCsv(rows: readonly CredentialRow[]): string {
  const header = ['F.I.Sh', 'Izoh', 'Login', 'Parol'];
  const lines = rows.map((row) => [row.fullName, row.subtitle ?? '', row.login, row.temporaryPassword].map(csvCell).join(';'));
  // BOM — Excel UTF-8 ni to‘g‘ri o‘qishi uchun
  return String.fromCharCode(0xfeff) + [header.join(';'), ...lines].join('\r\n');
}

export function downloadCredentialsCsv(rows: readonly CredentialRow[], fileName = 'kabinet-parollar.csv'): void {
  const url = URL.createObjectURL(new Blob([credentialsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/**
 * Qirqib beriladigan kartochkalar: ism, izoh, sayt manzili, login, parol.
 * Alohida oynada ochiladi va chop etish dialogi chaqiriladi.
 */
export function printCredentials(rows: readonly CredentialRow[], siteUrl: string): boolean {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return false;
  const cards = rows
    .map(
      (row) => `<div class="card">
  <div class="name">${escapeHtml(row.fullName)}</div>
  ${row.subtitle ? `<div class="muted">${escapeHtml(row.subtitle)}</div>` : ''}
  <div class="row"><span>Sayt:</span> <b>${escapeHtml(siteUrl)}</b></div>
  <div class="row"><span>Login:</span> <b class="mono">${escapeHtml(row.login)}</b></div>
  <div class="row"><span>Parol:</span> <b class="mono">${escapeHtml(row.temporaryPassword)}</b></div>
  <div class="hint">Birinchi kirishda o‘zingizning yangi parolingizni o‘rnatasiz.</div>
</div>`,
    )
    .join('');
  popup.document.write(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Kabinet parollari</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:16px;color:#111}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .card{border:1px dashed #999;border-radius:8px;padding:10px 12px;break-inside:avoid;font-size:13px}
  .name{font-weight:600;font-size:15px}.muted{color:#555;margin-bottom:6px}
  .row span{display:inline-block;width:48px;color:#555}.mono{font-family:ui-monospace,Menlo,monospace;font-size:14px}
  .hint{margin-top:6px;color:#666;font-size:11px}
  @media print{body{margin:8mm}}
</style></head><body><div class="grid">${cards}</div></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
