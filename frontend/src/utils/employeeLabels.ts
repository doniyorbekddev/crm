import type { BadgeTone } from '@/components/ui/Badge';
import type { EmployeePosition, EmployeeStatus } from '@/types/employee';

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
