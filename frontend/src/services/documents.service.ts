import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { DocumentItem, DocumentOwner } from '@/types/document';

const ownerPath = (owner: DocumentOwner) => (owner === 'expense' ? 'expenses' : 'incomes');

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

export const documentsService = {
  async list(owner: DocumentOwner, entityId: string): Promise<DocumentItem[]> {
    const response = await api.get<ApiSuccessResponse<DocumentItem[]>>(`/${ownerPath(owner)}/${entityId}/attachments`);
    return response.data.data;
  },

  /** Fayl so‘rov tanasida xom holda yuboriladi; nomi — X-File-Name sarlavhasida */
  async upload(owner: DocumentOwner, entityId: string, file: File): Promise<MessageResult<DocumentItem>> {
    const response = await api.post<ApiSuccessResponse<DocumentItem>>(`/${ownerPath(owner)}/${entityId}/attachments`, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<MessageResult<{ id: string }>> {
    const response = await api.delete<ApiSuccessResponse<{ id: string }>>(`/documents/${id}`);
    return { data: response.data.data, message: response.data.message };
  },

  async download(document: DocumentItem): Promise<void> {
    await downloadFile(`/documents/${document.id}/download`, {}, document.originalName);
  },
};
