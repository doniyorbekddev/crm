import type { Request, Response } from 'express';
import { portalService } from '../services/portal.service.js';
import { portalAccountService } from '../services/portalAccount.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { portalAccountSchema, portalChildQuerySchema } from '../validators/portal.validator.js';
import { portalFeedbackSchema } from '../validators/feedback.validator.js';

export const portalController = {
  async me(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await portalService.me(requireAuthUser(req)));
  },

  async profile(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.profile(requireAuthUser(req), studentId));
  },

  async schedule(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.schedule(requireAuthUser(req), studentId));
  },

  /** Kelgusi darslar va o'qituvchi */
  async lessons(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.lessons(requireAuthUser(req), studentId));
  },

  /** Kurs dasturi bo'yicha progress */
  async curriculum(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.curriculum(requireAuthUser(req), studentId));
  },

  /** O'quvchining sertifikatlari */
  async certificates(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.certificates(requireAuthUser(req), studentId));
  },

  async feedbackState(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.feedbackState(requireAuthUser(req), studentId));
  },

  async submitFeedback(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    const input = portalFeedbackSchema.parse(req.body);
    sendCreated(res, await portalService.submitFeedback(requireAuthUser(req), input, studentId), 'Fikringiz uchun rahmat');
  },

  async createStudentAccount(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { email } = portalAccountSchema.parse(req.body);
    sendCreated(
      res,
      await portalAccountService.createForStudent(requireAuthUser(req), id, email, getClientInfo(req)),
      'Kabinet ochildi — parolni o‘quvchiga yetkazing',
    );
  },

  async createParentAccount(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { email } = portalAccountSchema.parse(req.body);
    sendCreated(
      res,
      await portalAccountService.createForParent(requireAuthUser(req), id, email, getClientInfo(req)),
      'Kabinet ochildi — parolni ota-onaga yetkazing',
    );
  },
};
