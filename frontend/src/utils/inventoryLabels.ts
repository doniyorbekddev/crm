import type { BadgeTone } from '@/components/ui/Badge';
import type { StockMovementType } from '@/types/inventory';

/** Kirim avval, keyin chiqim — formada shu tartibda ko‘rinadi */
export const STOCK_MOVEMENT_ORDER: readonly StockMovementType[] = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'DAMAGE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT',
];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  PURCHASE: 'Kirim (xarid)',
  SALE: 'Sotuv',
  RETURN: 'Qaytarildi',
  DAMAGE: 'Hisobdan chiqarish (yaroqsiz)',
  TRANSFER_IN: 'Filialdan keldi',
  TRANSFER_OUT: 'Filialga yuborildi',
  ADJUSTMENT: 'Inventarizatsiya tuzatishi',
};

export const STOCK_MOVEMENT_TONES: Record<StockMovementType, BadgeTone> = {
  PURCHASE: 'green',
  SALE: 'blue',
  RETURN: 'green',
  DAMAGE: 'red',
  TRANSFER_IN: 'green',
  TRANSFER_OUT: 'yellow',
  ADJUSTMENT: 'gray',
};

/** Qoldiqqa qo‘shiladigan turlar (ro‘yxatda +/− belgisi uchun) */
export const STOCK_INCOMING: readonly StockMovementType[] = ['PURCHASE', 'RETURN', 'TRANSFER_IN'];
