import type { Request, Response } from 'express';
import { discountService } from '../services/discount.service.js';
import { referralService } from '../services/referral.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  cancelReferralSchema,
  discountRuleQuerySchema,
  discountRuleSchema,
  discountSettingsSchema,
  grantDiscountSchema,
  promoCodeActiveSchema,
  promoCodeSchema,
  referralCodeQuerySchema,
  referralListQuerySchema,
  revokeDiscountSchema,
} from '../validators/discount.validator.js';

export const discountController = {
  async settings(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await discountService.settings());
  },

  async saveSettings(req: Request, res: Response): Promise<void> {
    const input = discountSettingsSchema.parse(req.body);
    sendSuccess(res, await discountService.saveSettings(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Chegirma sozlamalari saqlandi',
    });
  },

  async rules(req: Request, res: Response): Promise<void> {
    const { includeInactive } = discountRuleQuerySchema.parse(req.query);
    sendSuccess(res, await discountService.listRules(includeInactive));
  },

  async saveRule(req: Request, res: Response): Promise<void> {
    const input = discountRuleSchema.parse(req.body);
    sendSuccess(res, await discountService.saveRule(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Chegirma qoidasi saqlandi',
    });
  },

  async promoCodes(req: Request, res: Response): Promise<void> {
    const { includeInactive } = discountRuleQuerySchema.parse(req.query);
    sendSuccess(res, await discountService.listPromoCodes(includeInactive));
  },

  async createPromoCode(req: Request, res: Response): Promise<void> {
    const input = promoCodeSchema.parse(req.body);
    sendCreated(res, await discountService.createPromoCode(requireAuthUser(req), input, getClientInfo(req)), 'Promo kod yaratildi');
  },

  async setPromoCodeActive(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { isActive } = promoCodeActiveSchema.parse(req.body);
    sendSuccess(res, await discountService.setPromoCodeActive(requireAuthUser(req), id, isActive, getClientInfo(req)), {
      message: isActive ? 'Promo kod yoqildi' : 'Promo kod o‘chirildi',
    });
  },

  /** O'quvchining chegirmalari (profil kartochkasi) */
  async forStudent(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await discountService.forStudent(id));
  },

  async grant(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = grantDiscountSchema.parse(req.body);
    sendSuccess(res, await discountService.grant(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Chegirma berildi',
    });
  },

  async revoke(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { reason } = revokeDiscountSchema.parse(req.body);
    sendSuccess(res, await discountService.revoke(requireAuthUser(req), id, reason, getClientInfo(req)), {
      message: 'Chegirma bekor qilindi',
    });
  },
};

export const referralController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = referralListQuerySchema.parse(req.query);
    const { items, total } = await referralService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async stats(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await referralService.stats());
  },

  /** Kodni tekshirish — lead formasida "kim taklif qildi?" ni ko'rsatish uchun */
  async lookup(req: Request, res: Response): Promise<void> {
    const { code } = referralCodeQuerySchema.parse(req.query);
    sendSuccess(res, await referralService.findByCode(code));
  },

  async reward(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await referralService.reward(requireAuthUser(req), id, getClientInfo(req)), { message: 'Bonus berildi' });
  },

  async cancel(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { reason } = cancelReferralSchema.parse(req.body);
    sendSuccess(res, await referralService.cancel(requireAuthUser(req), id, reason, getClientInfo(req)), {
      message: 'Taklif bekor qilindi',
    });
  },
};
