-- PHASE 14: onlayn to'lov arxitekturasi (provayder abstraksiyasi).
--
-- `payment_intents` — provayder bilan yozishmaning hayot tsikli: so'rov yaratildi → kutilmoqda →
-- to'landi/bekor qilindi. `Payment` esa faqat pul **kelganida** yaratiladi, shuning uchun ikkisi
-- alohida. `(provider, externalId)` unikal — webhook ikki marta kelsa ikkinchi kvitansiya yozilmaydi.
--
-- Mavjud ma'lumotga ta'sir qilmaydi: faqat yangi jadval va enumlar.

-- CreateEnum
CREATE TYPE "PaymentProviderKey" AS ENUM ('CLICK', 'PAYME', 'UZUM', 'SANDBOX');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProviderKey" NOT NULL,
    "externalId" VARCHAR(120) NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "payload" JSONB,
    "failureText" VARCHAR(255),
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_paymentId_key" ON "payment_intents"("paymentId");

-- CreateIndex
CREATE INDEX "payment_intents_studentId_createdAt_idx" ON "payment_intents"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_intents_status_createdAt_idx" ON "payment_intents"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_provider_externalId_key" ON "payment_intents"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ===== Cheklovlar =====
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_amount_check" CHECK ("amount" > 0);
-- To'langan so'rovda kvitansiya va sana bo'lishi shart
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_paid_check"
  CHECK ("status" <> 'PAID' OR ("paymentId" IS NOT NULL AND "paidAt" IS NOT NULL));
