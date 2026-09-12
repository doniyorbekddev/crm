import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'crm-backend';
const AUDIENCE = 'crm-app';

const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3_600, d: 86_400 } as const;

/** "15m" → 900 */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  const amount = match?.[1];
  const unit = match?.[2];
  if (!amount || !unit || !(unit in SECONDS_PER_UNIT)) {
    throw new Error(`Noto‘g‘ri davomiylik formati: ${value}`);
  }
  return Number(amount) * SECONDS_PER_UNIT[unit as keyof typeof SECONDS_PER_UNIT];
}

export const ACCESS_TOKEN_TTL_SECONDS = durationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
export const REFRESH_TOKEN_TTL_SECONDS = env.JWT_REFRESH_EXPIRES_IN_DAYS * SECONDS_PER_UNIT.d;

export interface AccessTokenPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  fam: string;
  exp: number;
}

export function signAccessToken(user: { id: string; roleKey: string }): string {
  return jwt.sign({ role: user.roleKey }, env.JWT_SECRET, {
    subject: user.id,
    // Har bir token noyob bo‘lishi uchun (bir soniya ichida berilgan tokenlar ham farqlanadi)
    jwtid: generateTokenId(),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    if (
      typeof decoded === 'string' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.iat !== 'number' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }
    return {
      sub: decoded.sub,
      role: typeof decoded.role === 'string' ? decoded.role : '',
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

export function signRefreshToken(input: { userId: string; tokenId: string; familyId: string }): string {
  return jwt.sign({ fam: input.familyId }, env.JWT_REFRESH_SECRET, {
    subject: input.userId,
    jwtid: input.tokenId,
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof decoded === 'string' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.jti !== 'string' ||
      typeof decoded.fam !== 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }
    return { sub: decoded.sub, jti: decoded.jti, fam: decoded.fam, exp: decoded.exp };
  } catch {
    return null;
  }
}

/** Bazada tokenning o‘zi emas, faqat SHA-256 hash saqlanadi. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Parolni tiklash kabi bir martalik havolalar uchun tasodifiy token. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateTokenId(): string {
  return randomUUID();
}
