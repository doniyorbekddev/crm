import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { ExportFormat } from '@/lib/download';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  CorrectionInput,
  DayDetail,
  Holiday,
  PermissionRequest,
  PermissionRequestInput,
  QrIssue,
  RequestStatus,
  ScanPreview,
  ScanResult,
  ScheduleException,
  ScheduleInput,
  ScheduleRow,
  StaffAction,
  StaffDay,
  StaffOverview,
  StaffReport,
  StaffSummary,
  StaffToday,
} from '@/types/staffAttendance';

const BASE = '/staff-attendance';

/** Xodim davomati (QR). Xodim kimligi serverda sessiyadan olinadi — bu yerdan ID yuborilmaydi. */
export const staffAttendanceService = {
  async issueQr(): Promise<QrIssue> {
    return (await api.post<ApiSuccessResponse<QrIssue>>(`${BASE}/qr`)).data.data;
  },

  async qrStatus(id: string): Promise<{ used: boolean; expired: boolean }> {
    return (await api.get<ApiSuccessResponse<{ used: boolean; expired: boolean }>>(`${BASE}/qr/${id}`)).data.data;
  },

  async today(): Promise<StaffToday> {
    return (await api.get<ApiSuccessResponse<StaffToday>>(`${BASE}/me/today`)).data.data;
  },

  async myMonth(year: number, month: number): Promise<{ days: StaffDay[]; summary: StaffSummary }> {
    return (await api.get<ApiSuccessResponse<{ days: StaffDay[]; summary: StaffSummary }>>(`${BASE}/me/month`, { params: { year, month } })).data.data;
  },

  async preview(token: string): Promise<ScanPreview> {
    return (await api.post<ApiSuccessResponse<ScanPreview>>(`${BASE}/scan/preview`, { token })).data.data;
  },

  async scan(token: string, action: StaffAction): Promise<ScanResult> {
    return (await api.post<ApiSuccessResponse<ScanResult>>(`${BASE}/scan`, { token, action })).data.data;
  },

  async myRequests(): Promise<PermissionRequest[]> {
    return (await api.get<ApiSuccessResponse<PermissionRequest[]>>(`${BASE}/me/requests`)).data.data;
  },

  async createRequest(input: PermissionRequestInput): Promise<ApiSuccessResponse<PermissionRequest>> {
    return (await api.post<ApiSuccessResponse<PermissionRequest>>(`${BASE}/me/requests`, input)).data;
  },

  async cancelRequest(id: string): Promise<ApiSuccessResponse<PermissionRequest>> {
    return (await api.post<ApiSuccessResponse<PermissionRequest>>(`${BASE}/me/requests/${id}/cancel`)).data;
  },

  // Rahbar
  async overview(date?: string): Promise<StaffOverview> {
    return (await api.get<ApiSuccessResponse<StaffOverview>>(`${BASE}/overview`, { params: date ? { date } : {} })).data.data;
  },

  async dayDetail(userId: string, date: string): Promise<DayDetail> {
    return (await api.get<ApiSuccessResponse<DayDetail>>(`${BASE}/users/${userId}/days/${date}`)).data.data;
  },

  async correct(userId: string, date: string, input: CorrectionInput): Promise<ApiSuccessResponse<DayDetail>> {
    return (await api.post<ApiSuccessResponse<DayDetail>>(`${BASE}/users/${userId}/days/${date}/corrections`, input)).data;
  },

  async report(from: string, to: string): Promise<StaffReport> {
    return (await api.get<ApiSuccessResponse<StaffReport>>(`${BASE}/report`, { params: { from, to } })).data.data;
  },

  exportReport(from: string, to: string, format: ExportFormat): Promise<void> {
    return downloadFile(`${BASE}/report/export`, { from, to, format }, `xodimlar-davomati-${from}_${to}.${format}`);
  },

  async requests(status?: RequestStatus): Promise<PermissionRequest[]> {
    return (await api.get<ApiSuccessResponse<PermissionRequest[]>>(`${BASE}/requests`, { params: status ? { status } : {} })).data.data;
  },

  async decideRequest(id: string, status: 'APPROVED' | 'REJECTED', note?: string): Promise<ApiSuccessResponse<PermissionRequest>> {
    return (await api.post<ApiSuccessResponse<PermissionRequest>>(`${BASE}/requests/${id}/decide`, { status, ...(note ? { note } : {}) })).data;
  },

  async grantRequest(userId: string, input: PermissionRequestInput): Promise<ApiSuccessResponse<PermissionRequest>> {
    return (await api.post<ApiSuccessResponse<PermissionRequest>>(`${BASE}/users/${userId}/requests`, input)).data;
  },

  async schedules(): Promise<ScheduleRow[]> {
    return (await api.get<ApiSuccessResponse<ScheduleRow[]>>(`${BASE}/schedules`)).data.data;
  },

  async saveSchedule(userId: string, input: ScheduleInput): Promise<ApiSuccessResponse<{ id: string; effectiveFrom: string }>> {
    return (await api.put<ApiSuccessResponse<{ id: string; effectiveFrom: string }>>(`${BASE}/schedules/${userId}`, input)).data;
  },

  async exceptions(from: string, to: string): Promise<ScheduleException[]> {
    return (await api.get<ApiSuccessResponse<ScheduleException[]>>(`${BASE}/exceptions`, { params: { from, to } })).data.data;
  },

  async saveException(
    userId: string,
    input: { date: string; type: 'DAY_OFF' | 'CUSTOM_HOURS'; startTime?: string; endTime?: string; reason: string },
  ): Promise<ApiSuccessResponse<{ id: string }>> {
    return (await api.put<ApiSuccessResponse<{ id: string }>>(`${BASE}/schedules/${userId}/exceptions`, input)).data;
  },

  async removeException(id: string): Promise<ApiSuccessResponse<null>> {
    return (await api.delete<ApiSuccessResponse<null>>(`${BASE}/exceptions/${id}`)).data;
  },

  async holidays(year: number): Promise<Holiday[]> {
    return (await api.get<ApiSuccessResponse<Holiday[]>>(`${BASE}/holidays`, { params: { year } })).data.data;
  },

  async addHoliday(input: { date: string; name: string }): Promise<ApiSuccessResponse<Holiday>> {
    return (await api.post<ApiSuccessResponse<Holiday>>(`${BASE}/holidays`, input)).data;
  },

  async removeHoliday(id: string): Promise<ApiSuccessResponse<null>> {
    return (await api.delete<ApiSuccessResponse<null>>(`${BASE}/holidays/${id}`)).data;
  },
};
