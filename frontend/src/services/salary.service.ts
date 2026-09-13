import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
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

  async summary(params: Pick<SalaryPeriodParams, 'year' | 'month'>): Promise<SalarySummary> {
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
