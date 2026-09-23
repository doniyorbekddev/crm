-- =====================================================================
-- Lead scoring va avtomatik taqsimot — PHASE 7 (1-qism)
--
--   leads.score / temperature / scoreFactors — qiziqish bahosi va sabablari;
--   lead_assignment_rules — weighted round-robin qoidalari (vazn, kunlik limit).
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('COLD', 'WARM', 'HOT', 'VERY_HOT');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "score" SMALLINT,
ADD COLUMN     "scoreFactors" JSONB,
ADD COLUMN     "scoreUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "temperature" "LeadTemperature";

-- CreateTable
CREATE TABLE "lead_assignment_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weight" SMALLINT NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" SMALLINT NOT NULL DEFAULT 0,
    "lastAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_assignment_rules_userId_key" ON "lead_assignment_rules"("userId");

-- CreateIndex
CREATE INDEX "lead_assignment_rules_isActive_idx" ON "lead_assignment_rules"("isActive");

-- CreateIndex
CREATE INDEX "leads_temperature_status_idx" ON "leads"("temperature", "status");

-- AddForeignKey
ALTER TABLE "lead_assignment_rules" ADD CONSTRAINT "lead_assignment_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Vazn va limit manfiy bo'lmasligi kerak
ALTER TABLE "lead_assignment_rules" ADD CONSTRAINT "lead_assignment_rules_weight_check" CHECK ("weight" > 0 AND "dailyLimit" >= 0);
ALTER TABLE "leads" ADD CONSTRAINT "leads_score_check" CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 100);
