import type { EmployeePosition, EmployeeStatus } from '../generated/prisma/client.js';

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

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Faol',
  ON_LEAVE: 'Ta’tilda',
  SUSPENDED: 'To‘xtatilgan',
  RESIGNED: 'Ishdan ketgan',
};
