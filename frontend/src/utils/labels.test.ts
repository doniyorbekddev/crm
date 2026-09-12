import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/types/auth';
import { formatSchedule, sortWeekDays } from './courseLabels';
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, leadFullName } from './leadLabels';
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_ORDER, notificationLink } from './notificationLabels';
import { DEBT_RANGE_LABELS, DEBT_RANGE_ORDER, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from './paymentLabels';
import { groupPermissions, hasPermission, permissionModuleLabel } from './permissions';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_ORDER, fullName } from './studentLabels';

describe('ruxsat yordamchilari', () => {
  const user = { permissions: ['lead.view', 'lead.create', 'payment.view'] } as AuthUser;

  it('foydalanuvchining ruxsatini tekshiradi', () => {
    expect(hasPermission(user, 'lead.view')).toBe(true);
    expect(hasPermission(user, 'lead.delete')).toBe(false);
    expect(hasPermission(null, 'lead.view')).toBe(false);
  });

  it('ruxsatlarni modullar bo‘yicha guruhlaydi', () => {
    const groups = groupPermissions(user.permissions);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ module: 'lead', label: 'Leadlar' });
    expect(groups[0]?.actions).toEqual(['Ko‘rish', 'Yaratish']);
    expect(groups[1]).toMatchObject({ module: 'payment', label: 'To‘lovlar' });
  });

  it('noma’lum modul kaliti o‘z nomi bilan qoladi', () => {
    expect(permissionModuleLabel('leads')).toBe('Leadlar');
    expect(permissionModuleLabel('nomalum')).toBe('nomalum');
    expect(groupPermissions(['nomalum.harakat'])[0]).toMatchObject({ label: 'nomalum', actions: ['harakat'] });
  });
});

describe('ismlar', () => {
  it('lead va o‘quvchi ismini to‘liq ko‘rinishda beradi', () => {
    expect(leadFullName({ firstName: 'Ali', lastName: 'Valiyev' })).toBe('Ali Valiyev');
    expect(leadFullName({ firstName: 'Ali', lastName: null })).toBe('Ali');
    expect(fullName({ firstName: 'Nodira', lastName: 'Karimova' })).toBe('Nodira Karimova');
  });
});

describe('dars jadvali', () => {
  it('kunlarni hafta tartibida saralaydi', () => {
    expect(sortWeekDays(['FRIDAY', 'MONDAY', 'WEDNESDAY'])).toEqual(['MONDAY', 'WEDNESDAY', 'FRIDAY']);
  });

  it('jadvalni qisqa ko‘rinishda yozadi', () => {
    const schedule = formatSchedule(['MONDAY', 'WEDNESDAY', 'FRIDAY'], '14:00', '16:00');
    expect(schedule).toContain('14:00');
    expect(schedule).toContain('16:00');
    expect(schedule.length).toBeGreaterThan(5);
  });
});

describe('yorliqlar to‘liqligi', () => {
  it('har bir lead statusi nomlangan', () => {
    for (const status of LEAD_STATUS_ORDER) {
      expect(LEAD_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('o‘quvchi holatlari, to‘lov usullari va qarz oraliqlari nomlangan', () => {
    for (const status of STUDENT_STATUS_ORDER) expect(STUDENT_STATUS_LABELS[status]).toBeTruthy();
    for (const method of PAYMENT_METHOD_ORDER) expect(PAYMENT_METHOD_LABELS[method]).toBeTruthy();
    for (const range of DEBT_RANGE_ORDER) expect(DEBT_RANGE_LABELS[range]).toBeTruthy();
  });

  it('har bir bildirishnoma turi nomlangan', () => {
    for (const type of NOTIFICATION_TYPE_ORDER) {
      expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});

describe('bildirishnoma havolalari', () => {
  it('obyekt turiga qarab sahifaga yo‘naltiradi', () => {
    expect(notificationLink('lead', 'lead-1')).toBe('/leads/lead-1');
    expect(notificationLink('lead', null)).toBe('/leads');
    expect(notificationLink('followUp', 'f1')).toBe('/follow-ups');
    expect(notificationLink('payment', 'p1')).toBe('/payments');
    expect(notificationLink('debt', null)).toBe('/debts');
  });

  it('noma’lum yoki bo‘sh tur uchun havola bermaydi', () => {
    expect(notificationLink(null, null)).toBeNull();
    expect(notificationLink('nomalum', 'x')).toBeNull();
  });
});
