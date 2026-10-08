import { callback } from './keyboards.js';

/**
 * Vazifa tugmalarining callback kalitlari va xabar tugmalari.
 *
 * Alohida faylda: `task.service` bildirishnomaga tugma qo'shadi, bot handleri esa `task.service` ni chaqiradi —
 * ikkalasi shu faylga tayanadi va bir-birini import qilmaydi (aylanma bog'liqlik yo'q).
 */
export const TASK_ACTIONS = {
  /** `tk_ls[:sahifa]` — menga biriktirilgan ochiq vazifalar */
  list: 'tk_ls',
  /** `tk_op:<id>` — tafsilot */
  open: 'tk_op',
  /** `tk_dn:<id>` — bajarildi */
  done: 'tk_dn',
  /** `tk_tm:<id>` — muddatni 24 soatga surish (faqat tahrirlash huquqi bo'lsa) */
  tomorrow: 'tk_tm',
} as const;

/** Bildirishnoma xabariga qo'shiladigan tugmalar (yetkazish navbatida JSON sifatida saqlanadi) */
export function taskNotificationButtons(taskId: string): Array<{ text: string; data: string }> {
  return [
    { text: '✅ Bajarildi', data: callback(TASK_ACTIONS.done, taskId) },
    { text: '📋 Ochish', data: callback(TASK_ACTIONS.open, taskId) },
  ];
}
