import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import type { ErrorDetail } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';
import { mapPrismaError } from '../utils/prismaErrors.js';

interface HttpLikeError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return error instanceof Error && ('status' in error || 'statusCode' in error);
}

function zodIssuesToDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => {
    const field = issue.path.map(String).join('.');
    return field.length > 0 ? { field, message: issue.message } : { message: issue.message };
  });
}

function httpErrorMessage(error: HttpLikeError): string {
  switch (error.type) {
    case 'entity.parse.failed':
      return 'So‘rov tanasi (JSON) noto‘g‘ri formatda';
    case 'entity.too.large':
      return 'So‘rov hajmi juda katta';
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return 'So‘rov kodirovkasi qo‘llab-quvvatlanmaydi';
    default:
      return 'So‘rovni qayta ishlab bo‘lmadi';
  }
}

/**
 * Markaziy xatolik ushlagich. Foydalanuvchiga tushunarli xabar qaytaradi,
 * texnik tafsilotlarni (stack trace) esa faqat logga yozadi.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      req.log.error({ err: error }, error.message);
    }
    sendError(res, error.statusCode, error.message, error.errors);
    return;
  }

  if (error instanceof ZodError) {
    sendError(res, 422, 'Kiritilgan ma’lumotlar noto‘g‘ri', zodIssuesToDetails(error));
    return;
  }

  const prismaError = mapPrismaError(error);
  if (prismaError) {
    req.log.warn({ err: error }, 'Prisma so‘rov xatoligi');
    sendError(res, prismaError.statusCode, prismaError.message, prismaError.errors);
    return;
  }

  if (isHttpLikeError(error)) {
    const status = error.status ?? error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      sendError(res, status, httpErrorMessage(error));
      return;
    }
  }

  req.log.error({ err: error }, 'Kutilmagan server xatoligi');
  sendError(res, 500, 'Serverda kutilmagan xatolik yuz berdi. Birozdan keyin qayta urinib ko‘ring.');
};
