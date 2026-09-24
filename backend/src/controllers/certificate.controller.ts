import type { Request, Response } from 'express';
import { certificateService } from '../services/certificate.service.js';
import { permissionService } from '../services/permission.service.js';
import { resolvePortalScope } from '../services/portal.service.js';
import { PERMISSIONS } from '../config/permissions.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { AppError } from '../utils/AppError.js';
import {
  certificateListQuerySchema,
  issueCertificateSchema,
  revokeCertificateSchema,
} from '../validators/certificate.validator.js';
import { idParamSchema } from '../validators/common.validator.js';
import { z } from 'zod';

const tokenParamSchema = z.object({ token: z.string().trim().regex(/^[a-f0-9]{32}$/, 'Kod noto‘g‘ri') });

export const certificateController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = certificateListQuerySchema.parse(req.query);
    const { items, total } = await certificateService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async issue(req: Request, res: Response): Promise<void> {
    const input = issueCertificateSchema.parse(req.body);
    sendCreated(res, await certificateService.issue(requireAuthUser(req), input, getClientInfo(req)), 'Sertifikat berildi');
  },

  async revoke(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = revokeCertificateSchema.parse(req.body);
    sendSuccess(res, await certificateService.revoke(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Sertifikat bekor qilindi',
    });
  },

  /**
   * Bitta sertifikat — chop etish sahifasi uchun.
   *
   * Xodim (`student.view`) istalganini oladi; kabinet foydalanuvchisi faqat o'ziniki.
   */
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const actor = requireAuthUser(req);
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    const allowedStudentIds = permissions.has(PERMISSIONS.STUDENT_VIEW) ? null : (await resolvePortalScope(actor)).studentIds;
    sendSuccess(res, await certificateService.getForActor(id, allowedStudentIds));
  },

  /** Ochiq tekshiruv — autentifikatsiyasiz */
  async verify(req: Request, res: Response): Promise<void> {
    const { token } = tokenParamSchema.parse(req.params);
    const result = await certificateService.verify(token);
    if (!result) {
      throw AppError.notFound('Bunday sertifikat topilmadi');
    }
    sendSuccess(res, result);
  },
};
