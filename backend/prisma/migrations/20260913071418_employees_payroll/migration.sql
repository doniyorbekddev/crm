-- CreateEnum
CREATE TYPE "EmployeePosition" AS ENUM ('ADMINISTRATOR', 'MANAGER', 'SALES_MANAGER', 'CALL_CENTER', 'ACCOUNTANT', 'CLEANER', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED');

-- AlterTable
ALTER TABLE "teacher_salary_periods" ADD COLUMN     "employeeId" TEXT,
ALTER COLUMN "teacherProfileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(32),
    "position" "EmployeePosition" NOT NULL,
    "baseSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" DATE NOT NULL,
    "terminationDate" DATE,
    "note" VARCHAR(500),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_position_idx" ON "employees"("position");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_salary_periods_employeeId_year_month_key" ON "teacher_salary_periods"("employeeId", "year", "month");

-- AddForeignKey
ALTER TABLE "teacher_salary_periods" ADD CONSTRAINT "teacher_salary_periods_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- Butunlik: har bir maosh davri aynan bitta to'lov oluvchiga tegishli
-- ---------------------------------------------------------------------
ALTER TABLE "teacher_salary_periods"
  ADD CONSTRAINT "teacher_salary_periods_single_payee_check"
  CHECK ((("teacherProfileId" IS NOT NULL)::int + ("employeeId" IS NOT NULL)::int) = 1);

-- Xodimlar ruxsatlari
INSERT INTO "permissions" ("id", "key", "module", "description") VALUES
  ('perm_employee_view', 'employee.view', 'employees', 'Xodimlar (HR) ro‘yxatini ko‘rish'),
  ('perm_employee_manage', 'employee.manage', 'employees', 'Xodim qo‘shish, tahrirlash, holatini o‘zgartirish')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE (r."key" IN ('SUPER_ADMIN', 'OWNER', 'ADMIN') AND p."key" IN ('employee.view', 'employee.manage'))
   OR (r."key" = 'ACCOUNTANT' AND p."key" = 'employee.view')
ON CONFLICT DO NOTHING;
