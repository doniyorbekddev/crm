import type { Request, Response } from 'express';
import { masteryService } from '../services/mastery.service.js';
import { progressSnapshotService } from '../services/progressSnapshot.service.js';
import { studentService } from '../services/student.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { masterySettingsSchema } from '../validators/mastery.validator.js';

export const masteryController = {
  async student(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await masteryService.forStudent(requireAuthUser(req), id));
  },

  /** Oylik progress tarixi (snapshotlar) */
  async studentHistory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await studentService.getById(requireAuthUser(req), id);
    sendSuccess(res, await progressSnapshotService.history(id));
  },

  async group(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await masteryService.forGroup(requireAuthUser(req), id));
  },

  async settings(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await masteryService.settings());
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    const input = masterySettingsSchema.parse(req.body);
    sendSuccess(res, await masteryService.updateSettings(requireAuthUser(req), input, getClientInfo(req)), { message: 'Sozlamalar saqlandi' });
  },
};
