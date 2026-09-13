-- CreateEnum
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('BONUS', 'PENALTY');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentCategory" AS ENUM ('ATTENDANCE', 'RETENTION', 'PERFORMANCE', 'MONTHLY', 'SPECIAL', 'LATENESS', 'ABSENCE', 'DISCIPLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryPaymentKind" AS ENUM ('SALARY', 'ADVANCE');

-- AlterTable
ALTER TABLE "teacher_salary_payments" ADD COLUMN     "kind" "SalaryPaymentKind" NOT NULL DEFAULT 'SALARY';

-- AlterTable
ALTER TABLE "teacher_salary_periods" ADD COLUMN     "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "modelBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unlockReason" VARCHAR(255),
ADD COLUMN     "unlockedAt" TIMESTAMP(3),
ADD COLUMN     "unlockedById" TEXT;

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "salaryPeriodId" TEXT NOT NULL,
    "type" "PayrollAdjustmentType" NOT NULL,
    "category" "PayrollAdjustmentCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "date" DATE NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_adjustments_salaryPeriodId_idx" ON "payroll_adjustments"("salaryPeriodId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_type_date_idx" ON "payroll_adjustments"("type", "date");

-- AddForeignKey
ALTER TABLE "teacher_salary_periods" ADD CONSTRAINT "teacher_salary_periods_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_salaryPeriodId_fkey" FOREIGN KEY ("salaryPeriodId") REFERENCES "teacher_salary_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Ma'lumotlarni ko'chirish — mavjud maosh raqamlari o'zgarmaydi
-- ---------------------------------------------------------------------

-- Qo'l tegmagan davrlarda bonus maosh modelidan kelgan: modelBonus sifatida belgilanadi
UPDATE "teacher_salary_periods"
SET "modelBonus" = "bonus"
WHERE "bonus" > 0
  AND NOT ("calculatedAt" IS NOT NULL AND "updatedAt" > "calculatedAt");

-- Qo'lda kiritilgan bonuslar alohida yozuvga aylanadi (tarix saqlanadi)
INSERT INTO "payroll_adjustments" ("id", "salaryPeriodId", "type", "category", "amount", "reason", "date", "approvedById", "approvedAt", "createdAt", "updatedAt")
SELECT 'adj_bonus_' || p."id", p."id", 'BONUS'::"PayrollAdjustmentType", 'SPECIAL'::"PayrollAdjustmentCategory", p."bonus",
       COALESCE(p."note", 'Oldingi tizimda qo‘lda kiritilgan bonus'), make_date(p."year", p."month", 1),
       p."approvedById", p."approvedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "teacher_salary_periods" AS p
WHERE p."bonus" > 0 AND p."calculatedAt" IS NOT NULL AND p."updatedAt" > p."calculatedAt";

-- Jarimalar faqat qo'lda kiritilgan — hammasi yozuvga aylanadi
INSERT INTO "payroll_adjustments" ("id", "salaryPeriodId", "type", "category", "amount", "reason", "date", "approvedById", "approvedAt", "createdAt", "updatedAt")
SELECT 'adj_penalty_' || p."id", p."id", 'PENALTY'::"PayrollAdjustmentType", 'OTHER'::"PayrollAdjustmentCategory", p."penalty",
       COALESCE(p."note", 'Oldingi tizimda qo‘lda kiritilgan jarima'), make_date(p."year", p."month", 1),
       p."approvedById", p."approvedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "teacher_salary_periods" AS p
WHERE p."penalty" > 0;

-- Tasdiqlangan maoshni qayta ochish ruxsati — faqat Super Admin va Owner
INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES ('perm_salary_unlock', 'salary.unlock', 'salary', 'Tasdiqlangan maoshni qayta ochish (sabab bilan)')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."key" IN ('SUPER_ADMIN', 'OWNER') AND p."key" = 'salary.unlock'
ON CONFLICT DO NOTHING;
