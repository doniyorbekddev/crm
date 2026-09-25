-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "branchId" VARCHAR(50);

-- CreateIndex
CREATE INDEX "alerts_branchId_resolvedAt_idx" ON "alerts"("branchId", "resolvedAt");

