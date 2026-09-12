import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { AttendanceSheet, MarkAttendancePayload } from '@/types/attendance';
import type {
  AttendanceCalendar,
  AttendanceRankingParams,
  AttendanceRankingRow,
  AttendanceSessionItem,
  AttendanceStats,
  AttendanceStatsParams,
  SessionListParams,
  SessionPayload,
  TeacherOverview,
} from '@/types/attendanceAnalytics';

export const attendanceService = {
  async sheet(groupId: string, date: string): Promise<AttendanceSheet> {
    const response = await api.get<ApiSuccessResponse<AttendanceSheet>>(`/groups/${groupId}/attendance`, { params: { date } });
    return response.data.data;
  },

  async mark(groupId: string, payload: MarkAttendancePayload): Promise<MessageResult<AttendanceSheet>> {
    const response = await api.post<ApiSuccessResponse<AttendanceSheet>>(`/groups/${groupId}/attendance`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async stats(params: AttendanceStatsParams): Promise<AttendanceStats> {
    const response = await api.get<ApiSuccessResponse<AttendanceStats>>('/attendance/stats', { params });
    return response.data.data;
  },

  async ranking(params: AttendanceRankingParams): Promise<AttendanceRankingRow[]> {
    const response = await api.get<ApiSuccessResponse<AttendanceRankingRow[]>>('/attendance/ranking', { params });
    return response.data.data;
  },

  async teacherOverview(): Promise<TeacherOverview> {
    const response = await api.get<ApiSuccessResponse<TeacherOverview>>('/attendance/teacher-overview');
    return response.data.data;
  },

  async calendar(studentId: string, year: number, month: number): Promise<AttendanceCalendar> {
    const response = await api.get<ApiSuccessResponse<AttendanceCalendar>>(`/students/${studentId}/attendance/calendar`, {
      params: { year, month },
    });
    return response.data.data;
  },
};

export const attendanceSessionsService = {
  async list(params: SessionListParams): Promise<AttendanceSessionItem[]> {
    const response = await api.get<ApiSuccessResponse<AttendanceSessionItem[]>>('/attendance-sessions', { params });
    return response.data.data;
  },

  async save(payload: SessionPayload): Promise<MessageResult<AttendanceSessionItem>> {
    const response = await api.post<ApiSuccessResponse<AttendanceSessionItem>>('/attendance-sessions', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: Partial<SessionPayload>): Promise<MessageResult<AttendanceSessionItem>> {
    const response = await api.put<ApiSuccessResponse<AttendanceSessionItem>>(`/attendance-sessions/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/attendance-sessions/${id}`);
    return response.data.message;
  },
};
