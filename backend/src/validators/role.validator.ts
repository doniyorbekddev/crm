import { z } from 'zod';
import { optionalField } from './common.validator.js';

const roleNameSchema = z
  .string('Rol nomini kiriting')
  .trim()
  .min(2, 'Rol nomi kamida 2 belgidan iborat bo‘lishi kerak')
  .max(100, 'Rol nomi 100 belgidan oshmasligi kerak');

const descriptionSchema = optionalField(z.string().trim().max(255, 'Tavsif 255 belgidan oshmasligi kerak'));

const permissionKeysSchema = z
  .array(z.string().trim().min(1).max(100), 'Ruxsatlar ro‘yxati noto‘g‘ri')
  .max(200, 'Ruxsatlar juda ko‘p');

export const createRoleSchema = z.object({
  key: z
    .string('Rol kalitini kiriting')
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{2,49}$/, 'Kalit lotin katta harflari, raqam va _ dan iborat bo‘lsin (masalan: SENIOR_MANAGER)'),
  name: roleNameSchema,
  description: descriptionSchema,
  permissionKeys: permissionKeysSchema.default([]),
});

export const updateRoleSchema = z.object({
  name: roleNameSchema,
  description: descriptionSchema,
});

export const setRolePermissionsSchema = z.object({
  permissionKeys: permissionKeysSchema,
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;
