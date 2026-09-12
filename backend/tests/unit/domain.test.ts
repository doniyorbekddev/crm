import { describe, expect, it } from 'vitest';
import { AUDIT_CRITICAL_ACTIONS, auditActionLabel, auditEntityLabel } from '../../src/config/auditLabels.js';
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, formatLeadNumber } from '../../src/config/leadLabels.js';
import { PAYMENT_METHOD_LABELS, formatPaymentNumber } from '../../src/config/paymentLabels.js';
import { PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_KEYS, SYSTEM_ROLES } from '../../src/config/permissions.js';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_ORDER, formatStudentNumber } from '../../src/config/studentLabels.js';
import { debtStatusOf } from '../../src/services/student.service.js';

/** `ALL_PERMISSIONS` eksport qilinmagan — shu yerda definitionlardan tiklanadi */
const ALL_PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((permission) => permission.key);

describe('ruxsatlar konfiguratsiyasi', () => {
  it('har bir ruxsat kaliti bir marta e’lon qilingan', () => {
    const keys = PERMISSION_DEFINITIONS.map((permission) => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('PERMISSIONS va PERMISSION_DEFINITIONS bir-biriga mos', () => {
    const defined = new Set(PERMISSION_DEFINITIONS.map((permission) => permission.key));
    for (const key of Object.values(PERMISSIONS)) {
      expect(defined.has(key)).toBe(true);
    }
    expect(defined.size).toBe(Object.values(PERMISSIONS).length);
  });

  it('rollardagi barcha ruxsatlar mavjud kalitlardan iborat', () => {
    const known = new Set<string>(ALL_PERMISSION_KEYS);
    for (const role of SYSTEM_ROLES) {
      for (const key of role.permissions) {
        expect(known.has(key)).toBe(true);
      }
    }
  });

  it('Super Admin barcha ruxsatlarga ega, Admin esa xodim/rol/sozlamalarni boshqara olmaydi', () => {
    const superAdmin = SYSTEM_ROLES.find((role) => role.key === ROLE_KEYS.SUPER_ADMIN);
    const admin = SYSTEM_ROLES.find((role) => role.key === ROLE_KEYS.ADMIN);

    expect(superAdmin?.permissions).toHaveLength(ALL_PERMISSION_KEYS.length);
    expect(admin?.permissions).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(admin?.permissions).not.toContain(PERMISSIONS.ROLE_MANAGE);
    expect(admin?.permissions).not.toContain(PERMISSIONS.SETTINGS_MANAGE);
    expect(admin?.permissions).toContain(PERMISSIONS.AUDIT_VIEW);
  });

  it('har bir rolda takrorlanuvchi ruxsat yo‘q', () => {
    for (const role of SYSTEM_ROLES) {
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('rollarning asosiy doiralari to‘g‘ri', () => {
    const byKey = new Map(SYSTEM_ROLES.map((role) => [role.key, role.permissions]));

    // Sotuvchi leadni o‘quvchiga aylantira oladi, lekin to‘lov qabul qila olmaydi
    expect(byKey.get(ROLE_KEYS.SALES_MANAGER)).toContain(PERMISSIONS.STUDENT_CONVERT);
    expect(byKey.get(ROLE_KEYS.SALES_MANAGER)).not.toContain(PERMISSIONS.PAYMENT_CREATE);
    // O‘qituvchi davomat belgilaydi, lekin lead ko‘rmaydi
    expect(byKey.get(ROLE_KEYS.TEACHER)).toContain(PERMISSIONS.ATTENDANCE_MARK);
    expect(byKey.get(ROLE_KEYS.TEACHER)).not.toContain(PERMISSIONS.LEAD_VIEW);
    // Buxgalter moliya bilan ishlaydi, lead bilan emas
    expect(byKey.get(ROLE_KEYS.ACCOUNTANT)).toContain(PERMISSIONS.DEBT_VIEW);
    expect(byKey.get(ROLE_KEYS.ACCOUNTANT)).not.toContain(PERMISSIONS.LEAD_VIEW);
    // Call center faqat lead bilan ishlaydi
    expect(byKey.get(ROLE_KEYS.CALL_CENTER)).toContain(PERMISSIONS.CALL_CREATE);
    expect(byKey.get(ROLE_KEYS.CALL_CENTER)).not.toContain(PERMISSIONS.STUDENT_VIEW);
  });
});

describe('qarzdorlik holati', () => {
  it('to‘lov yo‘q — UNPAID', () => {
    expect(debtStatusOf(1_000_000, 0)).toBe('UNPAID');
  });

  it('qisman to‘langan — PARTIAL', () => {
    expect(debtStatusOf(1_000_000, 1)).toBe('PARTIAL');
    expect(debtStatusOf(1_000_000, 999_999)).toBe('PARTIAL');
  });

  it('to‘liq yoki ortiqcha to‘langan — PAID', () => {
    expect(debtStatusOf(1_000_000, 1_000_000)).toBe('PAID');
    expect(debtStatusOf(1_000_000, 1_200_000)).toBe('PAID');
  });

  it('shartnoma summasi nol bo‘lsa ham xatoliksiz ishlaydi', () => {
    expect(debtStatusOf(0, 0)).toBe('UNPAID');
    expect(debtStatusOf(0, 100)).toBe('PAID');
  });
});

describe('ko‘rinadigan raqamlar', () => {
  it('lead, o‘quvchi va kvitansiya raqamlarini formatlaydi', () => {
    expect(formatLeadNumber(123)).toBe('L-000123');
    expect(formatStudentNumber(45)).toBe('ST-000045');
    expect(formatPaymentNumber(7)).toBe('PM-000007');
  });

  it('katta raqamlar kesilmaydi', () => {
    expect(formatLeadNumber(1_234_567)).toBe('L-1234567');
  });
});

describe('yorliqlar to‘liqligi', () => {
  it('har bir lead statusi uchun o‘zbekcha nom bor', () => {
    for (const status of LEAD_STATUS_ORDER) {
      expect(LEAD_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(LEAD_STATUS_ORDER).toHaveLength(Object.keys(LEAD_STATUS_LABELS).length);
  });

  it('o‘quvchi holatlari va to‘lov usullari nomlangan', () => {
    for (const status of STUDENT_STATUS_ORDER) {
      expect(STUDENT_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(PAYMENT_METHOD_LABELS.CASH).toBe('Naqd');
    expect(PAYMENT_METHOD_LABELS.OTHER).toBeTruthy();
  });

  it('audit yorliqlari noma’lum kalitni ham xavfsiz qaytaradi', () => {
    expect(auditActionLabel('payment.created')).toBe('To‘lov qabul qilindi');
    expect(auditActionLabel('nomalum.amal')).toBe('nomalum.amal');
    expect(auditEntityLabel('student')).toBe('O‘quvchi');
    expect(auditEntityLabel('nomalum')).toBe('nomalum');
  });

  it('muhim amallar ro‘yxati o‘chirish amallarini o‘z ichiga oladi', () => {
    expect(AUDIT_CRITICAL_ACTIONS).toContain('payment.deleted');
    expect(AUDIT_CRITICAL_ACTIONS).toContain('student.deleted');
    expect(AUDIT_CRITICAL_ACTIONS).toContain('role.permissions_updated');
    expect(AUDIT_CRITICAL_ACTIONS).not.toContain('lead.created');
  });
});
