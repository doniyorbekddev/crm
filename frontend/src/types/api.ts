export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors: ApiErrorDetail[];
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}
