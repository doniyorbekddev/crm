import type { Request, Response } from 'express';
import { aiAssistantService } from '../services/ai/assistant.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { aiAskSchema } from '../validators/ai.validator.js';

export const aiController = {
  async tools(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await aiAssistantService.tools(requireAuthUser(req)));
  },

  async ask(req: Request, res: Response): Promise<void> {
    const input = aiAskSchema.parse(req.body);
    sendSuccess(res, await aiAssistantService.ask(requireAuthUser(req), input, getClientInfo(req)));
  },

  async history(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await aiAssistantService.history(requireAuthUser(req)));
  },
};
