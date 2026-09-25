import type { RequestHandler } from 'express';
import type { PermissionKey } from '../config/permissions.js';
import { permissionService } from '../services/permission.service.js';
import { AppError } from '../utils/AppError.js';

/** Barcha ko‘rsatilgan ruxsatlar talab qilinadi. `authenticate` dan keyin ishlatiladi. */
export function requirePermission(...required: PermissionKey[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    const granted = await permissionService.getRolePermissions(req.user.roleId);
    if (required.every((permission) => granted.has(permission))) {
      next();
      return;
    }
    next(AppError.forbidden());
  };
}

/** Ko‘rsatilgan ruxsatlardan kamida bittasi yetarli. */
export function requireAnyPermission(...candidates: PermissionKey[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    const granted = await permissionService.getRolePermissions(req.user.roleId);
    if (candidates.some((permission) => granted.has(permission))) {
      next();
      return;
    }
    next(AppError.forbidden());
  };
}

/**
 * Faqat xodimlar (kabinet hisobi — o'quvchi/ota-ona — emas). Masalan xodim ishlari:
 * alohida ruxsat talab qilmaydi (har kim o'zinikini ko'radi), lekin kabinetga tegishli emas.
 */
export function requireStaff(): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    const granted = await permissionService.getRolePermissions(req.user.roleId);
    if (granted.has('portal.student') || granted.has('portal.parent')) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
