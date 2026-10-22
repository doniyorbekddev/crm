import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * TOTP (RFC 6238): 30 soniyalik qadam, 6 raqam, HMAC-SHA1 — Google Authenticator, Microsoft Authenticator,
 * 1Password va boshqalar bilan mos. Soat farqi uchun ±1 qadam qabul qilinadi.
 *
 * Sir bazada AES-256-GCM bilan shifrlangan. Kalit — TOTP_ENCRYPTION_KEY; berilmasa JWT_SECRET dan HKDF orqali
 * (JWT_SECRET almashtirilsa 2FA sirlari o'qilmay qoladi — foydalanuvchi tiklash kodi bilan kirib qayta yoqadi).
 */

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Base32 emas');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160 bitli tasodifiy sir (base32) */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(binary).padStart(DIGITS, '0');
}

/**
 * Kod to'g'ri bo'lsa — mos qadam, aks holda null. `lastStep` dan katta bo'lmagan qadam rad etiladi
 * (bir kodni qayta ishlatish — masalan, ko'rib qolingan kod — o'tmaydi).
 */
export function verifyTotp(secret: string, code: string, now: Date = new Date(), lastStep: number | null = null): number | null {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = totpStep(now);
  for (let delta = -WINDOW; delta <= WINDOW; delta += 1) {
    const step = current + delta;
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(normalized))) return step;
  }
  return null;
}

export function otpauthUrl(input: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({ secret: input.secret, issuer: input.issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function encryptionKey(): Buffer {
  if (env.TOTP_ENCRYPTION_KEY) return createHash('sha256').update(env.TOTP_ENCRYPTION_KEY).digest();
  return Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'crm-totp', 'totp-secret-v1', 32));
}

/** "v1:<iv>:<tag>:<shifr>" (base64url) */
export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}

/** Shifr ochilmasa (kalit almashgan, buzilgan) — null */
export function decryptTotpSecret(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Tiklash kodi: "ABCD-EFGH" (chalkash belgilarsiz) */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateRecoveryCode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(`crm-recovery:${normalizeRecoveryCode(code)}`).digest('hex');
}
