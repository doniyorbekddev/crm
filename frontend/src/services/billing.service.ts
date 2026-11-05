import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  BillingPage,
  BillingReport,
  BillingReportParams,
  MonthlyDebtor,
  MonthlyDebtorsParams,
  MonthlyDebtorsSummary,
  OutstandingDebt,
  OutstandingParams,
  OutstandingSummary,
  StudentBillingHistory,
} from '@/types/billing';

type PageBody<Item, Summary> = ApiSuccessResponse<{ items: Item[]; summary: Summary }>;

function toPage<Item, Summary>(body: PageBody<Item, Summary>, params: { page: number; limit: number }): BillingPage<Item, Summary> {
  return {
    items: body.data.items,
    summary: body.data.summary,
    meta: body.meta ?? { page: params.page, limit: params.limit, total: body.data.items.length, totalPages: 1 },
  };
}

/** Oy majburiyatlari bo'yicha qarzdorlik va oylik hisobot */
export const billingService = {
  /** A. Tanlangan oy qarzdorlari (hozir va oy oxiridagi holat) */
  async monthly(params: MonthlyDebtorsParams): Promise<BillingPage<MonthlyDebtor, MonthlyDebtorsSummary>> {
    const response = await api.get<PageBody<MonthlyDebtor, MonthlyDebtorsSummary>>('/debts/monthly', { params });
    return toPage(response.data, params);
  },

  /** B. Barcha oylardan qolgan, muddati kelgan qarzlar */
  async outstanding(params: OutstandingParams): Promise<BillingPage<OutstandingDebt, OutstandingSummary>> {
    const response = await api.get<PageBody<OutstandingDebt, OutstandingSummary>>('/debts/outstanding', { params });
    return toPage(response.data, params);
  },

  /** C. O'quvchi qarz tarixi */
  async history(studentId: string): Promise<StudentBillingHistory> {
    const response = await api.get<ApiSuccessResponse<StudentBillingHistory>>(`/students/${studentId}/billing-history`);
    return response.data.data;
  },

  async report(params: BillingReportParams): Promise<BillingReport> {
    const response = await api.get<ApiSuccessResponse<BillingReport>>('/finance/billing-report', { params });
    return response.data.data;
  },
};
