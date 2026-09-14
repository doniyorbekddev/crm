-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "incomeId" TEXT,
ADD COLUMN     "sha256" VARCHAR(64);

-- CreateIndex
CREATE INDEX "documents_expenseId_idx" ON "documents"("expenseId");

-- CreateIndex
CREATE INDEX "documents_incomeId_idx" ON "documents"("incomeId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "incomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

