-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "idempotencyKey" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

