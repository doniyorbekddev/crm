import type { Request, Response } from 'express';
import { findProvider, onlinePaymentService } from '../services/payments/onlinePayment.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { createIntentSchema, intentListQuerySchema, webhookParamsSchema } from '../validators/onlinePayment.validator.js';

/** Express `verify` saqlab qo‘ygan xom tana */
type RawBodyRequest = Request & { rawBody?: string };

export const onlinePaymentController = {
  async providers(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, onlinePaymentService.providers());
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = intentListQuerySchema.parse(req.query);
    const { items, total } = await onlinePaymentService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async createIntent(req: Request, res: Response): Promise<void> {
    const input = createIntentSchema.parse(req.body);
    sendCreated(res, await onlinePaymentService.createIntent(requireAuthUser(req), input, getClientInfo(req)), 'To‘lov so‘rovi yaratildi');
  },

  /**
   * Provayder webhooki — autentifikatsiyasiz, lekin **imzo bilan**.
   *
   * Javob kodlari provayder xatti-harakatini belgilaydi:
   *  - 404/503 — yo‘l yopiq (provayder yo‘q yoki sozlanmagan);
   *  - 401 — imzo noto‘g‘ri (qayta yuborish ham yordam bermaydi);
   *  - 200 — qabul qilindi (takroriy xabar ham 200: provayder tinchlansin).
   */
  async webhook(req: Request, res: Response): Promise<void> {
    const { provider: providerKey } = webhookParamsSchema.parse(req.params);
    const provider = findProvider(providerKey);
    if (!provider) throw AppError.notFound('Bunday to‘lov provayderi yo‘q');
    if (!provider.isConfigured()) {
      res.status(503).json({ ok: false, message: 'To‘lov provayderi sozlanmagan' });
      return;
    }

    const rawBody = (req as RawBodyRequest).rawBody ?? '';
    const headers = Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
    if (!provider.verifySignature(rawBody, headers)) {
      throw AppError.unauthorized('Webhook imzosi noto‘g‘ri');
    }

    const outcome = await onlinePaymentService.handleWebhook(provider, req.body, getClientInfo(req));
    if (outcome.status === 'rejected') {
      // 200: provayder qayta yubormasin — xato takrorlanadi. Xodim ro‘yxatda ko‘radi.
      res.status(200).json({ ok: false, message: outcome.message });
      return;
    }
    res.status(200).json(provider.successResponse());
  },
};
