-- =====================================================================
-- Filial (branch) poydevori — PHASE 1.5
--
-- Tartib muhim:
--   1. "branches" jadvali yaratiladi;
--   2. "Asosiy filial" (id = 'branch_main') yoziladi — ustunlarning DEFAULT
--      qiymati shunga ishora qiladi, shuning uchun u FK'dan oldin bo'lishi shart;
--   3. jadvallarga branchId ustuni DEFAULT bilan qo'shiladi — mavjud barcha
--      qatorlar avtomatik "Asosiy filial"ga biriktiriladi (ma'lumot yo'qolmaydi);
--   4. indekslar va tashqi kalitlar.
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(255),
    "phone" VARCHAR(32),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_key_key" ON "branches"("key");

-- Asosiy filial: mavjud barcha ma'lumot shunga biriktiriladi.
-- id barqaror ('branch_main') — sxemadagi @default shu qiymatga tayanadi,
-- shuning uchun u barcha muhitlarda (dev, test, e2e, production) bir xil bo'ladi.
INSERT INTO "branches" ("id", "key", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES ('branch_main', 'MAIN', 'Asosiy filial', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "incomes" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branchId" TEXT NOT NULL DEFAULT 'branch_main';

-- CreateIndex
CREATE INDEX "employees_branchId_idx" ON "employees"("branchId");

-- CreateIndex
CREATE INDEX "expenses_branchId_idx" ON "expenses"("branchId");

-- CreateIndex
CREATE INDEX "financial_accounts_branchId_idx" ON "financial_accounts"("branchId");

-- CreateIndex
CREATE INDEX "groups_branchId_idx" ON "groups"("branchId");

-- CreateIndex
CREATE INDEX "incomes_branchId_idx" ON "incomes"("branchId");

-- CreateIndex
CREATE INDEX "leads_branchId_idx" ON "leads"("branchId");

-- CreateIndex
CREATE INDEX "payments_branchId_idx" ON "payments"("branchId");

-- CreateIndex
CREATE INDEX "students_branchId_idx" ON "students"("branchId");

-- CreateIndex
CREATE INDEX "transactions_branchId_idx" ON "transactions"("branchId");

-- CreateIndex
CREATE INDEX "users_branchId_idx" ON "users"("branchId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
