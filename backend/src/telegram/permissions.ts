import type { PermissionKey } from '../config/permissions.js';
import { permissionService } from '../services/permission.service.js';
import type { CommandScope } from '../services/telegramCommand.service.js';
import type { AuthUser } from '../types/auth.js';

/**
 * Bot amallari uchun ruxsat (TZ 3.1 §28, audit S1): REST marshrutdagi `requirePermission` bilan
 * **bir xil kalitlar**. Servis ma'lumot doirasini (o'z guruhi, o'z leadi) tekshiradi, bu yerda esa
 * amalning o'zi ruxsat etilganmi — menyu tugmasini yashirish himoya emas.
 */
export async function botCan(actor: AuthUser | null, ...required: PermissionKey[]): Promise<boolean> {
  if (!actor) return false;
  const granted = await permissionService.getRolePermissions(actor.roleId);
  return required.every((permission) => granted.has(permission));
}

export async function scopeCan(scope: CommandScope, ...required: PermissionKey[]): Promise<boolean> {
  return botCan(scope.actor, ...required);
}

export const BOT_FORBIDDEN_TEXT = '⛔ Bu amal uchun ruxsatingiz yo‘q.';
