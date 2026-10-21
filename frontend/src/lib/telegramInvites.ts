import qrcode from 'qrcode-generator';
import type { GroupTelegramInvites, TelegramInviteLink } from '@/types/onboarding';
import { formatDate } from '@/utils/format';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** QR kod — inline SVG (chop etishda tiniq, internet kerak emas) */
function qrSvg(value: string, size: number): string {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) parts.push(`M${column} ${row}h1v1h-1z`);
    }
  }
  return `<svg viewBox="0 0 ${count} ${count}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${count}" height="${count}" fill="#fff"/><path d="${parts.join('')}" fill="#000"/></svg>`;
}

function block(title: string, link: TelegramInviteLink): string {
  if (link.linked) return `<div class="qr linked"><div class="t">${escapeHtml(title)}</div><div class="ok">✓ Telegram ulangan</div></div>`;
  if (!link.deepLink) return `<div class="qr"><div class="t">${escapeHtml(title)}</div><div class="muted">Havola yo‘q</div></div>`;
  return `<div class="qr"><div class="t">${escapeHtml(title)}</div>${qrSvg(link.deepLink, 112)}</div>`;
}

/** Ulanmaganlari bor qatorlar (hammasi ulangan o'quvchi varaqqa chiqmaydi) */
export function pendingInviteRows(data: GroupTelegramInvites): GroupTelegramInvites['rows'] {
  return data.rows.filter((row) => !row.link.linked || row.parents.some((parent) => !parent.link.linked));
}

/**
 * Guruh Telegram taklifnomalarini chop etish oynasi: har o'quvchi uchun kesib beriladigan kartochka —
 * o'quvchi va ota-onasi QR kodi, ko'rsatma va amal qilish muddati. Hammasi ulanganlar chiqarilmaydi.
 */
export function printTelegramInvites(data: GroupTelegramInvites): boolean {
  const rows = pendingInviteRows(data);
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return false;
  const expires = rows.map((row) => row.link.expiresAt ?? row.parents.find((parent) => parent.link.expiresAt)?.link.expiresAt).find(Boolean);
  const cards = rows
    .map(
      (row) => `<div class="card">
  <div class="head"><div class="name">${escapeHtml(row.student.name)}</div><div class="muted">${escapeHtml(row.student.code)} · ${escapeHtml(data.group.name)}</div></div>
  <div class="codes">
    ${block('O‘quvchi uchun', row.link)}
    ${row.parents.map((parent) => block(`Ota-ona: ${parent.name}`, parent.link)).join('')}
  </div>
  <div class="hint">Telefon kamerasi bilan skanerlang → Telegram ochiladi → <b>Start</b> ni bosing. Kod bir marta ishlaydi${expires ? `, ${escapeHtml(formatDate(expires))} gacha` : ''}.</div>
</div>`,
    )
    .join('');
  popup.document.write(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Telegram taklifnomalari — ${escapeHtml(data.group.name)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:16px;color:#111}
  h1{font-size:16px;margin:0 0 4px} .sub{color:#555;font-size:12px;margin-bottom:12px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .card{border:1px dashed #999;border-radius:8px;padding:10px 12px;break-inside:avoid;font-size:12px}
  .name{font-weight:600;font-size:14px}.muted{color:#555}
  .codes{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}
  .qr{text-align:center;width:120px}.qr .t{font-size:11px;color:#333;margin-bottom:4px;min-height:28px}
  .qr.linked .ok{color:#15803d;font-weight:600;padding:40px 0}
  .hint{color:#444;font-size:11px}
  @media print{body{margin:8mm}}
</style></head><body>
<h1>Telegram orqali xabarlar — ${escapeHtml(data.group.name)} (${escapeHtml(data.group.courseName)})</h1>
<div class="sub">Davomat, vazifa, baholar va to‘lov eslatmalari Telegram'ga keladi. Har kartochkani o‘quvchiga bering.</div>
<div class="grid">${cards}</div></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
