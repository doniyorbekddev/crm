import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/types/auth';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { availableQuickActions, matchQuickActions } from './quickActions';

function userWith(permissions: string[]): AuthUser {
  return { permissions } as AuthUser;
}

describe('tez yaratish amallari', () => {
  it('foydalanuvchi yo‘q — amal ham yo‘q', () => {
    expect(availableQuickActions(null)).toEqual([]);
  });

  it('sahifani ko‘rish va yaratish ruxsati ikkalasi ham kerak', () => {
    const onlyCreate = availableQuickActions(userWith([PERMISSIONS.PAYMENT_CREATE]));
    expect(onlyCreate.map((action) => action.key)).toEqual([]);

    const both = availableQuickActions(userWith([PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_CREATE, PERMISSIONS.TASK_CREATE]));
    expect(both.map((action) => action.key)).toEqual(['payment', 'task']);
    expect(both[0]!.url).toBe('/payments?create=1');
  });

  it('qidiruv so‘zi nom yoki kalit so‘zlarga mos keladi', () => {
    const all = availableQuickActions(
      userWith([PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_CREATE, PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_MANAGE]),
    );
    expect(matchQuickActions(all, '').map((action) => action.key)).toEqual(['lead', 'expense']);
    expect(matchQuickActions(all, 'XARAJ').map((action) => action.key)).toEqual(['expense']);
    expect(matchQuickActions(all, 'lid').map((action) => action.key)).toEqual(['lead']);
    expect(matchQuickActions(all, 'kurs')).toEqual([]);
  });
});
