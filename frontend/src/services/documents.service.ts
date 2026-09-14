import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { DocumentItem, DocumentOwner, StaffDocumentMeta, UpdateDocumentPayload } from '@/types/document';

const OWNER_PATHS: Record<DocumentOwner, { resource: string; suffix: string }> = {
  expense: { resource: 'expenses', suffix: 'attachments' },
  income: { resource: 'incomes', suffix: 'attachments' },
  teacher: { resource: 'teachers', suffix: 'documents' },
  employee: { resource: 'employees', suffix: 'documents' },
};

const ownerUrl = (owner: DocumentOwner, entityId: string) => `/${OWNER_PATHS[owner].resource}/${entityId}/${OWNER_PATHS[owner].suffix}`;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

export const documentsService = {
  async list(owner: DocumentOwner, entityId: string): Promise<DocumentItem[]> {
    const response = await api.get<ApiSuccessResponse<DocumentItem[]>>(ownerUrl(owner, entityId));
    return response.data.data;
  },

  /** Fayl so‘rov tanasida xom holda yuboriladi; nomi — X-File-Name sarlavhasida, xodim hujjati ma’lumoti — so‘rov satrida */
  async upload(owner: DocumentOwner, entityId: string, file: File, meta?: StaffDocumentMeta): Promise<MessageResult<DocumentItem>> {
    const response = await api.post<ApiSuccessResponse<DocumentItem>>(ownerUrl(owner, entityId), file, {
      params: meta
        ? { category: meta.category, ...(meta.title ? { title: meta.title } : {}), ...(meta.expiresAt ? { expiresAt: meta.expiresAt } : {}) }
        : undefined,
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: UpdateDocumentPayload): Promise<MessageResult<DocumentItem>> {
    const response = await api.patch<ApiSuccessResponse<DocumentItem>>(`/documents/${id}`, payload);
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
