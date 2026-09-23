import type { Request, Response } from 'express';
import { roomService } from '../services/room.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { conflictCheckSchema, createRoomSchema, roomListQuerySchema, updateRoomSchema } from '../validators/room.validator.js';

export const roomController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = roomListQuerySchema.parse(req.query);
    sendSuccess(res, await roomService.list(requireAuthUser(req), query));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createRoomSchema.parse(req.body);
    sendCreated(res, await roomService.create(requireAuthUser(req), input, getClientInfo(req)), 'Xona qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateRoomSchema.parse(req.body);
    sendSuccess(res, await roomService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Xona saqlandi',
    });
  },

  /** Jadvalni saqlashdan oldin to‘qnashuvlarni ko‘rish */
  async checkConflicts(req: Request, res: Response): Promise<void> {
    const input = conflictCheckSchema.parse(req.body);
    sendSuccess(res, await roomService.checkConflicts(requireAuthUser(req), input));
  },
};
