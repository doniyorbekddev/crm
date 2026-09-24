import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { debtController, paymentController } from '../controllers/payment.controller.js';
import { onlinePaymentController } from '../controllers/onlinePayment.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { heavyLimiter, webhookLimiter } from '../middleware/rateLimiter.js';

export const paymentRouter = Router();

// --- Onlayn to'lov webhooki -------------------------------------------
// `authenticate` dan OLDIN: provayder token bilan emas, **imzo** bilan tanilади.
// Rate limit bor — imzoni topishga urinishlarni sekinlashtiradi.
paymentRouter.post('/webhook/:provider', webhookLimiter, onlinePaymentController.webhook);

paymentRouter.use(authenticate);

// Onlayn to'lov so'rovlari (CRM ichidan)
paymentRouter.get('/online/providers', requirePermission(PERMISSIONS.PAYMENT_VIEW), onlinePaymentController.providers);
paymentRouter.get('/online/intents', requirePermission(PERMISSIONS.PAYMENT_VIEW), onlinePaymentController.list);
paymentRouter.post('/online/intents', requirePermission(PERMISSIONS.PAYMENT_CREATE), onlinePaymentController.createIntent);

paymentRouter.get('/', requirePermission(PERMISSIONS.PAYMENT_VIEW), paymentController.list);
paymentRouter.get('/stats', requirePermission(PERMISSIONS.PAYMENT_VIEW), paymentController.stats);
paymentRouter.get('/export', heavyLimiter, requirePermission(PERMISSIONS.PAYMENT_VIEW), requirePermission(PERMISSIONS.REPORT_EXPORT), paymentController.export);
paymentRouter.get('/:id', requirePermission(PERMISSIONS.PAYMENT_VIEW), paymentController.getById);
paymentRouter.post('/', requirePermission(PERMISSIONS.PAYMENT_CREATE), paymentController.create);
paymentRouter.delete('/:id', requirePermission(PERMISSIONS.PAYMENT_DELETE), paymentController.remove);
paymentRouter.post('/:id/refunds', requirePermission(PERMISSIONS.PAYMENT_REFUND), paymentController.refund);

export const debtRouter = Router();

debtRouter.use(authenticate);

debtRouter.get('/', requirePermission(PERMISSIONS.DEBT_VIEW), debtController.list);
debtRouter.get('/summary', requirePermission(PERMISSIONS.DEBT_VIEW), debtController.summary);
