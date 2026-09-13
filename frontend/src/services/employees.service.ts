import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { Employee, EmployeeCandidate, EmployeeListParams, EmployeePayload } from '@/types/employee';

export const employeesService = {
  async list(params: EmployeeListParams): Promise<Paginated<Employee>> {
    const response = await api.get<ApiSuccessResponse<Employee[]>>('/employees', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async candidates(): Promise<EmployeeCandidate[]> {
    const response = await api.get<ApiSuccessResponse<EmployeeCandidate[]>>('/employees/candidates');
    return response.data.data;
  },

  async create(payload: EmployeePayload): Promise<MessageResult<Employee>> {
    const response = await api.post<ApiSuccessResponse<Employee>>('/employees', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: Partial<EmployeePayload>): Promise<MessageResult<Employee>> {
    const response = await api.put<ApiSuccessResponse<Employee>>(`/employees/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },
};
