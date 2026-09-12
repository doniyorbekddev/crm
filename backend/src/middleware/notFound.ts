import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`So‘ralgan manzil topilmadi: ${req.method} ${req.originalUrl}`));
};
