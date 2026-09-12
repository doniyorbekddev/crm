import type { Request, Response } from 'express';
import { searchService } from '../services/search.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { searchQuerySchema } from '../validators/search.validator.js';

export const searchController = {
  async search(req: Request, res: Response): Promise<void> {
    const { q } = searchQuerySchema.parse(req.query);
    sendSuccess(res, await searchService.search(requireAuthUser(req), q));
  },
};
