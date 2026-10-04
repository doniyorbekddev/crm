import type { BadgeTone } from '@/components/ui/Badge';
import { ALERT_SEVERITY_LABELS, ALERT_SEVERITY_TONES } from './alertLabels';
import { CALL_RESULT_LABELS, CALL_RESULT_TONES, FOLLOW_UP_STATE_LABELS, FOLLOW_UP_STATE_TONES } from './callLabels';
import { COMMISSION_KIND_LABELS, COMMISSION_KIND_TONES } from './commissionLabels';
import { COURSE_STATUS_LABELS, COURSE_STATUS_TONES, GROUP_STATUS_LABELS, GROUP_STATUS_TONES } from './courseLabels';
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONES, LEAVE_STATUS_LABELS, LEAVE_STATUS_TONES } from './employeeLabels';
import {
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_TONES,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_TONES,
} from './financeLabels';
import { XP_SOURCE_LABELS, XP_SOURCE_TONES } from './gamificationLabels';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_TONES,
  EXAM_STATUS_LABELS,
  EXAM_STATUS_TONES,
  HOMEWORK_STATUS_LABELS,
  HOMEWORK_STATUS_TONES,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_TONES,
} from './homeworkLabels';
import { STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_TONES } from './inventoryLabels';
import {
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_TONES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_TONES,
} from './leadLabels';
import { LESSON_STATUS_LABELS, LESSON_STATUS_TONES } from './lessonLabels';
import { MASTERY_STATUS_LABELS, MASTERY_STATUS_TONES } from './masteryLabels';
import { NOTIFICATION_PRIORITY_LABELS, NOTIFICATION_PRIORITY_TONES } from './notificationLabels';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_TONES } from './paymentLabels';
import { INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES } from './scheduleLabels';
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_TONES,
  DEBT_STATUS_LABELS,
  DEBT_STATUS_TONES,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_TONES,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
} from './studentLabels';
import { SALARY_STATUS_LABELS, SALARY_STATUS_TONES } from './teacherLabels';
import { USER_STATUS_LABELS, USER_STATUS_TONES } from '@/pages/users/userLabels';

/**
 * Holatlarning yagona registri: holat → yorliq → semantik ohang.
 *
 * Yorliq va ohanglar mavjud `*Labels.ts` fayllaridan olinadi (yangi biznes holati o'ylab topilmagan, API qiymatlari
 * o'zgarmagan). `define` yorliq va ohang jadvallari **bir xil holatlarni** qamrashini kompilyatsiyada tekshiradi.
 * Yangi holat turi qo'shilsa — shu yerga bitta qator.
 */
const define = <Status extends string>(labels: Record<Status, string>, tones: Record<Status, BadgeTone>) => ({ labels, tones });

export const STATUS_REGISTRY = {
  alertSeverity: define(ALERT_SEVERITY_LABELS, ALERT_SEVERITY_TONES),
  attendance: define(ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONES),
  budget: define(BUDGET_STATUS_LABELS, BUDGET_STATUS_TONES),
  callResult: define(CALL_RESULT_LABELS, CALL_RESULT_TONES),
  commissionKind: define(COMMISSION_KIND_LABELS, COMMISSION_KIND_TONES),
  course: define(COURSE_STATUS_LABELS, COURSE_STATUS_TONES),
  debt: define(DEBT_STATUS_LABELS, DEBT_STATUS_TONES),
  difficulty: define(DIFFICULTY_LABELS, DIFFICULTY_TONES),
  employee: define(EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONES),
  exam: define(EXAM_STATUS_LABELS, EXAM_STATUS_TONES),
  expense: define(EXPENSE_STATUS_LABELS, EXPENSE_STATUS_TONES),
  followUp: define(FOLLOW_UP_STATE_LABELS, FOLLOW_UP_STATE_TONES),
  group: define(GROUP_STATUS_LABELS, GROUP_STATUS_TONES),
  homework: define(HOMEWORK_STATUS_LABELS, HOMEWORK_STATUS_TONES),
  installment: define(INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES),
  lead: define(LEAD_STATUS_LABELS, LEAD_STATUS_TONES),
  leadPriority: define(LEAD_PRIORITY_LABELS, LEAD_PRIORITY_TONES),
  leadTemperature: define(LEAD_TEMPERATURE_LABELS, LEAD_TEMPERATURE_TONES),
  leave: define(LEAVE_STATUS_LABELS, LEAVE_STATUS_TONES),
  lesson: define(LESSON_STATUS_LABELS, LESSON_STATUS_TONES),
  mastery: define(MASTERY_STATUS_LABELS, MASTERY_STATUS_TONES),
  notificationPriority: define(NOTIFICATION_PRIORITY_LABELS, NOTIFICATION_PRIORITY_TONES),
  paymentMethod: define(PAYMENT_METHOD_LABELS, PAYMENT_METHOD_TONES),
  risk: define(RISK_LEVEL_LABELS, RISK_LEVEL_TONES),
  salary: define(SALARY_STATUS_LABELS, SALARY_STATUS_TONES),
  stockMovement: define(STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_TONES),
  student: define(STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES),
  submission: define(SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_TONES),
  transactionType: define(TRANSACTION_TYPE_LABELS, TRANSACTION_TYPE_TONES),
  user: define(USER_STATUS_LABELS, USER_STATUS_TONES),
  xpSource: define(XP_SOURCE_LABELS, XP_SOURCE_TONES),
} as const;

export type StatusKind = keyof typeof STATUS_REGISTRY;
export type StatusOf<Kind extends StatusKind> = keyof (typeof STATUS_REGISTRY)[Kind]['labels'] & string;

/** Noma'lum qiymat (masalan API'ga yangi holat qo'shilgan) — xom qiymat neytral ohangda ko'rsatiladi, sahifa yiqilmaydi */
export function resolveStatus(kind: StatusKind, status: string): { label: string; tone: BadgeTone } {
  const entry = STATUS_REGISTRY[kind] as { labels: Record<string, string>; tones: Record<string, BadgeTone> };
  return { label: entry.labels[status] ?? status, tone: entry.tones[status] ?? 'neutral' };
}
