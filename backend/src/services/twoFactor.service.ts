import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { verifyPassword } from '../utils/password.js';
import type { ClientInfo } from '../utils/requestContext.js';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCode,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from '../utils/totp.js';
import { academySettingsService } from './academySettings.service.js';
import { auditService } from './audit.service.js';

/**
 * Ikki bosqichli kirish (TOTP) — ixtiyoriy, har xodim o'zi yoqadi (rahbar va adminlarga tavsiya etiladi).
 *
 * Yoqish: parol → sir (QR) → ilovadagi kod bilan tasdiqlash → 10 ta bir martalik tiklash kodi (faqat bir marta ko'rsatiladi).
 * Kirish: parol to'g'ri bo'lsa sessiya o'rniga 5 daqiqalik tasdiqlash tokeni, so'ng 6 xonali kod yoki tiklash kodi.
 * Telefon ham, tiklash kodlari ham yo'qolsa — boshqa admin "2FA ni o'chirish" orqali tiklaydi (users.manage).
 */

const RECOVERY_CODE_COUNT = 10;
const INVALID_CODE = 'Kod noto‘g‘ri yoki muddati o‘tgan';

export interface TwoFactorStatusDto {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}

type SecondFactorUser = { id: string; totpSecret: string | null; totpLastStep: number | null };

/**
 * Kod tekshiruvi: 6 raqam — TOTP (qayta ishlatish taqiqlangan, qadam atomar yoziladi), aks holda tiklash kodi
 * (bir martalik, atomar belgilanadi). Natija — qaysi usul o'tdi yoki null.
 */
export async function verifySecondFactor(user: SecondFactorUser, code: string, now: Date = new Date()): Promise<'totp' | 'recovery' | null> {
  const trimmed = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(trimmed)) {
    const secret = user.totpSecret ? decryptTotpSecret(user.totpSecret) : null;
    if (!secret) return null;
    const step = verifyTotp(secret, trimmed, now, user.totpLastStep);
    if (step === null) return null;
    // Parallel ikki so'rov bir kodni ishlata olmasin
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return claimed.count === 1 ? 'totp' : null;
  }
  const used = await prisma.userRecoveryCode.updateMany({
    where: { userId: user.id, codeHash: hashRecoveryCode(trimmed), usedAt: null },
    data: { usedAt: now },
  });
  return used.count === 1 ? 'recovery' : null;
}

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, totpSecret: true, totpPendingSecret: true, totpEnabledAt: true, totpLastStep: true },
  });
  if (!user) throw AppError.unauthorized();
  return user;
}

async function assertPassword(passwordHash: string, password: string): Promise<void> {
  if (!(await verifyPassword(password, passwordHash))) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'password', message: 'Parol noto‘g‘ri' }]);
  }
}

function newRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  return { plain, hashes: plain.map(hashRecoveryCode) };
}

export const twoFactorService = {
  async status(userId: string): Promise<TwoFactorStatusDto> {
    const [user, left] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } }),
      prisma.userRecoveryCode.count({ where: { userId, usedAt: null } }),
    ]);
    return { enabled: Boolean(user?.totpEnabledAt), enabledAt: user?.totpEnabledAt?.toISOString() ?? null, recoveryCodesLeft: user?.totpEnabledAt ? left : 0 };
  },

  /** 1-qadam: parol bilan tasdiqlab yangi sir olinadi (hali yoqilmaydi) */
  async setup(userId: string, input: { password: string }, client: ClientInfo): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await loadUser(userId);
    await assertPassword(user.passwordHash, input.password);
    if (user.totpEnabledAt) throw AppError.conflict('Ikki bosqichli kirish allaqachon yoqilgan');
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: userId }, data: { totpPendingSecret: encryptTotpSecret(secret) } });
    await auditService.record({ userId, action: 'auth.2fa_setup_started', entityType: 'user', entityId: userId, ...client });
    const { name } = await academySettingsService.branding();
    return { secret, otpauthUrl: otpauthUrl({ issuer: name || 'CRM', account: user.email, secret }) };
  },

  /** 2-qadam: ilovadagi kod bilan tasdiqlash → yoqiladi, tiklash kodlari bir marta qaytariladi */
  async enable(userId: string, input: { code: string }, client: ClientInfo): Promise<{ recoveryCodes: string[] }> {
    const user = await loadUser(userId);
    if (user.totpEnabledAt) throw AppError.conflict('Ikki bosqichli kirish allaqachon yoqilgan');
    const secret = user.totpPendingSecret ? decryptTotpSecret(user.totpPendingSecret) : null;
    if (!secret) throw AppError.unprocessable('Avval sozlashni boshlang (QR kod)');
    const step = verifyTotp(secret, input.code);
    if (step === null) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'code', message: INVALID_CODE }]);

    const codes = newRecoveryCodes();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabledAt: new Date(), totpLastStep: step },
      });
      await tx.userRecoveryCode.deleteMany({ where: { userId } });
      await tx.userRecoveryCode.createMany({ data: codes.hashes.map((codeHash) => ({ userId, codeHash })) });
      await auditService.recordInTransaction(tx, { userId, action: 'auth.2fa_enabled', entityType: 'user', entityId: userId, ...client });
    });
    return { recoveryCodes: codes.plain };
  },

  /** O'chirish: parol + amaldagi kod (yoki tiklash kodi) */
  async disable(userId: string, input: { password: string; code: string }, client: ClientInfo): Promise<void> {
    const user = await loadUser(userId);
    await assertPassword(user.passwordHash, input.password);
    if (!user.totpEnabledAt) return;
    if (!(await verifySecondFactor(user, input.code))) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'code', message: INVALID_CODE }]);
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null } });
      await tx.userRecoveryCode.deleteMany({ where: { userId } });
      await auditService.recordInTransaction(tx, { userId, action: 'auth.2fa_disabled', entityType: 'user', entityId: userId, ...client });
    });
  },

  /** Yangi tiklash kodlari (eskilari bekor) — parol + amaldagi kod bilan */
  async regenerateRecoveryCodes(userId: string, input: { password: string; code: string }, client: ClientInfo): Promise<{ recoveryCodes: string[] }> {
    const user = await loadUser(userId);
    await assertPassword(user.passwordHash, input.password);
    if (!user.totpEnabledAt) throw AppError.unprocessable('Ikki bosqichli kirish yoqilmagan');
    if (!(await verifySecondFactor(user, input.code))) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'code', message: INVALID_CODE }]);
    }
    const codes = newRecoveryCodes();
    await prisma.$transaction(async (tx) => {
      await tx.userRecoveryCode.deleteMany({ where: { userId } });
      await tx.userRecoveryCode.createMany({ data: codes.hashes.map((codeHash) => ({ userId, codeHash })) });
      await auditService.recordInTransaction(tx, { userId, action: 'auth.2fa_recovery_regenerated', entityType: 'user', entityId: userId, ...client });
    });
    return { recoveryCodes: codes.plain };
  },
};
