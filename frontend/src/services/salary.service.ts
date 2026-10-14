import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { KpiDefinition, KpiDefinitionPayload, KpiEvaluation, KpiOverview, PayeeKind, PayrollProfile } from '@/types/payroll';
import type {
  CalculateSalaryResult,
  PayrollAdjustmentPayload,
  SalaryAdjustPayload,
  SalaryFormLookups,
  SalaryPaymentPayload,
  SalaryPeriod,
  SalaryPeriodParams,
  SalarySummary,
} from '@/types/teacher';

export const salaryService = {
  async periods(params: SalaryPeriodParams): Promise<SalaryPeriod[]> {
    const response = await api.get<ApiSuccessResponse<SalaryPeriod[]>>('/salaries/periods', { params });
    return response.data.data;
  },

  async summary(params: Pick<SalaryPeriodParams, 'year' | 'month' | 'branchId'>): Promise<SalarySummary> {
    const response = await api.get<ApiSuccessResponse<SalarySummary>>('/salaries/summary', { params });
    return response.data.data;
  },

  async calculate(payload: { year: number; month: number; teacherProfileId?: string; employeeId?: string }): Promise<MessageResult<CalculateSalaryResult>> {
    const response = await api.post<ApiSuccessResponse<CalculateSalaryResult>>('/salaries/calculate', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async adjust(id: string, payload: SalaryAdjustPayload): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.patch<ApiSuccessResponse<SalaryPeriod>>(`/salaries/periods/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async approve(id: string): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.post<ApiSuccessResponse<SalaryPeriod>>(`/salaries/periods/${id}/approve`);
    return { data: response.data.data, message: response.data.message };
  },

  /** Tasdiqlashga yuborish (Hisoblangan → Ko'rib chiqilmoqda) */
  async submit(id: string): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.post<ApiSuccessResponse<SalaryPeriod>>(`/salaries/periods/${id}/submit`);
    return { data: response.data.data, message: response.data.message };
  },

  async submitMonth(payload: { year: number; month: number; branchId?: string }): Promise<MessageResult<{ submitted: number; skipped: number }>> {
    const response = await api.post<ApiSuccessResponse<{ submitted: number; skipped: number }>>('/salaries/submit', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async reject(id: string, reason: string): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.post<ApiSuccessResponse<SalaryPeriod>>(`/salaries/periods/${id}/reject`, { reason });
    return { data: response.data.data, message: response.data.message };
  },

  async profile(params: { type: PayeeKind; id: string; year: number; month: number }): Promise<PayrollProfile> {
    const response = await api.get<ApiSuccessResponse<PayrollProfile>>('/salaries/profile', { params });
    return response.data.data;
  },

  async kpi(): Promise<KpiOverview> {
    const response = await api.get<ApiSuccessResponse<KpiOverview>>('/salaries/kpi');
    return response.data.data;
  },

  async createKpi(payload: KpiDefinitionPayload): Promise<MessageResult<KpiDefinition>> {
    const response = await api.post<ApiSuccessResponse<KpiDefinition>>('/salaries/kpi', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async updateKpi(id: string, payload: Partial<KpiDefinitionPayload>): Promise<MessageResult<KpiDefinition>> {
    const response = await api.put<ApiSuccessResponse<KpiDefinition>>(`/salaries/kpi/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async updateKpiSettings(threshold: number): Promise<MessageResult<{ threshold: number }>> {
    const response = await api.put<ApiSuccessResponse<{ threshold: number }>>('/salaries/kpi/settings', { threshold });
    return { data: response.data.data, message: response.data.message };
  },

  async setKpiPool(employeeId: string, kpiBonusPool: number): Promise<MessageResult<{ employeeId: string; kpiBonusPool: number }>> {
    const response = await api.put<ApiSuccessResponse<{ employeeId: string; kpiBonusPool: number }>>(`/salaries/kpi/pool/${employeeId}`, { kpiBonusPool });
    return { data: response.data.data, message: response.data.message };
  },

  async saveKpiResult(payload: { kpiId: string; employeeId: string; year: number; month: number; actual: number; reason: string }): Promise<MessageResult<KpiEvaluation>> {
    const response = await api.post<ApiSuccessResponse<KpiEvaluation>>('/salaries/kpi/results', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async pay(id: string, payload: SalaryPaymentPayload): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.post<ApiSuccessResponse<SalaryPeriod>>(`/salaries/periods/${id}/payments`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async addAdjustment(payload: PayrollAdjustmentPayload): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.post<ApiSuccessResponse<SalaryPeriod>>('/salaries/adjustments', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async voidAdjustment(id: string, reason: string): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.post<ApiSuccessResponse<SalaryPeriod>>(`/salaries/adjustments/${id}/void`, { reason });
    return { data: response.data.data, message: response.data.message };
  },

  async unlock(id: string, reason: string): Promise<MessageResult<SalaryPeriod>> {
    const response = await api.post<ApiSuccessResponse<SalaryPeriod>>(`/salaries/periods/${id}/unlock`, { reason });
    return { data: response.data.data, message: response.data.message };
  },

  async formLookups(): Promise<SalaryFormLookups> {
    const response = await api.get<ApiSuccessResponse<SalaryFormLookups>>('/lookups/salary-form');
    return response.data.data;
  },
};
