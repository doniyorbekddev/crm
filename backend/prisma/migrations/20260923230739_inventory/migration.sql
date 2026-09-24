-- PHASE 9 (1-qism): inventar (ombor).
--
-- `product_categories`, `products`, `stock_movements` qo'shiladi. Harakat yozuvlari hech qachon
-- o'chirilmaydi — xato teskari harakat bilan tuzatiladi (moliyaviy daftar bilan bir xil tamoyil).
-- Mahsulot qoldig'i (`products.quantity`) har harakatda bitta tranzaksiyada yangilanadi.
--
-- Mavjud ma'lumotga ta'sir qilmaydi: faqat yangi jadvallar.

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'DAMAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'dona',
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" SMALLINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500),
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" VARCHAR(255),
    "studentId" TEXT,
    "counterpartBranchId" TEXT,
    "incomeId" TEXT,
    "expenseId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_key_key" ON "product_categories"("key");

-- CreateIndex
CREATE INDEX "product_categories_isActive_sortOrder_idx" ON "product_categories"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "products_branchId_isActive_idx" ON "products"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_quantity_idx" ON "products"("quantity");

-- CreateIndex
CREATE UNIQUE INDEX "products_branchId_sku_key" ON "products"("branchId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_incomeId_key" ON "stock_movements"("incomeId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_expenseId_key" ON "stock_movements"("expenseId");

-- CreateIndex
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_type_createdAt_idx" ON "stock_movements"("type", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_createdAt_idx" ON "stock_movements"("createdAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ===== Ma'lumot: standart turkumlar =====
INSERT INTO "product_categories" ("id", "key", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('pcat_books',     'books',     'Kitoblar',        true, 10, NOW(), NOW()),
  ('pcat_uniform',   'uniform',   'Forma',           true, 20, NOW(), NOW()),
  ('pcat_stationery','stationery','Kantselyariya',   true, 30, NOW(), NOW()),
  ('pcat_tech',      'tech',      'Texnika',         true, 40, NOW(), NOW()),
  ('pcat_other',     'other',     'Boshqa',          true, 90, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- ===== Cheklovlar =====
ALTER TABLE "products" ADD CONSTRAINT "products_amounts_check"
  CHECK ("price" >= 0 AND "cost" >= 0 AND "quantity" >= 0 AND "minQuantity" >= 0);
-- Harakat miqdori har doim musbat, yo'nalishni tur belgilaydi
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_check"
  CHECK ("quantity" > 0 AND "balanceAfter" >= 0 AND "unitPrice" >= 0 AND "totalAmount" >= 0);
