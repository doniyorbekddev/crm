import type { Request, Response } from 'express';
import { leadService } from '../services/lead.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { exportFormatSchema, idParamSchema } from '../validators/common.validator.js';
import {
  assignLeadSchema,
  createLeadNoteSchema,
  createLeadSchema,
  leadActivityQuerySchema,
  leadFilterQuerySchema,
  leadKanbanQuerySchema,
  leadListQuerySchema,
  leadNoteParamsSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
} from '../validators/lead.validator.js';
import { businessDateString } from '../utils/dates.js';
import { sendTable } from '../utils/tableExport.js';

export const leadController = {
  /** Filtrlangan ro‘yxatni CSV yoki XLSX ga eksport qilish */
  async export(req: Request, res: Response): Promise<void> {
    const query = leadListQuerySchema.parse(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    sendTable(res, await leadService.exportTable(requireAuthUser(req), query), `leadlar-${businessDateString(new Date())}`, format);
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = leadListQuerySchema.parse(req.query);
    const { items, total } = await leadService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async summary(req: Request, res: Response): Promise<void> {
    const filters = leadFilterQuerySchema.parse(req.query);
    sendSuccess(res, await leadService.summary(requireAuthUser(req), filters));
  },

  async kanban(req: Request, res: Response): Promise<void> {
    const query = leadKanbanQuerySchema.parse(req.query);
    sendSuccess(res, await leadService.kanban(requireAuthUser(req), query));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await leadService.getById(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createLeadSchema.parse(req.body);
    sendCreated(res, await leadService.create(requireAuthUser(req), input, getClientInfo(req)), 'Lead qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateLeadSchema.parse(req.body);
    sendSuccess(res, await leadService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Lead ma’lumotlari saqlandi',
    });
  },

  async setStatus(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateLeadStatusSchema.parse(req.body);
    sendSuccess(res, await leadService.setStatus(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Status o‘zgartirildi',
    });
  },

  async assign(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = assignLeadSchema.parse(req.body);
    sendSuccess(res, await leadService.assign(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: input.assignedToId ? 'Mas’ul xodim belgilandi' : 'Lead biriktirilmagan holatga qaytarildi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await leadService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Lead o‘chirildi' });
  },

  async activities(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const query = leadActivityQuerySchema.parse(req.query);
    const { items, total } = await leadService.activities(requireAuthUser(req), id, query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async notes(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await leadService.notes(requireAuthUser(req), id));
  },

  async addNote(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = createLeadNoteSchema.parse(req.body);
    sendCreated(res, await leadService.addNote(requireAuthUser(req), id, input), 'Izoh qo‘shildi');
  },

  async deleteNote(req: Request, res: Response): Promise<void> {
    const { id, noteId } = leadNoteParamsSchema.parse(req.params);
    await leadService.deleteNote(requireAuthUser(req), id, noteId);
    sendSuccess(res, null, { message: 'Izoh o‘chirildi' });
  },
};
