export type DocumentOwner = 'expense' | 'income' | 'teacher' | 'employee';

/** Chek (RECEIPT) — faqat xarajat va tushumga avtomatik beriladi */
export type DocumentCategory = 'CONTRACT' | 'PASSPORT' | 'CERTIFICATE' | 'RECEIPT' | 'OTHER';
export type StaffDocumentCategory = Exclude<DocumentCategory, 'RECEIPT'>;

export interface DocumentItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: DocumentCategory;
  title: string | null;
  /** YYYY-MM-DD */
  expiresAt: string | null;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface StaffDocumentMeta {
  category: StaffDocumentCategory;
  title?: string;
  expiresAt?: string;
}

export interface UpdateDocumentPayload {
  category?: StaffDocumentCategory;
  /** Bo‘sh satr — tozalash */
  title?: string;
  expiresAt?: string;
}
