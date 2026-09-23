-- PHASE 8 (2-qism): HR — mehnat shartnomasi, bo'lim, maxfiy ma'lumot va ta'til.
--
-- Employee ga qo'shiladi: email, bo'lim, shartnoma (raqam va muddat), hamda maxfiy maydonlar
-- (tug'ilgan sana, manzil, pasport, favqulodda aloqa) — ular `employee.sensitive` ruxsati
-- bo'lmagan xodimga javobda qaytarilmaydi.
--
-- `employee_leaves` — ta'til arizalari. Tasdiqlangan ta'til xodim holatini o'zgartirmaydi:
-- "bugun ta'tilda" javobi sanalardan hisoblanadi.
--
-- Mavjud ma'lumot o'chirilmaydi: barcha ustunlar yangi va NULL qiymat bilan qo'shiladi.

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'UNPAID', 'MATERNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "address" VARCHAR(255),
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "contractEndDate" DATE,
ADD COLUMN     "contractNumber" VARCHAR(50),
ADD COLUMN     "contractStartDate" DATE,
ADD COLUMN     "department" VARCHAR(100),
ADD COLUMN     "email" VARCHAR(255),
ADD COLUMN     "emergencyContact" VARCHAR(120),
ADD COLUMN     "emergencyPhone" VARCHAR(32),
ADD COLUMN     "passportNumber" VARCHAR(32);

-- CreateTable
CREATE TABLE "employee_leaves" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" SMALLINT NOT NULL,
    "reason" VARCHAR(255),
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_leaves_employeeId_startDate_idx" ON "employee_leaves"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "employee_leaves_status_startDate_idx" ON "employee_leaves"("status", "startDate");

-- CreateIndex
CREATE INDEX "employee_leaves_startDate_endDate_idx" ON "employee_leaves"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "employees_contractNumber_key" ON "employees"("contractNumber");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_contractEndDate_idx" ON "employees"("contractEndDate");

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ===== Cheklovlar =====
-- Ta'til oxiri boshidan oldin bo'lmaydi va kunlar soni musbat
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_range_check"
  CHECK ("endDate" >= "startDate" AND "days" > 0);
-- Shartnoma tugashi boshlanishidan oldin bo'lmaydi
ALTER TABLE "employees" ADD CONSTRAINT "employees_contract_range_check"
  CHECK ("contractEndDate" IS NULL OR "contractStartDate" IS NULL OR "contractEndDate" >= "contractStartDate");
