import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { getHealth, getJobHealth } from '../controllers/health.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const healthRouter = Router();

healthRouter.get('/', getHealth);

// Fon vazifalari salomatligi (TZ 3.1 §44) — ichki ma'lumot, shuning uchun faqat sozlamalarni boshqaruvchi xodimga
healthRouter.get('/jobs', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), getJobHealth);
