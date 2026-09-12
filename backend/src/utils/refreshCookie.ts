import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'crm_refresh';

/** Cookie faqat /api/auth/* so‘rovlariga yuboriladi — boshqa endpointlarga refresh token umuman bormaydi. */
const REFRESH_COOKIE_PATH = '/api/auth';

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseCookieOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value: unknown = (cookies as Record<string, unknown>)[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
