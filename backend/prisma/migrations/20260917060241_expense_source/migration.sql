-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "sourceId" TEXT;

-- CreateIndex
CREATE INDEX "expenses_sourceId_spentAt_idx" ON "expenses"("sourceId", "spentAt");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

