export type DocumentOwner = 'expense' | 'income';

export interface DocumentItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}
