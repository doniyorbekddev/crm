-- CreateEnum
CREATE TYPE "KpiMetric" AS ENUM ('ACQUIRED_STUDENTS', 'LEAD_CONVERSION', 'PAYMENT_COLLECTION', 'ATTENDANCE_RATE', 'STUDENT_RETENTION', 'TASK_COMPLETION', 'MANUAL');

-- AlterEnum
ALTER TYPE "SalaryPeriodStatus" ADD VALUE 'UNDER_REVIEW';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "kpiBonusPool" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "teacher_salary_periods" ADD COLUMN     "kpiAchievement" DECIMAL(6,2),
ADD COLUMN     "kpiBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "kpiDetails" JSONB,
ADD COLUMN     "rejectReason" VARCHAR(255),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT,
ADD COLUMN     "warnings" JSONB;

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position" "EmployeePosition" NOT NULL,
    "metric" "KpiMetric" NOT NULL,
    "target" DECIMAL(14,2) NOT NULL,
    "weight" SMALLINT NOT NULL,
    "description" VARCHAR(500),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_manual_results" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "actual" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_manual_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_definitions_position_isActive_idx" ON "kpi_definitions"("position", "isActive");

-- CreateIndex
CREATE INDEX "kpi_manual_results_employeeId_year_month_idx" ON "kpi_manual_results"("employeeId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_manual_results_kpiId_employeeId_year_month_key" ON "kpi_manual_results"("kpiId", "employeeId", "year", "month");

-- AddForeignKey
ALTER TABLE "teacher_salary_periods" ADD CONSTRAINT "teacher_salary_periods_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_periods" ADD CONSTRAINT "teacher_salary_periods_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_manual_results" ADD CONSTRAINT "kpi_manual_results_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_manual_results" ADD CONSTRAINT "kpi_manual_results_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_manual_results" ADD CONSTRAINT "kpi_manual_results_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Noto'g'ri KPI sozlamasi bazaga tushmasin (validator ham tekshiradi)
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_weight_check" CHECK ("weight" BETWEEN 1 AND 100);
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_target_check" CHECK ("target" > 0);
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_effective_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "employees" ADD CONSTRAINT "employees_kpi_bonus_pool_check" CHECK ("kpiBonusPool" >= 0);
