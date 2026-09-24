-- PHASE 11 (1-qism): avtomatlashtirish dvigateli.
--
-- `automation_rules` — sozlanadigan qoidalar (masalan "2 marta kelmasa — xabar bering"),
-- `automation_runs` — har bir yurish: nechta holat topilgani, nechta xabar yuborilgani va
-- xatolik bo'lsa sababi. Takroriy bildirishnoma `dedupeKey` orqali oldini olinadi.
--
-- Mavjud ma'lumotga ta'sir qilmaydi: faqat yangi jadvallar.

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('STUDENT_ABSENT_STREAK', 'PAYMENT_DUE_SOON', 'PAYMENT_OVERDUE', 'STUDENT_RISK_CRITICAL', 'FOLLOWUP_OVERDUE', 'STOCK_BELOW_MIN', 'CERTIFICATE_ELIGIBLE');

-- CreateEnum
CREATE TYPE "AutomationAudience" AS ENUM ('STAFF', 'RESPONSIBLE', 'STUDENT', 'PARENT');

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "trigger" "AutomationTrigger" NOT NULL,
    "audience" "AutomationAudience" NOT NULL DEFAULT 'STAFF',
    "params" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastMatched" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "notified" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(500),

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_rules_key_key" ON "automation_rules"("key");

-- CreateIndex
CREATE INDEX "automation_rules_isActive_trigger_idx" ON "automation_rules"("isActive", "trigger");

-- CreateIndex
CREATE INDEX "automation_runs_ruleId_startedAt_idx" ON "automation_runs"("ruleId", "startedAt");

-- CreateIndex
CREATE INDEX "automation_runs_startedAt_idx" ON "automation_runs"("startedAt");

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ===== Ma'lumot: standart qoidalar (o'chirib qo'yish mumkin) =====
INSERT INTO "automation_rules" ("id", "key", "name", "description", "trigger", "audience", "params", "isActive", "createdAt", "updatedAt")
VALUES
  ('arule_absent',  'absent_streak',   'Ketma-ket kelmagan o''quvchi',  'O''quvchi ketma-ket 2 marta darsga kelmasa xodimlarga xabar', 'STUDENT_ABSENT_STREAK', 'STAFF',       '{"absences": 2}', true, NOW(), NOW()),
  ('arule_due',     'payment_due',     'To''lov muddati yaqinlashdi',   'Muddatga 3 kun qolganda o''quvchi va ota-onaga eslatma',      'PAYMENT_DUE_SOON',      'PARENT',      '{"daysBefore": 3}', true, NOW(), NOW()),
  ('arule_overdue', 'payment_overdue', 'To''lov muddati o''tdi',        'Muddat o''tganda mas''ul xodimlarga xabar',                   'PAYMENT_OVERDUE',       'STAFF',       '{"minDaysOverdue": 1}', true, NOW(), NOW()),
  ('arule_risk',    'risk_critical',   'Kritik xavfdagi o''quvchi',     'Xavf darajasi kritik bo''lganda adminlarga xabar',            'STUDENT_RISK_CRITICAL', 'STAFF',       '{}', true, NOW(), NOW()),
  ('arule_followup','followup_overdue','Kechikkan follow-up',           'Mas''ul xodimga o''z kechikkan aloqalari haqida xabar',       'FOLLOWUP_OVERDUE',      'RESPONSIBLE', '{"minHoursOverdue": 24}', true, NOW(), NOW()),
  ('arule_stock',   'stock_low',       'Omborda kam qoldi',             'Mahsulot chegaradan kam qolganda xabar',                     'STOCK_BELOW_MIN',       'STAFF',       '{}', true, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- ===== Cheklovlar =====
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_counts_check"
  CHECK ("matched" >= 0 AND "notified" >= 0 AND "skipped" >= 0);
