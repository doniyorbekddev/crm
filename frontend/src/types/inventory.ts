export type StockMovementType = 'PURCHASE' | 'SALE' | 'RETURN' | 'DAMAGE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT';

export interface ProductCategory {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  cost: number;
  quantity: number;
  minQuantity: number;
  /** Qoldiq chegaradan kam */
  isLowStock: boolean;
  /** Miqdor × tannarx */
  stockValue: number;
  isActive: boolean;
  note: string | null;
  branchId: string;
  category: { id: string; key: string; name: string };
  createdAt: string;
}

export interface ProductPayload {
  id?: string;
  sku: string;
  name: string;
  categoryId: string;
  unit: string;
  price: number;
  cost: number;
  minQuantity: number;
  isActive: boolean;
  note?: string;
}

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  unitPrice: number;
  totalAmount: number;
  reason: string | null;
  product: { id: string; sku: string; name: string; unit: string };
  student: { id: string; name: string } | null;
  createdBy: string | null;
  hasMoneyRecord: boolean;
  createdAt: string;
}

export interface StockMovementPayload {
  productId: string;
  type: StockMovementType;
  quantity: number;
  unitPrice?: number;
  reason?: string;
  studentId?: string;
  decrease?: boolean;
  /** Pul yozuvini ham yaratish */
  money?: { categoryId: string; method: 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE'; accountId?: string };
}

export interface InventoryStats {
  products: number;
  stockValue: number;
  lowStock: number;
  outOfStock: number;
}

export interface ProductListParams {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  onlyLowStock?: 'true';
  includeInactive?: 'true';
}

export interface MovementListParams {
  page: number;
  limit: number;
  productId?: string;
  type?: StockMovementType;
}
