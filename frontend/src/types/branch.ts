export interface Branch {
  id: string;
  key: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  /** Asosiy filial — uni o‘chirib bo‘lmaydi */
  isMain: boolean;
  counts: { users: number; students: number; groups: number };
}

export interface BranchPayload {
  key: string;
  name: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  sortOrder: number;
}
