import type { RequestHandler } from 'express';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * `Authorization: Bearer <accessToken>` ni tekshiradi va `req.user` ni to‘ldiradi.
 * Har so‘rovda foydalanuvchi bazadan tekshiriladi — bloklangan/o‘chirilgan xodim yoki
 * paroli o‘zgargan sessiya access token muddati tugashini kutmasdan darhol to‘xtatiladi.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    next(AppError.unauthorized());
    return;
  }

  const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
  if (!payload) {
    next(AppError.unauthorized('Sessiya muddati tugagan. Qaytadan kiring'));
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      deletedAt: true,
      passwordChangedAt: true,
      roleId: true,
      role: { select: { key: true } },
    },
  });

  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    next(AppError.unauthorized('Hisobingizga kirish cheklangan'));
    return;
  }

  // Parol o‘zgartirilgandan oldin berilgan tokenlar yaroqsiz
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
    next(AppError.unauthorized('Parol o‘zgartirilgan. Qaytadan kiring'));
    return;
  }

  req.user = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    roleKey: user.role.key,
  };
  next();
};
