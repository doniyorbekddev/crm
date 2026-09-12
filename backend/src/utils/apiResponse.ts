import type { Response } from 'express';
import type { ErrorDetail } from './AppError.js';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  message: string;
  errors: ErrorDetail[];
}

interface SendSuccessOptions {
  message?: string;
  statusCode?: number;
  meta?: PaginationMeta;
}

export function sendSuccess<T>(res: Response, data: T, options: SendSuccessOptions = {}): void {
  const body: SuccessResponse<T> = {
    success: true,
    data,
    message: options.message ?? '',
  };
  if (options.meta) {
    body.meta = options.meta;
  }
  res.status(options.statusCode ?? 200).json(body);
}

export function sendCreated<T>(res: Response, data: T, message = 'Muvaffaqiyatli yaratildi'): void {
  sendSuccess(res, data, { statusCode: 201, message });
}

export function sendError(res: Response, statusCode: number, message: string, errors: ErrorDetail[] = []): void {
  const body: ErrorResponse = { success: false, message, errors };
  res.status(statusCode).json(body);
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
