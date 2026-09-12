import type { Request, Response } from 'express';
import { gamificationService } from '../services/gamification.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  awardBadgeSchema,
  leaderboardQuerySchema,
  manualXpSchema,
  updateBadgeSchema,
  updateLevelSchema,
  updateXpRuleSchema,
} from '../validators/gamification.validator.js';

export const gamificationController = {
  async leaderboard(req: Request, res: Response): Promise<void> {
    const query = leaderboardQuerySchema.parse(req.query);
    sendSuccess(res, await gamificationService.leaderboard(query));
  },

  async profile(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await gamificationService.profile(id));
  },

  async rules(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await gamificationService.rules());
  },

  async updateRule(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateXpRuleSchema.parse(req.body);
    sendSuccess(res, await gamificationService.updateRule(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'XP qoidasi saqlandi',
    });
  },

  async levels(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await gamificationService.levels());
  },

  async updateLevel(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateLevelSchema.parse(req.body);
    sendSuccess(res, await gamificationService.updateLevel(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Daraja saqlandi',
    });
  },

  async badges(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await gamificationService.badges());
  },

  async updateBadge(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateBadgeSchema.parse(req.body);
    sendSuccess(res, await gamificationService.updateBadge(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Nishon saqlandi',
    });
  },

  async manualXp(req: Request, res: Response): Promise<void> {
    const input = manualXpSchema.parse(req.body);
    sendSuccess(res, await gamificationService.manualXp(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'XP berildi',
    });
  },

  async awardBadge(req: Request, res: Response): Promise<void> {
    const input = awardBadgeSchema.parse(req.body);
    sendSuccess(
      res,
      await gamificationService.awardBadge(requireAuthUser(req), input.studentId, input.badgeId, getClientInfo(req)),
      { message: 'Nishon berildi' },
    );
  },

  async recalculate(req: Request, res: Response): Promise<void> {
    const result = await gamificationService.recalculateAll(requireAuthUser(req), getClientInfo(req));
    sendSuccess(res, result, { message: `${result.students} ta o‘quvchi qayta hisoblandi` });
  },
};
