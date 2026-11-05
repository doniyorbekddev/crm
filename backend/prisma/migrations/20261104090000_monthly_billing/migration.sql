-- Oylik moliyaviy davrlar (additive): oy majburiyatini bekor qilish maydonlari va to'lovni oyga biriktirish jadvali.
-- Mavjud qismlar va to'lovlarga tegilmaydi (UPDATE/backfill yo'q).


-- AlterTable
ALTER TABLE "payment_installments" ADD COLUMN     "cancelReason" VARCHAR(255),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" SMALLINT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "refundId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_allocations_studentId_periodYear_periodMonth_idx" ON "payment_allocations"("studentId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_refundId_idx" ON "payment_allocations"("refundId");

-- CreateIndex
CREATE INDEX "payment_allocations_periodYear_periodMonth_idx" ON "payment_allocations"("periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "payment_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ma'lumot butunligi
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_period_month_check" CHECK ("periodMonth" BETWEEN 1 AND 12);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_check" CHECK ("amount" <> 0 AND ("refundId" IS NULL) = ("amount" > 0));
