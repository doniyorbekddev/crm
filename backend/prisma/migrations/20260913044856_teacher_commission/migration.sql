-- CreateEnum
CREATE TYPE "CommissionEntryKind" AS ENUM ('ACCRUAL', 'REVERSAL', 'CARRY_OVER');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "teacherId" TEXT;

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL,
    "sourceKey" VARCHAR(120) NOT NULL,
    "teacherId" TEXT NOT NULL,
    "paymentId" TEXT,
    "kind" "CommissionEntryKind" NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "salaryPeriodId" TEXT,
    "reason" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_sourceKey_key" ON "commission_entries"("sourceKey");

-- CreateIndex
CREATE INDEX "commission_entries_teacherId_year_month_idx" ON "commission_entries"("teacherId", "year", "month");

-- CreateIndex
CREATE INDEX "commission_entries_paymentId_idx" ON "commission_entries"("paymentId");

-- CreateIndex
CREATE INDEX "commission_entries_salaryPeriodId_idx" ON "commission_entries"("salaryPeriodId");

-- CreateIndex
CREATE INDEX "payments_teacherId_paidAt_idx" ON "payments"("teacherId", "paidAt");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_salaryPeriodId_fkey" FOREIGN KEY ("salaryPeriodId") REFERENCES "teacher_salary_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Ma'lumotlarni to'ldirish (backfill) — mavjud to'lovlar o'chirilmaydi
-- ---------------------------------------------------------------------

-- Mavjud to'lovlarga o'quvchining hozirgi guruhi va o'qituvchisi yoziladi.
-- Keyingi to'lovlarda qiymat to'lov paytida yoziladi (o'quvchi guruhini almashtirsa ham o'zgarmaydi).
UPDATE "payments" AS p
SET "groupId" = s."groupId",
    "teacherId" = g."teacherId"
FROM "students" AS s
LEFT JOIN "groups" AS g ON g."id" = s."groupId"
WHERE p."studentId" = s."id"
  AND p."groupId" IS NULL
  AND p."teacherId" IS NULL;

-- O'qituvchi o'z foiz daromadini ko'rishi uchun ruxsat (mavjud bazalarda seed rollarni qayta yozmaydi)
INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES ('perm_commission_view_own', 'commission.view_own', 'salary', 'O‘z foiz daromadini ko‘rish (o‘qituvchi)')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."key" = 'TEACHER' AND p."key" = 'commission.view_own'
ON CONFLICT DO NOTHING;
