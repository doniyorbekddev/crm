import { Router } from 'express';
import { searchController } from '../controllers/search.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';

export const searchRouter = Router();

// Natijalar xodimning ruxsatiga qarab filtrlanadi — alohida permission talab qilinmaydi.
searchRouter.use(authenticate);

searchRouter.get('/', heavyLimiter, searchController.search);
