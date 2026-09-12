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
