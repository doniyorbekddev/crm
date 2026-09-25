import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { gamificationController } from '../controllers/gamification.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const gamificationRouter = Router();

gamificationRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.GAMIFICATION_VIEW);
const manage = requirePermission(PERMISSIONS.GAMIFICATION_MANAGE);

gamificationRouter.get('/leaderboard', view, gamificationController.leaderboard);
gamificationRouter.get('/rules', view, gamificationController.rules);
gamificationRouter.get('/levels', view, gamificationController.levels);
gamificationRouter.get('/badges', view, gamificationController.badges);
gamificationRouter.get('/students/:id', view, gamificationController.profile);

gamificationRouter.put('/rules/:id', manage, gamificationController.updateRule);
gamificationRouter.put('/levels/:id', manage, gamificationController.updateLevel);
gamificationRouter.post('/badges', manage, gamificationController.createBadge);
gamificationRouter.put('/badges/:id', manage, gamificationController.updateBadge);
gamificationRouter.post('/xp', manage, gamificationController.manualXp);
gamificationRouter.post('/badges/award', manage, gamificationController.awardBadge);
gamificationRouter.post('/recalculate', manage, gamificationController.recalculate);
