import { prisma } from '../config/database.js';
import type { Prisma, StockMovementType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { assertBranchAccess, branchFilter, getBranchAccess, resolveBranchId } from './branchAccess.js';
import { expenseService, incomeService } from './incomeExpense.service.js';

/**
 * Inventar (ombor).
 *
 * Tamoyillar:
 *  - **Harakat o'chirilmaydi:** xato yozuv teskari harakat bilan tuzatiladi. Shuning uchun
 *    qoldiqning har bir o'zgarishi sababi bilan tarixda qoladi (moliyaviy daftar bilan bir xil).
 *  - **Qoldiq — kesh:** `Product.quantity` har harakatda **bitta tranzaksiyada** yangilanadi va
 *    yozuvda `balanceAfter` saqlanadi, shuning uchun tarixni qayta hisoblash shart emas.
 *  - **Pul alohida:** sotuv/xarid pulni avtomatik yozmaydi. Xohlansa, shu harakat bilan birga
 *    mavjud tushum/xarajat servisi chaqiriladi — pul harakati doim bitta `Transaction` bo'ladi.
 *  - **Filial:** mahsulot filialga tegishli; boshqa filial mahsulotini ko'rish va o'zgartirish mumkin emas.
 */

/** Kirim (+) yoki chiqim (−) */
export function directionOf(type: StockMovementType, quantity: number): number {
  switch (type) {
    case 'PURCHASE':
    case 'RETURN':
    case 'TRANSFER_IN':
      return quantity;
    case 'SALE':
    case 'DAMAGE':
    case 'TRANSFER_OUT':
      return -quantity;
    case 'ADJUSTMENT':
      // Inventarizatsiya: yo'nalish alohida ko'rsatiladi (xizmat `signedQuantity` bilan chaqiradi)
      return quantity;
  }
}

const productSelect = {
  id: true,
  sku: true,
  name: true,
  unit: true,
  price: true,
  cost: true,
  quantity: true,
  minQuantity: true,
  isActive: true,
  note: true,
  branchId: true,
  createdAt: true,
  category: { select: { id: true, key: true, name: true } },
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  cost: number;
  quantity: number;
  minQuantity: number;
  /** Qoldiq belgilangan chegaradan kam (0 bo'lsa kuzatilmaydi) */
  isLowStock: boolean;
  /** Qoldiq qiymati: miqdor × tannarx */
  stockValue: number;
  isActive: boolean;
  note: string | null;
  branchId: string;
  category: { id: string; key: string; name: string };
  createdAt: string;
}

function toProductDto(record: ProductRecord): ProductDto {
  const cost = record.cost.toNumber();
  return {
    id: record.id,
    sku: record.sku,
    name: record.name,
    unit: record.unit,
    price: record.price.toNumber(),
    cost,
    quantity: record.quantity,
    minQuantity: record.minQuantity,
    isLowStock: record.minQuantity > 0 && record.quantity <= record.minQuantity,
    stockValue: Math.round(record.quantity * cost),
    isActive: record.isActive,
    note: record.note,
    branchId: record.branchId,
    category: record.category,
    createdAt: record.createdAt.toISOString(),
  };
}

const movementSelect = {
  id: true,
  type: true,
  quantity: true,
  balanceAfter: true,
  unitPrice: true,
  totalAmount: true,
  reason: true,
  counterpartBranchId: true,
  incomeId: true,
  expenseId: true,
  createdAt: true,
  product: { select: { id: true, sku: true, name: true, unit: true } },
  student: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.StockMovementSelect;

type MovementRecord = Prisma.StockMovementGetPayload<{ select: typeof movementSelect }>;

export interface StockMovementDto {
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
  /** Ko'chirishda ikkinchi filial (TRANSFER_IN/OUT uchun) */
  counterpartBranchId: string | null;
  /** Pul yozuvi bilan bog'langanmi */
  hasMoneyRecord: boolean;
  createdAt: string;
}

function toMovementDto(record: MovementRecord): StockMovementDto {
  return {
    id: record.id,
    type: record.type,
    quantity: record.quantity,
    balanceAfter: record.balanceAfter,
    unitPrice: record.unitPrice.toNumber(),
    totalAmount: record.totalAmount.toNumber(),
    reason: record.reason,
    product: record.product,
    student: record.student ? { id: record.student.id, name: `${record.student.firstName} ${record.student.lastName}` } : null,
    createdBy: record.createdBy ? `${record.createdBy.firstName} ${record.createdBy.lastName}` : null,
    counterpartBranchId: record.counterpartBranchId,
    hasMoneyRecord: record.incomeId !== null || record.expenseId !== null,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface InventoryStats {
  products: number;
  /** Ombordagi jami qoldiq qiymati (tannarx bo'yicha) */
  stockValue: number;
  lowStock: number;
  outOfStock: number;
}

export interface MovementInput {
  productId: string;
  type: StockMovementType;
  quantity: number;
  unitPrice?: number | undefined;
  reason?: string | undefined;
  studentId?: string | undefined;
  /** ADJUSTMENT uchun: qoldiqni kamaytirish kerakmi */
  decrease?: boolean | undefined;
  /** Pulni shu harakat bilan birga yozish (tushum/xarajat kategoriyasi) */
  money?: { categoryId: string; method: 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE'; accountId?: string | undefined } | undefined;
}

export interface TransferInput {
  productId: string;
  /** Qabul qiluvchi filial */
  toBranchId: string;
  quantity: number;
  reason?: string | undefined;
}

export interface TransferResult {
  /** Jo'natuvchi filialdagi chiqim yozuvi */
  out: StockMovementDto;
  /** Qabul qiluvchi filialdagi kirim yozuvi */
  in: StockMovementDto;
}

export const inventoryService = {
  async categories(includeInactive = false) {
    const rows = await prisma.productCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, key: true, name: true, isActive: true, sortOrder: true, _count: { select: { products: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      productCount: row._count.products,
    }));
  },

  async saveCategory(actor: AuthUser, input: { key: string; name: string; isActive: boolean; sortOrder: number }, client: ClientInfo) {
    const saved = await prisma.$transaction(async (tx) => {
      const record = await tx.productCategory.upsert({
        where: { key: input.key },
        update: { name: input.name, isActive: input.isActive, sortOrder: input.sortOrder },
        create: input,
        select: { id: true, key: true, name: true, isActive: true, sortOrder: true },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'inventory.category_saved',
        entityType: 'settings',
        entityId: record.id,
        metadata: { key: input.key, name: input.name, isActive: input.isActive },
        ...client,
      });
      return record;
    });
    return { ...saved, productCount: 0 };
  },

  async list(
    actor: AuthUser,
    query: { page: number; limit: number; search?: string | undefined; categoryId?: string | undefined; onlyLowStock?: boolean | undefined; includeInactive?: boolean | undefined; branchId?: string | undefined },
  ): Promise<{ items: ProductDto[]; total: number }> {
    const access = await getBranchAccess(actor);
    const where: Prisma.ProductWhereInput = {
      ...branchFilter(access, query.branchId),
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { sku: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, select: productSelect, orderBy: [{ name: 'asc' }], ...toSkipTake(query.page, query.limit) }),
      prisma.product.count({ where }),
    ]);
    const items = rows.map(toProductDto);
    // "Kam qoldi" filtri hisoblangan qiymat bo'yicha — SQL'da ikki ustunni solishtirish
    // o'rniga shu yerda ajratiladi (ro'yxat sahifasi kichik).
    return query.onlyLowStock ? { items: items.filter((item) => item.isLowStock), total: items.filter((item) => item.isLowStock).length } : { items, total };
  },

  async stats(actor: AuthUser, branchId?: string): Promise<InventoryStats> {
    const access = await getBranchAccess(actor);
    const where: Prisma.ProductWhereInput = { ...branchFilter(access, branchId), isActive: true };
    const rows = await prisma.product.findMany({ where, select: { quantity: true, minQuantity: true, cost: true } });
    return {
      products: rows.length,
      stockValue: rows.reduce((sum, row) => sum + Math.round(row.quantity * row.cost.toNumber()), 0),
      lowStock: rows.filter((row) => row.minQuantity > 0 && row.quantity <= row.minQuantity && row.quantity > 0).length,
      outOfStock: rows.filter((row) => row.quantity === 0).length,
    };
  },

  async saveProduct(
    actor: AuthUser,
    input: { id?: string | undefined; sku: string; name: string; categoryId: string; unit: string; price: number; cost: number; minQuantity: number; isActive: boolean; note?: string | undefined },
    client: ClientInfo,
  ): Promise<ProductDto> {
    const access = await getBranchAccess(actor);
    const category = await prisma.productCategory.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
    if (!category) throw AppError.unprocessable('Turkum topilmadi', [{ field: 'categoryId', message: 'Turkumni tanlang' }]);

    if (input.id) {
      const existing = await prisma.product.findUnique({ where: { id: input.id }, select: { id: true, branchId: true, sku: true } });
      if (!existing) throw AppError.notFound('Mahsulot topilmadi');
      assertBranchAccess(access, existing.branchId);
    }

    const branchId = input.id
      ? (await prisma.product.findUniqueOrThrow({ where: { id: input.id }, select: { branchId: true } })).branchId
      : resolveBranchId(access);

    const duplicate = await prisma.product.findFirst({
      where: { branchId, sku: input.sku, ...(input.id ? { id: { not: input.id } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw AppError.conflict('Bu kod bilan mahsulot allaqachon bor', [{ field: 'sku', message: 'Kod band' }]);

    const data = {
      sku: input.sku,
      name: input.name,
      categoryId: input.categoryId,
      unit: input.unit,
      price: input.price,
      cost: input.cost,
      minQuantity: input.minQuantity,
      isActive: input.isActive,
      note: input.note ?? null,
    };

    const saved = await prisma.$transaction(async (tx) => {
      const record = input.id
        ? await tx.product.update({ where: { id: input.id }, data, select: productSelect })
        : await tx.product.create({ data: { ...data, branchId }, select: productSelect });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: input.id ? 'inventory.product_updated' : 'inventory.product_created',
        entityType: 'product',
        entityId: record.id,
        metadata: { sku: record.sku, name: record.name, price: data.price, cost: data.cost },
        ...client,
      });
      return record;
    });
    return toProductDto(saved);
  },

  async movements(
    actor: AuthUser,
    query: { page: number; limit: number; productId?: string | undefined; type?: StockMovementType | undefined },
  ): Promise<{ items: StockMovementDto[]; total: number }> {
    const access = await getBranchAccess(actor);
    const where: Prisma.StockMovementWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.type ? { type: query.type } : {}),
      product: branchFilter(access),
    };
    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({ where, select: movementSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query.page, query.limit) }),
      prisma.stockMovement.count({ where }),
    ]);
    return { items: items.map(toMovementDto), total };
  },

  /**
   * Ombor harakati. Chiqimda qoldiq yetmasa xato beriladi — minusga tushmaydi.
   * `money` berilsa, pul yozuvi ham yaratiladi (mavjud tushum/xarajat servisi orqali).
   */
  async move(actor: AuthUser, input: MovementInput, client: ClientInfo): Promise<StockMovementDto> {
    const access = await getBranchAccess(actor);
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, sku: true, name: true, branchId: true, quantity: true, price: true, cost: true },
    });
    if (!product) throw AppError.notFound('Mahsulot topilmadi');
    // Boshqa filial mahsuloti bilan ishlash mumkin emas
    assertBranchAccess(access, product.branchId);

    if (input.quantity <= 0) throw AppError.unprocessable('Miqdor noldan katta bo‘lsin', [{ field: 'quantity', message: 'Noto‘g‘ri miqdor' }]);

    // Ko'chirish bu yerdan yozilmaydi: bitta tomonlama yozuv qilinsa, tovar "yo'qolib qoladi"
    // (bir filialdan chiqdi, ikkinchisiga kirmadi). Shuning uchun faqat `transfer()` orqali —
    // u ikkala yozuvni bitta tranzaksiyada qiladi.
    if (input.type === 'TRANSFER_IN' || input.type === 'TRANSFER_OUT') {
      throw AppError.unprocessable('Ko‘chirish alohida amal orqali qilinadi', [
        { field: 'type', message: 'Filiallararo ko‘chirish uchun "Ko‘chirish" amalidan foydalaning' },
      ]);
    }

    const signed = input.type === 'ADJUSTMENT' && input.decrease ? -input.quantity : directionOf(input.type, input.quantity);
    const balanceAfter = product.quantity + signed;
    if (balanceAfter < 0) {
      throw AppError.unprocessable(`Omborda yetarli emas: ${product.quantity} ${product.name} qolgan`);
    }
    if ((input.type === 'SALE' || input.type === 'RETURN') && input.studentId) {
      const student = await prisma.student.findFirst({ where: { id: input.studentId, deletedAt: null }, select: { id: true } });
      if (!student) throw AppError.unprocessable('O‘quvchi topilmadi', [{ field: 'studentId', message: 'O‘quvchi topilmadi' }]);
    }

    // Narx ko'rsatilmasa: sotuvda sotish narxi, kirimda oxirgi tannarx
    const unitPrice = input.unitPrice ?? (input.type === 'SALE' ? product.price.toNumber() : product.cost.toNumber());
    const totalAmount = Math.round(unitPrice * input.quantity);

    // Pul yozuvi harakatdan oldin yaratiladi: u o'z tranzaksiyasida hisob va daftarni
    // yangilaydi, keyin ombor harakati unga bog'lanadi.
    let incomeId: string | null = null;
    let expenseId: string | null = null;
    if (input.money && totalAmount > 0) {
      const today = new Date().toISOString().slice(0, 10);
      if (input.type === 'SALE') {
        const income = await incomeService.create(
          actor,
          {
            categoryId: input.money.categoryId,
            amount: totalAmount,
            method: input.money.method,
            date: today,
            description: `${product.name} sotildi (${input.quantity} dona)`,
            ...(input.money.accountId ? { accountId: input.money.accountId } : {}),
            ...(input.studentId ? { studentId: input.studentId } : {}),
          } as never,
          client,
        );
        incomeId = income.id;
      } else if (input.type === 'PURCHASE') {
        const expense = await expenseService.create(
          actor,
          {
            categoryId: input.money.categoryId,
            amount: totalAmount,
            method: input.money.method,
            date: today,
            description: `${product.name} xarid qilindi (${input.quantity} dona)`,
            ...(input.money.accountId ? { accountId: input.money.accountId } : {}),
          } as never,
          client,
        );
        expenseId = expense.id;
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: input.type,
          quantity: input.quantity,
          balanceAfter,
          unitPrice,
          totalAmount,
          reason: input.reason ?? null,
          studentId: input.studentId ?? null,
          incomeId,
          expenseId,
          createdById: actor.id,
        },
        select: movementSelect,
      });
      await tx.product.update({
        where: { id: product.id },
        data: {
          quantity: balanceAfter,
          // Xaridda tannarx yangilanadi — keyingi hisob-kitoblar oxirgi narxdan boradi
          ...(input.type === 'PURCHASE' && input.unitPrice !== undefined ? { cost: input.unitPrice } : {}),
        },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'inventory.stock_moved',
        entityType: 'product',
        entityId: product.id,
        metadata: {
          movementId: record.id,
          type: input.type,
          quantity: input.quantity,
          balanceAfter,
          totalAmount,
          incomeId,
          expenseId,
        },
        ...client,
      });
      return record;
    });

    return toMovementDto(created);
  },

  /**
   * Filiallararo ko'chirish — **bitta tranzaksiyada ikkita yozuv**.
   *
   * Nega alohida amal: oddiy harakat orqali TRANSFER_OUT yozilsa, ikkinchi filialdagi kirim
   * unutilishi yoki xato tufayli yozilmay qolishi mumkin edi — tovar hisobdan "yo'qolardi".
   * Bu yerda chiqim, kirim va ikkala qoldiq bir vaqtda yoziladi: yo hammasi, yo hech nima.
   *
   * Qoidalar:
   *  - Xodim **ikkala filialni** ham ko'ra olishi kerak (aks holda o'zi ko'rmaydigan omborga
   *    tovar surib yuborishi mumkin bo'lardi).
   *  - Qabul qiluvchi filialda shu kodli (SKU) mahsulot bo'lmasa, **o'sha nom va turkum bilan**
   *    nol qoldiqda ochiladi — aks holda ko'chirish har safar qo'lda tayyorgarlik talab qilardi.
   *  - Pul yozuvi yaratilmaydi: markaz ichidagi harakat daromad ham, xarajat ham emas.
   *  - Mavjud mahsulotning tannarxi o'zgartirilmaydi — qabul qiluvchi filialning o'z xarid
   *    tarixi buzilmasin. Yangi ochilgan mahsulot jo'natuvchining tannarxini oladi.
   */
  async transfer(actor: AuthUser, input: TransferInput, client: ClientInfo): Promise<TransferResult> {
    const access = await getBranchAccess(actor);
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: {
        id: true,
        sku: true,
        name: true,
        branchId: true,
        quantity: true,
        cost: true,
        price: true,
        unit: true,
        categoryId: true,
        minQuantity: true,
        note: true,
      },
    });
    if (!product) throw AppError.notFound('Mahsulot topilmadi');
    assertBranchAccess(access, product.branchId);
    assertBranchAccess(access, input.toBranchId);

    if (input.toBranchId === product.branchId) {
      throw AppError.unprocessable('Filial bir xil', [{ field: 'toBranchId', message: 'Boshqa filialni tanlang' }]);
    }
    const target = await prisma.branch.findFirst({ where: { id: input.toBranchId, isActive: true }, select: { id: true, name: true } });
    if (!target) throw AppError.unprocessable('Filial topilmadi', [{ field: 'toBranchId', message: 'Filialni tanlang' }]);

    const unitPrice = product.cost.toNumber();
    const totalAmount = Math.round(unitPrice * input.quantity);

    const result = await prisma.$transaction(async (tx) => {
      // Qoldiq tranzaksiya ichida qayta o'qiladi: ikki xodim bir vaqtda ko'chirsa,
      // tashqarida o'qilgan qoldiq eskirgan bo'lishi mumkin.
      const source = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { quantity: true } });
      const outBalance = source.quantity - input.quantity;
      if (outBalance < 0) {
        throw AppError.unprocessable(`Omborda yetarli emas: ${source.quantity} ${product.name} qolgan`);
      }

      let destination = await tx.product.findFirst({
        where: { branchId: input.toBranchId, sku: product.sku },
        select: { id: true, quantity: true, isActive: true },
      });
      if (!destination) {
        destination = await tx.product.create({
          data: {
            branchId: input.toBranchId,
            sku: product.sku,
            name: product.name,
            categoryId: product.categoryId,
            unit: product.unit,
            price: product.price,
            cost: product.cost,
            minQuantity: product.minQuantity,
            note: product.note,
            quantity: 0,
          },
          select: { id: true, quantity: true, isActive: true },
        });
      }

      const outMovement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: 'TRANSFER_OUT',
          quantity: input.quantity,
          balanceAfter: outBalance,
          unitPrice,
          totalAmount,
          reason: input.reason ?? null,
          counterpartBranchId: input.toBranchId,
          createdById: actor.id,
        },
        select: movementSelect,
      });
      await tx.product.update({ where: { id: product.id }, data: { quantity: outBalance } });

      const inBalance = destination.quantity + input.quantity;
      const inMovement = await tx.stockMovement.create({
        data: {
          productId: destination.id,
          type: 'TRANSFER_IN',
          quantity: input.quantity,
          balanceAfter: inBalance,
          unitPrice,
          totalAmount,
          reason: input.reason ?? null,
          counterpartBranchId: product.branchId,
          createdById: actor.id,
        },
        select: movementSelect,
      });
      // Tovar kelgan mahsulot yopiq turgan bo‘lsa ochiladi — aks holda qoldiq ro'yxatda ko'rinmaydi
      await tx.product.update({
        where: { id: destination.id },
        data: { quantity: inBalance, ...(destination.isActive ? {} : { isActive: true }) },
      });

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'inventory.stock_transferred',
        entityType: 'product',
        entityId: product.id,
        metadata: {
          sku: product.sku,
          quantity: input.quantity,
          fromBranchId: product.branchId,
          toBranchId: input.toBranchId,
          toProductId: destination.id,
          outMovementId: outMovement.id,
          inMovementId: inMovement.id,
        },
        ...client,
      });

      return { out: outMovement, in: inMovement };
    });

    return { out: toMovementDto(result.out), in: toMovementDto(result.in) };
  },
};
