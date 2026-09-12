import type { Response } from 'supertest';
import { REFRESH_COOKIE_NAME } from '../../src/utils/refreshCookie.js';

export function getSetCookies(response: Response): string[] {
  const header: unknown = response.headers['set-cookie'];
  if (Array.isArray(header)) return header.filter((item): item is string => typeof item === 'string');
  return typeof header === 'string' ? [header] : [];
}

export function getRefreshSetCookie(response: Response): string | undefined {
  return getSetCookies(response).find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
}

/** Set-Cookie dan refresh token qiymatini oladi (bo‘sh — cookie tozalangan). */
export function getRefreshToken(response: Response): string | undefined {
  const cookie = getRefreshSetCookie(response);
  const value = cookie?.split(';')[0]?.slice(REFRESH_COOKIE_NAME.length + 1);
  return value && value.length > 0 ? value : undefined;
}

export function refreshCookieHeader(token: string): string {
  return `${REFRESH_COOKIE_NAME}=${token}`;
}
