import type { Request } from 'express';
import type { AuthUser } from '../types/auth.js';
import { AppError } from './AppError.js';

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

/** Audit log va sessiyalar uchun mijoz ma'lumotlari (IP `trust proxy` sozlamasiga qarab aniqlanadi). */
export function getClientInfo(req: Request): ClientInfo {
  const userAgent = req.get('user-agent');
  return {
    ip: req.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
  };
}

/** `authenticate` middleware’dan keyingi handlerlarda joriy foydalanuvchini oladi. */
export function requireAuthUser(req: Request): AuthUser {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user;
}
