export interface AuditLogItem {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityLabel: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  /** Amalga oid qo‘shimcha ma’lumot ("oldin/keyin", sabab, summa va h.k.) */
  metadata: unknown;
  isCritical: boolean;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface AuditListParams {
  page: number;
  limit: number;
  search?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  criticalOnly?: 'true' | 'false';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditFilters {
  actions: Array<{ value: string; label: string; count: number }>;
  entityTypes: Array<{ value: string; label: string; count: number }>;
  users: Array<{ id: string; firstName: string; lastName: string; count: number }>;
}
