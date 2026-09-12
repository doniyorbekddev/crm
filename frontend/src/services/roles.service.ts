import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { CreateRolePayload, Permission, Role, UpdateRolePayload } from '@/types/role';

export const rolesService = {
  async list(): Promise<Role[]> {
    const response = await api.get<ApiSuccessResponse<Role[]>>('/roles');
    return response.data.data;
  },

  async permissions(): Promise<Permission[]> {
    const response = await api.get<ApiSuccessResponse<Permission[]>>('/permissions');
    return response.data.data;
  },

  async create(payload: CreateRolePayload): Promise<MessageResult<Role>> {
    const response = await api.post<ApiSuccessResponse<Role>>('/roles', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: UpdateRolePayload): Promise<MessageResult<Role>> {
    const response = await api.put<ApiSuccessResponse<Role>>(`/roles/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async setPermissions(id: string, permissionKeys: string[]): Promise<Role> {
    const response = await api.put<ApiSuccessResponse<Role>>(`/roles/${id}/permissions`, { permissionKeys });
    return response.data.data;
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/roles/${id}`);
    return response.data.message;
  },
};
