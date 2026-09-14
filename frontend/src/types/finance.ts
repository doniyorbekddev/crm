import type { PersonRef } from './lead';
import type { PaymentMethod } from './payment';

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'REFUND';
export type TransactionStatus = 'COMPLETED' | 'VOID' | 'REVERSED';
export type AccountType = 'CASH' | 'BANK' | 'CARD' | 'UZCARD' | 'HUMO' | 'CLICK' | 'PAYME' | 'UZUM' | 'OTHER';
export type CashFlowPeriod = 'day' | 'week' | 'month';
export type ExpenseStatus = 'UPCOMING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface FinanceAccount {
  id: string;
  key: string;
  name: string;
  type: AccountType;
  balance: number;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
  income: number;
  expense: number;
  transactions: number;
}

export interface Transaction {
  id: string;
  number: number;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  occurredAt: string;
  description: string | null;
  categoryName: string | null;
  entityType: string | null;
  entityId: string | null;
  account: { id: string; name: string; type: AccountType } | null;
  createdBy: PersonRef | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: PersonRef | null;
}

export interface FinanceSummary {
  from: string;
  to: string;
  income: number;
  expense: number;
  netProfit: number;
  margin: number;
  teacherSalary: number;
  marketing: number;
  otherExpense: number;
  studentPayments: number;
  otherIncome: number;
  totalBalance: number;
  totalDebt: number;
  incomeByCategory: Array<{ name: string; total: number; count: number }>;
  expenseByCategory: Array<{ name: string; total: number; count: number }>;
}

export interface CashFlowPoint {
  date: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  balance: number;
  /** Davr oxiridagi haqiqiy kassa qoldig‘i */
  cashBalance: number;
}

export interface CashFlowStatement {
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  netChange: number;
  operatingNet: number;
  /** Kassaga bog‘lanmagan yozuvlar — qoldiqqa ta’sir qilmaydi */
  unassigned: number;
  inflow: { studentPayments: number; otherIncome: number; transfers: number; other: number; total: number };
  outflow: { expenses: number; salaries: number; refunds: number; transfers: number; other: number; total: number };
  accounts: Array<{
    id: string;
    name: string;
    type: AccountType;
    isActive: boolean;
    opening: number;
    inflow: number;
    outflow: number;
    closing: number;
  }>;
  forecast: {
    days: number;
    currentBalance: number;
    upcomingExpenses: number;
    upcomingExpenseCount: number;
    unpaidSalaries: number;
    receivables: number;
    projectedBalance: number;
  };
}

export interface MoneyEntry {
  id: string;
  number: number;
  amount: number;
  method: PaymentMethod;
  date: string;
  description: string | null;
  attachmentPath: string | null;
  isVoided: boolean;
  voidReason: string | null;
  category: { id: string; key: string; name: string };
  account: { id: string; name: string } | null;
  responsible: PersonRef | null;
  student: { id: string; firstName: string; lastName: string } | null;
  /** To‘lanmagan xarajatda daftar yozuvi yo‘q */
  transactionId: string | null;
  status: ExpenseStatus;
  vendor: string | null;
  dueDate: string | null;
  approvedBy: PersonRef | null;
  approvedAt: string | null;
  rejectReason: string | null;
  recurring: { id: string; name: string } | null;
  /** Biriktirilgan cheklar soni */
  attachments: number;
  createdAt: string;
}

export interface MoneyStats {
  total: number;
  count: number;
  byCategory: Array<{ id: string; name: string; total: number; count: number }>;
}

export interface FinanceCategory {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  usage: number;
}

/** NONE — reja va xarajat yo‘q; UNPLANNED — rejasiz xarajat; OK < 90%; WARNING 90–100%; OVER > 100% */
export type BudgetLineStatus = 'NONE' | 'UNPLANNED' | 'OK' | 'WARNING' | 'OVER';

export interface BudgetLine {
  categoryId: string;
  categoryName: string;
  planned: number;
  actual: number;
  /** Tasdiq kutayotgan / to‘lanmagan xarajatlar */
  committed: number;
  /** actual − planned */
  difference: number;
  usage: number;
  remaining: number;
  status: BudgetLineStatus;
}

export interface Budget {
  year: number;
  month: number;
  note: string | null;
  totalPlanned: number;
  totalActual: number;
  totalCommitted: number;
  totalDifference: number;
  lines: BudgetLine[];
}

export interface FinanceRangeParams {
  from?: string;
  to?: string;
}

export interface CashFlowParams extends FinanceRangeParams {
  period: CashFlowPeriod;
}

export interface TransactionListParams extends FinanceRangeParams {
  page: number;
  limit: number;
  search?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  accountId?: string;
  entityType?: string;
  sortBy?: 'occurredAt' | 'amount' | 'number';
  sortOrder?: 'asc' | 'desc';
}

export interface MoneyListParams extends FinanceRangeParams {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  accountId?: string;
  method?: PaymentMethod;
  responsibleId?: string;
  status?: ExpenseStatus;
  sortBy?: 'date' | 'amount' | 'number';
  sortOrder?: 'asc' | 'desc';
}

export interface MoneyPayload {
  categoryId: string;
  amount: number;
  method: PaymentMethod;
  accountId?: string;
  date?: string;
  description?: string;
  studentId?: string;
  vendor?: string;
}

export interface TransferPayload {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredAt?: string;
  description?: string;
}

export interface BudgetPayload {
  year: number;
  month: number;
  note?: string;
  lines: Array<{ categoryId: string; plannedAmount: number }>;
}

export type FinancialPeriodStatus = 'OPEN' | 'CLOSED';

export interface FinancialPeriod {
  year: number;
  month: number;
  label: string;
  status: FinancialPeriodStatus;
  isCurrent: boolean;
  canClose: boolean;
  totals: { income: number; expense: number; refunds: number; net: number; transactions: number };
  closedAt: string | null;
  closedBy: { id: string; firstName: string; lastName: string } | null;
  reopenedAt: string | null;
  reopenedBy: { id: string; firstName: string; lastName: string } | null;
  reopenReason: string | null;
}

export interface ExpenseApprovalSettings {
  /** 0 — tasdiqlash o‘chirilgan */
  approvalThreshold: number;
  updatedAt: string | null;
}

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  method: PaymentMethod;
  vendor: string | null;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  note: string | null;
  category: { id: string; name: string };
  account: { id: string; name: string } | null;
  currentMonth: { expenseId: string; status: string; dueDate: string | null } | null;
  createdAt: string;
}

export interface RecurringExpensePayload {
  name: string;
  categoryId: string;
  amount: number;
  dayOfMonth: number;
  startDate: string;
  method?: PaymentMethod;
  accountId?: string;
  vendor?: string;
  endDate?: string;
  note?: string;
}
