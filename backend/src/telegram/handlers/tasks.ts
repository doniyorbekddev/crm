import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { taskService } from '../../services/task.service.js';
import type { TaskDto } from '../../services/task.service.js';
import type { CommandScope } from '../../services/telegramCommand.service.js';
import { escapeHtml } from '../../services/telegram.service.js';
import type { InlineButton, InlineKeyboard } from '../../services/telegram.service.js';
import { fmtDateTime } from '../format.js';
import { callback, paginationRow, withNavigation } from '../keyboards.js';
import { TASK_ACTIONS } from '../taskButtons.js';
import type { BotContext, HandlerResult } from '../types.js';

/**
 * Xodim vazifalari botda (CRM 4.0, 2-faza): ro'yxat, tafsilot, "Bajarildi", muddatni ertaga surish.
 *
 * Bot xodim nomidan `taskService` ni chaqiradi — doira va ruxsat CRM'dagi bilan aynan bir xil:
 * begona vazifa uchun servis 404 beradi va bot "topilmadi" deydi. Callback ichidagi vazifa ID'siga
 * ishonilmaydi — har amalda servis egalikni qayta tekshiradi.
 */
const PAGE_SIZE = 6;
const PRIORITY_MARK: Record<TaskDto['priority'], string> = { LOW: '', NORMAL: '', HIGH: '❗ ', URGENT: '🔥 ' };

function dueLine(task: Pick<TaskDto, 'dueAt' | 'overdue'>): string {
  if (!task.dueAt) return 'Muddatsiz';
  return `${task.overdue ? '⚠️ Muddati o‘tgan' : 'Muddat'}: ${fmtDateTime(task.dueAt)}`;
}

/** Servis xatosini foydalanuvchi tilida ko'rsatadi; kutilmagan xato routerga o'tadi */
async function guarded(context: BotContext, run: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    await context.render(`❌ ${escapeHtml(error.message)}`, withNavigation([], callback(TASK_ACTIONS.list)));
    return { action: 'task_error' };
  }
}

async function showList(context: BotContext, actor: AuthUser, page: number): Promise<HandlerResult> {
  const result = await taskService.list(actor, { scope: 'mine', status: 'OPEN', page, limit: PAGE_SIZE });
  if (result.total === 0) {
    await context.render('📋 <b>Vazifalarim</b>\n\nOchiq vazifa yo‘q.', withNavigation([]));
    return { action: TASK_ACTIONS.list };
  }
  const totalPages = Math.ceil(result.total / PAGE_SIZE);
  const lines = result.items.map((task, index) => `${(page - 1) * PAGE_SIZE + index + 1}. ${PRIORITY_MARK[task.priority]}<b>${escapeHtml(task.title)}</b>\n    ${dueLine(task)}`);
  const keyboard: InlineKeyboard = result.items.map((task, index) => [{ text: `${(page - 1) * PAGE_SIZE + index + 1}. ${task.title}`.slice(0, 40), data: callback(TASK_ACTIONS.open, task.id) }]);
  const pager = paginationRow(TASK_ACTIONS.list, { page, totalPages });
  if (pager.length > 0) keyboard.push(pager);
  await context.render(`📋 <b>Vazifalarim</b> — ${result.total} ta ochiq\n\n${lines.join('\n')}`, withNavigation(keyboard));
  return { action: TASK_ACTIONS.list };
}

async function showTask(context: BotContext, actor: AuthUser, id: string, note?: string): Promise<HandlerResult> {
  const task = await taskService.getById(actor, id);
  const text = [
    ...(note ? [note, ''] : []),
    `${PRIORITY_MARK[task.priority]}<b>${escapeHtml(task.title)}</b>`,
    ...(task.description ? [escapeHtml(task.description.slice(0, 600))] : []),
    '',
    dueLine(task),
    `Ijrochi: ${escapeHtml(`${task.assignee.firstName} ${task.assignee.lastName}`)}`,
    ...(task.createdBy ? [`Berdi: ${escapeHtml(`${task.createdBy.firstName} ${task.createdBy.lastName}`)}`] : []),
    ...(task.status === 'OPEN' ? [] : [task.status === 'DONE' ? '✅ Bajarilgan' : '🚫 Bekor qilingan']),
    ...(task.comments.length > 0 ? ['', `💬 Oxirgi izoh: ${escapeHtml(task.comments.at(-1)!.content.slice(0, 200))}`] : []),
  ].join('\n');

  const actions: InlineButton[] = [];
  if (task.status === 'OPEN' && task.can.changeStatus) actions.push({ text: '✅ Bajarildi', data: callback(TASK_ACTIONS.done, task.id) });
  if (task.status === 'OPEN' && task.can.edit) actions.push({ text: '⏰ Ertaga', data: callback(TASK_ACTIONS.tomorrow, task.id) });
  await context.render(text, withNavigation(actions.length > 0 ? [actions] : [], callback(TASK_ACTIONS.list)));
  return { action: TASK_ACTIONS.open };
}

/** `tk_*` tugmalari. Faqat xodim (hisobi bor) uchun; boshqalarga `null` — router bosh menyuni ko'rsatadi */
export async function handleTaskAction(context: BotContext, scope: CommandScope, action: string, arg: string | null): Promise<HandlerResult> {
  const actor = scope.actor;
  if (!actor) return null;
  const client = { ip: null, userAgent: 'telegram-bot' };

  switch (action) {
    case TASK_ACTIONS.list:
      return showList(context, actor, Math.max(Number.parseInt(arg ?? '1', 10) || 1, 1));
    case TASK_ACTIONS.open:
      if (!arg) return null;
      return guarded(context, () => showTask(context, actor, arg));
    case TASK_ACTIONS.done:
      if (!arg) return null;
      return guarded(context, async () => {
        // Ikki marta bosilsa (yoki web'da allaqachon yopilgan bo'lsa) — xato emas, holat ko'rsatiladi
        const current = await taskService.getById(actor, arg);
        if (current.status !== 'OPEN') return showTask(context, actor, arg, 'ℹ️ Bu vazifa allaqachon yopilgan.');
        await taskService.update(actor, arg, { status: 'DONE' }, client);
        await showTask(context, actor, arg, '✅ Bajarildi deb belgilandi.');
        return { action: TASK_ACTIONS.done };
      });
    case TASK_ACTIONS.tomorrow:
      if (!arg) return null;
      return guarded(context, async () => {
        const current = await taskService.getById(actor, arg);
        // Muddati o'tgan bo'lsa — hozirdan, aks holda joriy muddatdan 24 soat
        const base = current.dueAt && new Date(current.dueAt).getTime() > Date.now() ? new Date(current.dueAt).getTime() : Date.now();
        await taskService.update(actor, arg, { dueAt: new Date(base + 24 * 3_600_000) }, client);
        await showTask(context, actor, arg, '⏰ Muddat 24 soatga surildi.');
        return { action: TASK_ACTIONS.tomorrow };
      });
    default:
      return null;
  }
}
