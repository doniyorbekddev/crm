import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { ConflictCheckPayload, Room, RoomPayload, ScheduleConflict } from '@/types/room';

export const roomsService = {
  async list(includeInactive = false): Promise<Room[]> {
    const response = await api.get<ApiSuccessResponse<Room[]>>('/rooms', {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    });
    return response.data.data;
  },

  async create(payload: RoomPayload): Promise<MessageResult<Room>> {
    const response = await api.post<ApiSuccessResponse<Room>>('/rooms', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: RoomPayload): Promise<MessageResult<Room>> {
    const response = await api.put<ApiSuccessResponse<Room>>(`/rooms/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  /** Saqlashdan oldin jadvalni tekshirish */
  async checkConflicts(payload: ConflictCheckPayload): Promise<ScheduleConflict[]> {
    const response = await api.post<ApiSuccessResponse<{ conflicts: ScheduleConflict[] }>>('/rooms/conflicts', payload);
    return response.data.data.conflicts;
  },
};
