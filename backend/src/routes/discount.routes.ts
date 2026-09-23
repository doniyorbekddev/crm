import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { discountController, referralController } from '../controllers/discount.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const discountRouter = Router();

discountRouter.use(authenticate);

// Sozlama va katalog — aniq yo'llar `/:id` dan oldin turadi
discountRouter.get('/settings', requirePermission(PERMISSIONS.DISCOUNT_VIEW), discountController.settings);
discountRouter.put('/settings', requirePermission(PERMISSIONS.DISCOUNT_MANAGE), discountController.saveSettings);
discountRouter.get('/rules', requirePermission(PERMISSIONS.DISCOUNT_VIEW), discountController.rules);
discountRouter.put('/rules', requirePermission(PERMISSIONS.DISCOUNT_MANAGE), discountController.saveRule);
discountRouter.get('/promo-codes', requirePermission(PERMISSIONS.DISCOUNT_VIEW), discountController.promoCodes);
discountRouter.post('/promo-codes', requirePermission(PERMISSIONS.DISCOUNT_MANAGE), discountController.createPromoCode);
discountRouter.patch('/promo-codes/:id', requirePermission(PERMISSIONS.DISCOUNT_MANAGE), discountController.setPromoCodeActive);

// O'quvchi bo'yicha chegirmalar
discountRouter.get('/students/:id', requirePermission(PERMISSIONS.DISCOUNT_VIEW), discountController.forStudent);
discountRouter.post('/students/:id', requirePermission(PERMISSIONS.DISCOUNT_GRANT), discountController.grant);
discountRouter.post('/:id/revoke', requirePermission(PERMISSIONS.DISCOUNT_GRANT), discountController.revoke);

export const referralRouter = Router();

referralRouter.use(authenticate);
referralRouter.get('/stats', requirePermission(PERMISSIONS.REFERRAL_VIEW), referralController.stats);
// Kodni tekshirish lead yaratishda kerak — lead huquqi bo'lgan xodim ham ishlata oladi
referralRouter.get('/lookup', requirePermission(PERMISSIONS.LEAD_CREATE), referralController.lookup);
referralRouter.get('/', requirePermission(PERMISSIONS.REFERRAL_VIEW), referralController.list);
referralRouter.post('/:id/reward', requirePermission(PERMISSIONS.REFERRAL_REWARD), referralController.reward);
referralRouter.post('/:id/cancel', requirePermission(PERMISSIONS.REFERRAL_REWARD), referralController.cancel);
