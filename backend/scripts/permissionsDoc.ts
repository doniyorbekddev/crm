/* eslint-disable no-console -- CLI skript */
/**
 * `docs/permissions.md` ni koddan yaratadi — rol × ruxsat matritsasi.
 *   npm run docs:permissions --workspace backend
 */
import { PERMISSION_DEFINITIONS, SYSTEM_ROLES } from '../src/config/permissions.js';
import { writeFileSync } from 'node:fs';

const roles = SYSTEM_ROLES;
const lines: string[] = [];
lines.push('# Ruxsatlar (RBAC) — rol × ruxsat matritsasi');
lines.push('');
lines.push('> **Avtomatik yaratilgan** — manba: `backend/src/config/permissions.ts`. Qo‘lda tahrirlamang — `npm run docs:permissions --workspace backend` bilan qayta yarating.');
lines.push(`> Sana: ${new Date().toISOString().slice(0, 10)}. Ruxsatlar: ${PERMISSION_DEFINITIONS.length} ta, tizim rollari: ${roles.length} ta.`);
lines.push('');
lines.push('## Qanday ishlaydi');
lines.push('');
lines.push('- Har endpoint `authenticate` + `requirePermission(...)` (yoki `requireAnyPermission`) bilan himoyalangan — `backend/src/routes/*.routes.ts`.');
lines.push('- Rol → ruxsat DB da (`RolePermission`); tizim rollari `npm run db:sync-permissions` bilan koddan sinxronlanadi. Maxsus rollar `/roles` sahifasida tuziladi.');
lines.push('- Ruxsat **nima qilish mumkin**ligini aytadi; **qaysi yozuvlar** ko‘rinishi — egalik qatlami: `teachingAccess.ts` (o‘qituvchi → o‘z guruhlari), `leadAccess.ts` (menejer → o‘z leadlari), `branchAccess.ts` (filial), `portal.service.ts` (o‘quvchi/ota-ona → o‘zi/farzandlari). Batafsil: [security.md](security.md).');
lines.push('- Frontend `PermissionGate` faqat interfeys qulayligi — himoya emas.');
lines.push('');
lines.push('## Rollar');
lines.push('');
lines.push('| Kalit | Nomi | Tavsif | Ruxsatlar soni |');
lines.push('|---|---|---|---|');
for (const role of roles) lines.push(`| \`${role.key}\` | ${role.name} | ${role.description} | ${role.permissions.length} |`);
lines.push('');
lines.push('## Matritsa');
lines.push('');
const short: Record<string, string> = { SUPER_ADMIN: 'SA', OWNER: 'OWN', ADMIN: 'ADM', SALES_MANAGER: 'SM', CALL_CENTER: 'CC', TEACHER: 'TCH', ACCOUNTANT: 'ACC', STUDENT: 'STU', PARENT: 'PAR' };
lines.push('Qisqartmalar: ' + roles.map((r) => `${short[r.key] ?? r.key} = ${r.name}`).join(' · '));
lines.push('');
lines.push('| Modul | Ruxsat | Tavsif | ' + roles.map((r) => short[r.key] ?? r.key).join(' | ') + ' |');
lines.push('|---|---|---|' + roles.map(() => ':-:').join('|') + '|');
const byModule = new Map<string, typeof PERMISSION_DEFINITIONS>();
for (const p of PERMISSION_DEFINITIONS) {
  const list = byModule.get(p.module) ?? [];
  list.push(p);
  byModule.set(p.module, list as never);
}
for (const [module, list] of byModule) {
  for (const p of list) {
    const cells = roles.map((r) => (r.permissions.includes(p.key) ? '✅' : '·'));
    lines.push(`| ${module} | \`${p.key}\` | ${p.description} | ${cells.join(' | ')} |`);
  }
}
lines.push('');
writeFileSync(new URL('../../docs/permissions.md', import.meta.url), lines.join('\n'));
console.log('permissions.md yozildi:', PERMISSION_DEFINITIONS.length, 'ruxsat');
