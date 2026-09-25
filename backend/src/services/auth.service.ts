import { prisma } from '../config/database.js';
import { resolveLoginIdentifier } from './portalAccount.service.js';
import { env, primaryClientUrl } from '../config/env.js';
import { PERMISSIONS, ROLE_KEYS } from '../config/permissions.js';
import type { Prisma, UserStatus } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { hashPassword, simulatePasswordCheck, verifyPassword } from '../utils/password.js';
import type { ClientInfo } from '../utils/requestContext.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  generateOpaqueToken,
  generateTokenId,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '../validators/auth.validator.js';
import { auditService } from './audit.service.js';
import { emailService } from './email.service.js';

const INVALID_CREDENTIALS = 'Email yoki parol noto‘g‘ri';
const SESSION_EXPIRED = 'Sessiya muddati tugagan. Qaytadan kiring';
const INVALID_RESET_LINK = 'Havola yaroqsiz yoki muddati o‘tgan. Parolni tiklashni qaytadan so‘rang';

/**
 * Ikki tab bir vaqtda tokenni yangilasa, ikkinchisi eski tokenni yuboradi. Shu oraliqda
 * eski tokenni qayta ishlatish o‘g‘irlik deb hisoblanmaydi (sessiyalar bekor qilinmaydi).
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

/** Ro‘yxatdan o‘tganlar eng kam huquqli rol bilan yaratiladi; admin tasdiqlashda rolni o‘zgartiradi. */
const DEFAULT_REGISTER_ROLE = ROLE_KEYS.CALL_CENTER;

type DbClient = Prisma.TransactionClient | typeof prisma;

const authUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  deletedAt: true,
  mustChangePassword: true,
  role: {
    select: {
      id: true,
      key: true,
      name: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  },
} satisfies Prisma.UserSelect;

type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export interface AuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; key: string; name: string };
  permissions: string[];
  /** Vaqtinchalik parol bilan kirilgan — avval parolni almashtirishi kerak */
  mustChangePassword: boolean;
}

export interface AuthSession {
  accessToken: string;
  /** Access token amal qilish muddati (soniya) */
  expiresIn: number;
  user: AuthUserDto;
}

export interface SessionResult {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RegisterResult {
  id: string;
  email: string;
  status: UserStatus;
}

function toAuthUserDto(user: AuthUserRecord): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    role: { id: user.role.id, key: user.role.key, name: user.role.name },
    permissions: user.role.permissions.map((item) => item.permission.key).sort(),
    mustChangePassword: user.mustChangePassword,
  };
}

function buildSession(user: AuthUserRecord): AuthSession {
  return {
    accessToken: signAccessToken({ id: user.id, roleKey: user.role.key }),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: toAuthUserDto(user),
  };
}

/** Parol to‘g‘ri bo‘lgandan keyingina chaqiriladi — hisob holati begona odamga oshkor bo‘lmasligi uchun. */
function assertCanSignIn(user: { status: UserStatus; deletedAt: Date | null }): void {
  if (user.deletedAt) {
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }
  if (user.status === 'PENDING') {
    throw AppError.forbidden('Hisobingiz hali administrator tomonidan tasdiqlanmagan');
  }
  if (user.status === 'BLOCKED') {
    throw AppError.forbidden('Hisobingiz bloklangan. Administrator bilan bog‘laning');
  }
}

async function issueRefreshToken(
  db: DbClient,
  userId: string,
  familyId: string,
  client: ClientInfo,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const id = generateTokenId();
  const token = signRefreshToken({ userId, tokenId: id, familyId });
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await db.refreshToken.create({
    data: { id, userId, familyId, tokenHash: hashToken(token), expiresAt, ip: client.ip, userAgent: client.userAgent },
  });
  return { id, token, expiresAt };
}

async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Hisob darajasidagi blok: bitta hisobga turli IP’lardan parol tanlashga qarshi (IP limitidan tashqari) */
const LOGIN_LOCK_THRESHOLD = 8;
const LOGIN_LOCK_WINDOW_MS = 15 * 60_000;

async function assertLoginNotLocked(
  failures: Prisma.AuditLogWhereInput,
  since: Date,
  audit: { userId?: string; entityId?: string; email?: string },
  client: ClientInfo,
): Promise<void> {
  const count = await prisma.auditLog.count({ where: { action: 'auth.login_failed', createdAt: { gte: since }, ...failures } });
  if (count < LOGIN_LOCK_THRESHOLD) return;
  await auditService.record({
    userId: audit.userId ?? null,
    action: 'auth.login_locked',
    entityType: 'user',
    entityId: audit.entityId ?? null,
    metadata: { failures: count, ...(audit.email ? { email: audit.email } : {}) },
    ...client,
  });
  throw AppError.tooManyRequests('Juda ko‘p noto‘g‘ri urinish. Hisob 15 daqiqaga vaqtincha bloklandi.');
}

export const authService = {
  async login(rawInput: LoginInput, client: ClientInfo): Promise<SessionResult> {
    // O'quvchi ID raqami (ST-000045) bilan ham kira oladi — hisob emailiga aylantiriladi
    const input = { ...rawInput, email: await resolveLoginIdentifier(rawInput.email) };
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { ...authUserSelect, passwordHash: true, lastLoginAt: true },
    });
    const windowStart = new Date(Date.now() - LOGIN_LOCK_WINDOW_MS);

    if (!user) {
      // Mavjud bo‘lmagan email ham xuddi shunday bloklanadi — hisob borligi oshkor bo‘lmasin
      await assertLoginNotLocked({ userId: null, metadata: { path: ['email'], equals: input.email } }, windowStart, { email: input.email }, client);
      await simulatePasswordCheck(input.password);
      await auditService.record({
        action: 'auth.login_failed',
        entityType: 'user',
        metadata: { email: input.email, reason: 'unknown_email' },
        ...client,
      });
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    // Oxirgi muvaffaqiyatli kirishdan keyingi urinishlar hisoblanadi; bloklangan paytda to‘g‘ri parol ham qabul qilinmaydi
    const lockSince = user.lastLoginAt && user.lastLoginAt > windowStart ? user.lastLoginAt : windowStart;
    await assertLoginNotLocked({ userId: user.id }, lockSince, { userId: user.id, entityId: user.id }, client);

    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid || user.deletedAt) {
      await auditService.record({
        userId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: passwordValid ? 'deleted' : 'wrong_password' },
        ...client,
      });
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    assertCanSignIn(user);

    const familyId = generateTokenId();
    const { updated, refresh } = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: authUserSelect,
      });
      const issued = await issueRefreshToken(tx, user.id, familyId, client);
      return { updated: updatedUser, refresh: issued };
    });

    await auditService.record({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ...client });

    return { session: buildSession(updated), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
  },

  async register(input: RegisterInput, client: ClientInfo): Promise<RegisterResult> {
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) {
      throw AppError.conflict('Bu email bilan hisob allaqachon mavjud', [
        { field: 'email', message: 'Bu email band' },
      ]);
    }

    const role = await prisma.role.findUnique({ where: { key: DEFAULT_REGISTER_ROLE }, select: { id: true } });
    if (!role) {
      throw new AppError(500, 'Standart rol topilmadi. Seed ishga tushirilganini tekshiring');
    }

    const passwordHash = await hashPassword(input.password);

    return prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          status: 'PENDING',
          roleId: role.id,
        },
        select: { id: true, email: true, status: true },
      });

      // Xodimlarni boshqara oladiganlarga (user.manage) tasdiqlash so‘rovi haqida bildirishnoma
      const approvers = await tx.user.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          role: { permissions: { some: { permission: { key: PERMISSIONS.USER_MANAGE } } } },
        },
        select: { id: true },
      });
      if (approvers.length > 0) {
        await tx.notification.createMany({
          data: approvers.map((approver) => ({
            userId: approver.id,
            type: 'SYSTEM' as const,
            title: 'Yangi xodim ro‘yxatdan o‘tdi',
            message: `${input.firstName} ${input.lastName} (${input.email}) tasdiqlashni kutmoqda`,
            entityType: 'user',
            entityId: created.id,
          })),
        });
      }

      await auditService.recordInTransaction(tx, {
        userId: created.id,
        action: 'user.registered',
        entityType: 'user',
        entityId: created.id,
        ...client,
      });

      return created;
    });
  },

  async refresh(rawToken: string | undefined, client: ClientInfo): Promise<SessionResult> {
    if (!rawToken) {
      throw AppError.unauthorized('Sessiya topilmadi. Qaytadan kiring');
    }

    const payload = verifyRefreshToken(rawToken);
    if (!payload) {
      throw AppError.unauthorized(SESSION_EXPIRED);
    }

    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!stored || stored.userId !== payload.sub || stored.familyId !== payload.fam) {
      throw AppError.unauthorized(SESSION_EXPIRED);
    }

    if (stored.revokedAt) {
      // O‘g‘irlik belgisi — faqat ROTATSIYA qilingan (almashtirilgan) tokenning grace’dan keyin qayta ishlatilishi.
      // Logout, parol o‘zgarishi yoki oila bekor qilinishi natijasida yopilgan token shunchaki 401 oladi.
      const wasRotated = stored.replacedById !== null;
      const withinGrace = wasRotated && Date.now() - stored.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS;
      if (wasRotated && !withinGrace) {
        // Bekor qilingan token qayta ishlatildi — token o‘g‘irlangan bo‘lishi mumkin: butun sessiya oilasi bekor qilinadi.
        await revokeFamily(stored.familyId);
        logger.warn({ userId: stored.userId, familyId: stored.familyId }, 'Refresh token qayta ishlatildi — sessiya bekor qilindi');
        await auditService.record({
          userId: stored.userId,
          action: 'auth.refresh_token_reuse',
          entityType: 'user',
          entityId: stored.userId,
          metadata: { familyId: stored.familyId },
          ...client,
        });
      }
      throw AppError.unauthorized(SESSION_EXPIRED);
    }

    if (stored.expiresAt <= new Date()) {
      throw AppError.unauthorized(SESSION_EXPIRED);
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId }, select: authUserSelect });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      await revokeFamily(stored.familyId);
      throw AppError.unauthorized('Hisobingizga kirish cheklangan');
    }

    const next = await prisma.$transaction(async (tx) => {
      // Faqat bitta parallel so‘rov tokenni almashtira oladi
      const revoked = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) return null;

      const issued = await issueRefreshToken(tx, user.id, stored.familyId, client);
      await tx.refreshToken.update({ where: { id: stored.id }, data: { replacedById: issued.id } });
      return issued;
    });

    if (!next) {
      throw AppError.unauthorized(SESSION_EXPIRED);
    }

    return { session: buildSession(user), refreshToken: next.token, refreshExpiresAt: next.expiresAt };
  },

  /** Joriy qurilmadan chiqish. Token noto‘g‘ri bo‘lsa ham xatolik qaytarmaydi (cookie baribir tozalanadi). */
  async logout(rawToken: string | undefined, client: ClientInfo): Promise<void> {
    if (!rawToken) return;

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!stored || stored.revokedAt) return;

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    await auditService.record({ userId: stored.userId, action: 'auth.logout', entityType: 'user', entityId: stored.userId, ...client });
  },

  /** Barcha qurilmalardagi sessiyalarni bekor qiladi. */
  async logoutAll(userId: string, client: ClientInfo): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await auditService.record({
      userId,
      action: 'auth.logout_all',
      entityType: 'user',
      entityId: userId,
      metadata: { revokedSessions: result.count },
      ...client,
    });
    return result.count;
  },

  async me(userId: string): Promise<AuthUserDto> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: authUserSelect });
    if (!user || user.deletedAt) {
      throw AppError.unauthorized();
    }
    return toAuthUserDto(user);
  },

  /** Email mavjud-mavjud emasligidan qat’i nazar controller bir xil javob qaytaradi. */
  async forgotPassword(input: ForgotPasswordInput, client: ClientInfo): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, firstName: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      return;
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_EXPIRES_MINUTES * 60_000);

    await prisma.$transaction([
      // Avvalgi ishlatilmagan havolalar bekor qilinadi — faqat oxirgisi amal qiladi
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
      }),
    ]);

    await auditService.record({
      userId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      ...client,
    });

    try {
      await emailService.sendPasswordReset({
        to: user.email,
        firstName: user.firstName,
        resetUrl: `${primaryClientUrl}/reset-password?token=${encodeURIComponent(token)}`,
        expiresInMinutes: env.PASSWORD_RESET_EXPIRES_MINUTES,
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Parolni tiklash xatini yuborib bo‘lmadi');
    }
  },

  async resetPassword(input: ResetPasswordInput, client: ClientInfo): Promise<void> {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { status: true, deletedAt: true } },
      },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.user.deletedAt ||
      record.user.status === 'BLOCKED'
    ) {
      throw AppError.badRequest(INVALID_RESET_LINK);
    }

    const passwordHash = await hashPassword(input.password);

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw AppError.badRequest(INVALID_RESET_LINK);
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
      });
      // Parol tiklangach barcha qurilmalardagi sessiyalar yopiladi
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await auditService.recordInTransaction(tx, {
        userId: record.userId,
        action: 'auth.password_reset',
        entityType: 'user',
        entityId: record.userId,
        ...client,
      });
    });
  },

  /** Parolni o‘zgartiradi, boshqa qurilmalardagi sessiyalarni yopadi va joriy qurilma uchun yangi sessiya beradi. */
  async changePassword(userId: string, input: ChangePasswordInput, client: ClientInfo): Promise<SessionResult> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) {
      throw AppError.unauthorized();
    }

    const currentValid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw AppError.badRequest('Joriy parol noto‘g‘ri', [{ field: 'currentPassword', message: 'Joriy parol noto‘g‘ri' }]);
    }

    const passwordHash = await hashPassword(input.newPassword);
    const familyId = generateTokenId();

    const { updated, refresh } = await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const updatedUser = await tx.user.update({
        where: { id: userId },
        // O'zi tanlagan parol — vaqtinchalik parol talabi olib tashlanadi
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
        select: authUserSelect,
      });
      const issued = await issueRefreshToken(tx, userId, familyId, client);
      await auditService.recordInTransaction(tx, {
        userId,
        action: 'auth.password_changed',
        entityType: 'user',
        entityId: userId,
        ...client,
      });
      return { updated: updatedUser, refresh: issued };
    });

    return { session: buildSession(updated), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
  },
};
