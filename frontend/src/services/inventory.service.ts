import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  InventoryStats,
  MovementListParams,
  Product,
  ProductCategory,
  ProductListParams,
  ProductPayload,
  StockMovement,
  StockMovementPayload,
  StockTransferPayload,
  StockTransferResult,
} from '@/types/inventory';

function withMessage<T>(response: { data: ApiSuccessResponse<T> }): MessageResult<T> {
  return { data: response.data.data, message: response.data.message };
}

export const inventoryService = {
  async list(params: ProductListParams): Promise<Paginated<Product>> {
    const response = await api.get<ApiSuccessResponse<Product[]>>('/products', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async stats(): Promise<InventoryStats> {
    const response = await api.get<ApiSuccessResponse<InventoryStats>>('/products/stats');
    return response.data.data;
  },

  async categories(includeInactive = false): Promise<ProductCategory[]> {
    const response = await api.get<ApiSuccessResponse<ProductCategory[]>>('/products/categories', {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
    return response.data.data;
  },

  async saveCategory(payload: { key: string; name: string; isActive: boolean; sortOrder: number }): Promise<MessageResult<ProductCategory>> {
    return withMessage(await api.put<ApiSuccessResponse<ProductCategory>>('/products/categories', payload));
  },

  async save(payload: ProductPayload): Promise<MessageResult<Product>> {
    return withMessage(await api.put<ApiSuccessResponse<Product>>('/products', payload));
  },

  async movements(params: MovementListParams): Promise<Paginated<StockMovement>> {
    const response = await api.get<ApiSuccessResponse<StockMovement[]>>('/products/movements', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async move(payload: StockMovementPayload): Promise<MessageResult<StockMovement>> {
    return withMessage(await api.post<ApiSuccessResponse<StockMovement>>('/products/movements', payload));
  },

  /** Filiallararo ko‘chirish — serverda chiqim va kirim bitta tranzaksiyada yoziladi */
  async transfer(payload: StockTransferPayload): Promise<MessageResult<StockTransferResult>> {
    return withMessage(await api.post<ApiSuccessResponse<StockTransferResult>>('/products/transfers', payload));
  },
};
