-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'PAYMENT_OVERDUE';

-- CreateTable
CREATE TABLE "payment_installments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sequence" SMALLINT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_installments_studentId_dueDate_idx" ON "payment_installments"("studentId", "dueDate");

-- CreateIndex
CREATE INDEX "payment_installments_dueDate_idx" ON "payment_installments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payment_installments_studentId_sequence_key" ON "payment_installments"("studentId", "sequence");

-- AddForeignKey
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Qism summasi musbat bo'lsin
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_amount_positive" CHECK ("amount" > 0);
