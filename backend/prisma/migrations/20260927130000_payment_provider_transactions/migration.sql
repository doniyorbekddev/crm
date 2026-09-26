-- CreateTable
CREATE TABLE "payment_provider_transactions" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "provider" "PaymentProviderKey" NOT NULL,
    "providerTxId" VARCHAR(64) NOT NULL,
    "providerRef" VARCHAR(64),
    "intentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "state" SMALLINT NOT NULL,
    "providerTime" BIGINT,
    "performedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reason" SMALLINT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_provider_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_transactions_number_key" ON "payment_provider_transactions"("number");

-- CreateIndex
CREATE INDEX "payment_provider_transactions_intentId_idx" ON "payment_provider_transactions"("intentId");

-- CreateIndex
CREATE INDEX "payment_provider_transactions_provider_createdAt_idx" ON "payment_provider_transactions"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_transactions_provider_providerTxId_key" ON "payment_provider_transactions"("provider", "providerTxId");

-- AddForeignKey
ALTER TABLE "payment_provider_transactions" ADD CONSTRAINT "payment_provider_transactions_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

