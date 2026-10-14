import type { Request, Response } from 'express';
import { kpiService } from '../services/kpi.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  kpiDefinitionSchema,
  kpiDefinitionUpdateSchema,
  kpiManualResultSchema,
  kpiPoolSchema,
  kpiPreviewQuerySchema,
  kpiSettingsSchema,
} from '../validators/kpi.validator.js';

export const kpiController = {
  async definitions(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await kpiService.definitions());
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = kpiDefinitionSchema.parse(req.body);
    sendCreated(res, await kpiService.create(requireAuthUser(req), input, getClientInfo(req)), 'KPI qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = kpiDefinitionUpdateSchema.parse(req.body);
    sendSuccess(res, await kpiService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'KPI saqlandi' });
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    const input = kpiSettingsSchema.parse(req.body);
    sendSuccess(res, await kpiService.updateSettings(requireAuthUser(req), input, getClientInfo(req)), { message: 'KPI chegarasi saqlandi' });
  },

  async setPool(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = kpiPoolSchema.parse(req.body);
    sendSuccess(res, await kpiService.setPool(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'KPI bonus fondi saqlandi' });
  },

  async saveResult(req: Request, res: Response): Promise<void> {
    const input = kpiManualResultSchema.parse(req.body);
    sendSuccess(res, await kpiService.saveManualResult(requireAuthUser(req), input, getClientInfo(req)), { message: 'KPI natijasi saqlandi' });
  },

  async preview(req: Request, res: Response): Promise<void> {
    const query = kpiPreviewQuerySchema.parse(req.query);
    sendSuccess(res, await kpiService.preview(query.employeeId, query.year, query.month));
  },
};
