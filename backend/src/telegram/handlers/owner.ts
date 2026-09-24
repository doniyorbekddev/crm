import { PERMISSIONS } from '../../config/permissions.js';
import { alertService } from '../../services/alert.service.js';
import { dashboardService } from '../../services/dashboard.service.js';
import { debtService } from '../../services/debt.service.js';
import { permissionService } from '../../services/permission.service.js';
import { studentService } from '../../services/student.service.js';
import { escapeHtml, type InlineButton, type InlineKeyboard } from '../../services/telegram.service.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import type { AuthUser } from '../../types/auth.js';
import type { AlertListQuery } from '../../validators/alert.validator.js';
import type { DebtListQuery } from '../../validators/payment.validator.js';
import { fmtDate, moneyUz } from '../format.js';
import { MAIN_MENU, MAIN_MENU_BUTTON_TEXT, callback } from '../keyboards.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * Rahbar bo'limlari: bugungi ko'rsatkichlar, qarzdorlar, xavf ostidagi o'quvchilar, ogohlantirishlar.
 *
 * Raqamlar **faqat CRM'dan** — `dashboardService.summary` bilan bir xil manba (TZ §23).
 * Panel bloklari ruxsatga qarab `null` keladi: buxgalterga moliya, menejerga leadlar —
 * bot faqat kelgan bloklarni ko'rsatadi, o'zi hech nimani hisoblamaydi.
 *
 * `debtService.list` va `alertService.list` actor olmaydi — shuning uchun ruxsat shu yerda
 * tekshiriladi (`debt.view`, `alert.view`); menyuda ham shu ruxsat bo'lmasa tugma chiqmaydi.
 */

export const OWNER_ACTIONS = {
  dashboard: 'ow_dash',
  debts: 'ow_debts',
  risk: 'ow_risk',
  alerts: 'ow_alerts',
} as const;

const LIST_LIMIT = 10;

function menuRow(): InlineButton[] {
  return [{ text: MAIN_MENU_BUTTON_TEXT, data: callback(MAIN_MENU) }];
}

async function requireActor(context: BotContext, scope: CommandScope): Promise<AuthUser | null> {
  if (scope.actor) return scope.actor;
  await context.render('Bu bo‘lim xodimlar uchun.', [menuRow()]);
  return null;
}

async function requirePermission(context: BotContext, actor: AuthUser, permission: string): Promise<boolean> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  if (permissions.has(permission)) return true;
  await context.render('❌ Bu bo‘limga ruxsatingiz yo‘q.', [menuRow()]);
  return false;
}

function growth(value: number): string {
  if (value > 0) return `📈 +${value}%`;
  if (value < 0) return `📉 ${value}%`;
  return '➖ 0%';
}

export async function showDashboard(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: OWNER_ACTIONS.dashboard };
  if (!(await requirePermission(context, actor, PERMISSIONS.DASHBOARD_VIEW))) return { action: OWNER_ACTIONS.dashboard };

  const d = await dashboardService.summary(actor);
  const lines = [`<b>📊 Ko‘rsatkichlar</b> · ${fmtDate(new Date())}`];

  if (d.finance) {
    lines.push('', `💰 Bugungi tushum: <b>${moneyUz(d.finance.todayRevenue)}</b>`, `📅 Oy: ${moneyUz(d.finance.monthRevenue)} (${growth(d.finance.monthGrowth)} o‘tgan oyga)`);
  }
  if (d.money) {
    lines.push(`💸 Oy xarajati: ${moneyUz(d.money.monthExpense)}`, `📈 Sof natija: <b>${moneyUz(d.money.monthNetProfit)}</b>`, `🏦 Kassa: ${moneyUz(d.money.cashBalance)}`);
    if (d.money.salaryDue !== null && d.money.salaryDue > 0) lines.push(`👨‍🏫 Maosh navbati: ${moneyUz(d.money.salaryDue)}`);
  }
  if (d.students) {
    lines.push('', `👨‍🎓 Faol o‘quvchilar: <b>${d.students.active}</b> · bu oy yangi: ${d.students.monthNew}${d.students.frozen ? ` · muzlatilgan: ${d.students.frozen}` : ''}`);
  }
  if (d.leads) {
    lines.push(`📞 Leadlar: bugun ${d.leads.todayNew}, oy ${d.leads.monthNew} · ochiq ${d.leads.open}`, `🎯 Konversiya: <b>${d.leads.conversionRate}%</b> (sotildi ${d.leads.monthWon}, yo‘qotildi ${d.leads.monthLost})`);
  }
  if (d.debts) {
    lines.push(`⚠️ Qarzdorlik: <b>${moneyUz(d.debts.totalRemaining)}</b> · ${d.debts.debtors} o‘quvchi`);
  }
  if (d.tasks) {
    lines.push(`⏰ Follow-up: bugun ${d.tasks.todayFollowUps}${d.tasks.overdueFollowUps ? `, kechikkan <b>${d.tasks.overdueFollowUps}</b>` : ''}`);
  }
  if (d.teaching) {
    lines.push(`📚 Darslar: ${d.teaching.markedLessons}/${d.teaching.todayLessons} davomat olindi · kelmadi ${d.teaching.todayAbsent}`);
  }
  if (lines.length === 1) lines.push('', 'Ko‘rsatish uchun ma’lumot yo‘q.');

  const buttons: InlineButton[] = [];
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  if (permissions.has(PERMISSIONS.DEBT_VIEW)) buttons.push({ text: '⚠️ Qarzdorlar', data: callback(OWNER_ACTIONS.debts) });
  if (permissions.has(PERMISSIONS.STUDENT_VIEW)) buttons.push({ text: '🔥 Xavf ostida', data: callback(OWNER_ACTIONS.risk) });
  if (permissions.has(PERMISSIONS.ALERT_VIEW)) buttons.push({ text: '🔔 Ogohlantirishlar', data: callback(OWNER_ACTIONS.alerts) });

  const keyboard: InlineKeyboard = [];
  for (let index = 0; index < buttons.length; index += 2) keyboard.push(buttons.slice(index, index + 2));
  keyboard.push(menuRow());
  await context.render(lines.join('\n'), keyboard);
  return { action: OWNER_ACTIONS.dashboard };
}

export async function showDebtors(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: OWNER_ACTIONS.debts };
  if (!(await requirePermission(context, actor, PERMISSIONS.DEBT_VIEW))) return { action: OWNER_ACTIONS.debts };

  const { items, total } = await debtService.list({ page: 1, limit: LIST_LIMIT, range: 'all', sortBy: 'remaining', due: 'all' } as unknown as DebtListQuery);
  if (items.length === 0) {
    await context.render('✅ Qarzdor o‘quvchi yo‘q.', [menuRow()]);
    return { action: OWNER_ACTIONS.debts };
  }

  const lines = [`<b>⚠️ Qarzdorlar</b> · ${total} ta (eng kattalari)`, ''];
  for (const debt of items) {
    const overdue = debt.schedule && debt.schedule.overdueAmount > 0 ? ` · ⏰ ${debt.schedule.overdueDays} kun kechikkan` : '';
    lines.push(`• <b>${escapeHtml(debt.firstName)} ${escapeHtml(debt.lastName)}</b> — ${moneyUz(debt.remaining)}${overdue}`);
    lines.push(`   ${escapeHtml(debt.group?.name ?? debt.course.name)} · ${escapeHtml(debt.phone)}`);
  }
  await context.render(lines.join('\n'), [[{ text: '📊 Ko‘rsatkichlar', data: callback(OWNER_ACTIONS.dashboard) }, ...menuRow()]]);
  return { action: OWNER_ACTIONS.debts };
}

const RISK_MARK: Record<string, string> = { CRITICAL: '🔴', AT_RISK: '🟠', ATTENTION: '🟡', HEALTHY: '🟢' };

export async function showAtRisk(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: OWNER_ACTIONS.risk };
  if (!(await requirePermission(context, actor, PERMISSIONS.STUDENT_VIEW))) return { action: OWNER_ACTIONS.risk };

  const students = await studentService.atRisk(actor, { limit: LIST_LIMIT });
  if (students.length === 0) {
    await context.render('✅ Xavf ostidagi o‘quvchi yo‘q.', [menuRow()]);
    return { action: OWNER_ACTIONS.risk };
  }

  const lines = [`<b>🔥 Xavf ostidagi o‘quvchilar</b> · ${students.length} ta`, ''];
  for (const student of students) {
    const mark = student.riskLevel ? (RISK_MARK[student.riskLevel] ?? '') : '';
    lines.push(`${mark} <b>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</b> · sog‘lomlik ${student.healthScore ?? '—'}/100`);
    lines.push(`   ${escapeHtml(student.group?.name ?? student.course.name)}${student.debt && student.debt.remaining > 0 ? ` · qarz ${moneyUz(student.debt.remaining)}` : ''}`);
  }
  lines.push('', 'Sabablar va tafsilot — CRM’dagi o‘quvchi profilida.');
  await context.render(lines.join('\n'), [[{ text: '📊 Ko‘rsatkichlar', data: callback(OWNER_ACTIONS.dashboard) }, ...menuRow()]]);
  return { action: OWNER_ACTIONS.risk };
}

const SEVERITY_MARK: Record<string, string> = { CRITICAL: '🔴', WARNING: '🟠', INFO: 'ℹ️', SUCCESS: '✅' };

export async function showAlerts(context: BotContext, scope: CommandScope): Promise<HandlerResult> {
  const actor = await requireActor(context, scope);
  if (!actor) return { action: OWNER_ACTIONS.alerts };
  if (!(await requirePermission(context, actor, PERMISSIONS.ALERT_VIEW))) return { action: OWNER_ACTIONS.alerts };

  const { items, total } = await alertService.list({ page: 1, limit: LIST_LIMIT, status: 'open' } as unknown as AlertListQuery);
  if (items.length === 0) {
    await context.render('✅ Ochiq ogohlantirish yo‘q.', [menuRow()]);
    return { action: OWNER_ACTIONS.alerts };
  }

  const lines = [`<b>🔔 Ogohlantirishlar</b> · ${total} ta ochiq`, ''];
  for (const alert of items) {
    lines.push(`${SEVERITY_MARK[alert.severity] ?? '•'} <b>${escapeHtml(alert.title)}</b>`, `   ${escapeHtml(alert.message.slice(0, 160))} · ${fmtDate(alert.createdAt)}`);
  }
  await context.render(lines.join('\n'), [[{ text: '📊 Ko‘rsatkichlar', data: callback(OWNER_ACTIONS.dashboard) }, ...menuRow()]]);
  return { action: OWNER_ACTIONS.alerts };
}

export const OWNER_COMMANDS: Readonly<Record<string, string>> = {
  '/panel': OWNER_ACTIONS.dashboard,
  '/qarzdorlar': OWNER_ACTIONS.debts,
};

export async function handleOwnerAction(context: BotContext, scope: CommandScope, action: string): Promise<HandlerResult | undefined> {
  switch (action) {
    case OWNER_ACTIONS.dashboard:
      return showDashboard(context, scope);
    case OWNER_ACTIONS.debts:
      return showDebtors(context, scope);
    case OWNER_ACTIONS.risk:
      return showAtRisk(context, scope);
    case OWNER_ACTIONS.alerts:
      return showAlerts(context, scope);
    default:
      return undefined;
  }
}
