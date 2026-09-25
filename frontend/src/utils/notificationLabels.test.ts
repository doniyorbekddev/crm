// @vitest-environment jsdom
import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { router } from '@/routes';
import { notificationLink } from './notificationLabels';

/**
 * Bildirishnomadagi havola haqiqiy sahifaga olib borishi kerak: noto'g'ri yo'l "Sahifa topilmadi"
 * (`*`) ga tushadi, kabinetda esa xodim sahifasi ruxsatsiz — PHASE 10 da topilgan xato qaytmasin.
 */
function resolves(path: string): boolean {
  const matches = matchRoutes(router.routes, path);
  return Boolean(matches) && matches!.at(-1)!.route.path !== '*';
}

const PORTAL_TYPES = ['homework', 'exam', 'attendance', 'weekly_report', 'student', 'certificate'];
const STAFF_TYPES = ['lead', 'followUp', 'student', 'payment', 'debt', 'expense', 'alert', 'digest', 'homework', 'exam', 'attendance'];

describe('notificationLink', () => {
  it('kabinet havolalari faqat /portal ostida va mavjud sahifaga olib boradi (ID bilan ham, ID siz ham)', () => {
    for (const type of PORTAL_TYPES) {
      for (const id of ['abc123', null]) {
        const link = notificationLink(type, id, 'portal');
        expect(link, type).toMatch(/^\/portal(\/|$)/);
        expect(resolves(link!), link!).toBe(true);
      }
    }
  });

  it('kabinetda xodim bo‘limlari (lead, to‘lov, ogohlantirish) havolasiz', () => {
    for (const type of ['lead', 'payment', 'debt', 'alert', 'digest', 'expense']) expect(notificationLink(type, 'x', 'portal')).toBeNull();
  });

  it('xodim havolalari mavjud sahifaga olib boradi', () => {
    for (const type of STAFF_TYPES) {
      const link = notificationLink(type, 'abc123');
      expect(link, type).not.toBeNull();
      expect(resolves(link!), link!).toBe(true);
    }
    expect(notificationLink(null, 'x')).toBeNull();
  });
});
