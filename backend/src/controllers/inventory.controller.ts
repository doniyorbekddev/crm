import type { Request, Response } from 'express';
import { inventoryService } from '../services/inventory.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import {
  inventoryStatsQuerySchema,
  movementListQuerySchema,
  productCategorySchema,
  productListQuerySchema,
  productSchema,
  stockMovementSchema,
  stockTransferSchema,
} from '../validators/inventory.validator.js';

export const inventoryController = {
  async categories(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await inventoryService.categories(req.query.includeInactive === 'true'));
  },

  async saveCategory(req: Request, res: Response): Promise<void> {
    const input = productCategorySchema.parse(req.body);
    sendSuccess(res, await inventoryService.saveCategory(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Turkum saqlandi',
    });
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = productListQuerySchema.parse(req.query);
    const { items, total } = await inventoryService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async stats(req: Request, res: Response): Promise<void> {
    const { branchId } = inventoryStatsQuerySchema.parse(req.query);
    sendSuccess(res, await inventoryService.stats(requireAuthUser(req), branchId));
  },

  async save(req: Request, res: Response): Promise<void> {
    const input = productSchema.parse(req.body);
    const product = await inventoryService.saveProduct(requireAuthUser(req), input, getClientInfo(req));
    if (input.id) {
      sendSuccess(res, product, { message: 'Mahsulot saqlandi' });
      return;
    }
    sendCreated(res, product, 'Mahsulot qo‘shildi');
  },

  async movements(req: Request, res: Response): Promise<void> {
    const query = movementListQuerySchema.parse(req.query);
    const { items, total } = await inventoryService.movements(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async move(req: Request, res: Response): Promise<void> {
    const input = stockMovementSchema.parse(req.body);
    sendCreated(res, await inventoryService.move(requireAuthUser(req), input, getClientInfo(req)), 'Ombor harakati yozildi');
  },

  async transfer(req: Request, res: Response): Promise<void> {
    const input = stockTransferSchema.parse(req.body);
    const result = await inventoryService.transfer(requireAuthUser(req), input, getClientInfo(req));
    sendCreated(res, result, 'Tovar ko‘chirildi');
  },
};
