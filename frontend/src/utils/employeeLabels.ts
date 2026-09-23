import type { BadgeTone } from '@/components/ui/Badge';
import type { EmployeePosition, EmployeeStatus, LeaveStatus, LeaveType } from '@/types/employee';

export const EMPLOYEE_POSITION_ORDER = [
  'ADMINISTRATOR',
  'MANAGER',
  'SALES_MANAGER',
  'CALL_CENTER',
  'ACCOUNTANT',
  'CLEANER',
  'SECURITY',
  'OTHER',
] as const satisfies readonly EmployeePosition[];

export const EMPLOYEE_POSITION_LABELS: Record<EmployeePosition, string> = {
  ADMINISTRATOR: 'Administrator',
  MANAGER: 'Menejer',
  SALES_MANAGER: 'Sotuv menejeri',
  CALL_CENTER: 'Call-markaz operatori',
  ACCOUNTANT: 'Buxgalter',
  CLEANER: 'Farrosh',
  SECURITY: 'Qo‘riqchi',
  OTHER: 'Boshqa',
};

export const EMPLOYEE_STATUS_ORDER = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED'] as const satisfies readonly EmployeeStatus[];

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Faol',
  ON_LEAVE: 'Ta’tilda',
  SUSPENDED: 'To‘xtatilgan',
  RESIGNED: 'Ishdan ketgan',
};

export const EMPLOYEE_STATUS_TONES: Record<EmployeeStatus, BadgeTone> = {
  ACTIVE: 'green',
  ON_LEAVE: 'blue',
  SUSPENDED: 'yellow',
  RESIGNED: 'gray',
};

/** Ta'til turlari */
export const LEAVE_TYPE_ORDER: readonly LeaveType[] = ['VACATION', 'SICK', 'UNPAID', 'MATERNITY', 'OTHER'];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  VACATION: 'Yillik ta’til',
  SICK: 'Kasallik',
  UNPAID: 'Haq to‘lanmaydigan',
  MATERNITY: 'Tug‘ruq ta’tili',
  OTHER: 'Boshqa',
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: 'Ko‘rib chiqilmoqda',
  APPROVED: 'Tasdiqlangan',
  REJECTED: 'Rad etilgan',
  CANCELLED: 'Bekor qilingan',
};

export const LEAVE_STATUS_TONES: Record<LeaveStatus, BadgeTone> = {
  PENDING: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'gray',
};
