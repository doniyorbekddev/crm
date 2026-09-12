import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { Report, ReportParams, ReportType } from '@/types/report';

export const reportsService = {
  async build(type: ReportType, params: ReportParams): Promise<Report> {
    const response = await api.get<ApiSuccessResponse<Report>>(`/reports/${type}`, { params });
    return response.data.data;
  },

  /** CSV faylni brauzerga yuklab beradi (Excel’da ochiladi) */
  async exportCsv(type: ReportType, params: ReportParams): Promise<void> {
    const response = await api.get<Blob>(`/reports/${type}/export`, { params, responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="?([^";]+)"?/.exec(disposition);

    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? `${type}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
