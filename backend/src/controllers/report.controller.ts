import type { Request, Response } from 'express';
import { reportService, toCsv } from '../services/report.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { reportQuerySchema, reportTypeParamSchema } from '../validators/report.validator.js';

export const reportController = {
  async build(req: Request, res: Response): Promise<void> {
    const { type } = reportTypeParamSchema.parse(req.params);
    const query = reportQuerySchema.parse(req.query);
    sendSuccess(res, await reportService.build(type, query));
  },

  /** CSV yuklab olish — Excel’da to‘g‘ri ochilishi uchun BOM qo‘shiladi */
  async export(req: Request, res: Response): Promise<void> {
    const { type } = reportTypeParamSchema.parse(req.params);
    const query = reportQuerySchema.parse(req.query);
    const report = await reportService.build(type, query);
    const fileName = `${type}-${report.from}_${report.to}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(toCsv(report));
  },
};
