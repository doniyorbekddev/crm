-- CreateEnum
CREATE TYPE "PositionEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'HOURLY');

-- CreateEnum
CREATE TYPE "EmploymentChangeType" AS ENUM ('HIRED', 'POSITION_CHANGED', 'DEPARTMENT_CHANGED', 'PROMOTED', 'STATUS_CHANGED', 'TERMINATED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "condition" VARCHAR(100);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "parentId" TEXT,
    "headUserId" TEXT,
    "monthlyExpenseLimit" DECIMAL(14,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" SMALLINT NOT NULL DEFAULT 0,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "departmentId" TEXT,
    "description" VARCHAR(2000),
    "employmentType" "PositionEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "probationMonths" SMALLINT NOT NULL DEFAULT 1,
    "nextPositionId" TEXT,
    "careerRequirements" VARCHAR(2000),
    "minimumKpiScore" SMALLINT,
    "minimumMonths" SMALLINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_responsibilities" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "expectedResult" VARCHAR(500),
    "sortOrder" SMALLINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_responsibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "userId" TEXT,
    "type" "EmploymentChangeType" NOT NULL,
    "positionKey" VARCHAR(40) NOT NULL,
    "positionTitle" VARCHAR(120) NOT NULL,
    "department" VARCHAR(100),
    "effectiveDate" DATE NOT NULL,
    "changeReason" VARCHAR(500),
    "approvedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departments_branchId_isActive_idx" ON "departments"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "departments_branchId_name_key" ON "departments"("branchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_key_key" ON "positions"("key");

-- CreateIndex
CREATE INDEX "positions_departmentId_idx" ON "positions"("departmentId");

-- CreateIndex
CREATE INDEX "position_responsibilities_positionId_sortOrder_idx" ON "position_responsibilities"("positionId", "sortOrder");

-- CreateIndex
CREATE INDEX "employment_history_employeeId_effectiveDate_idx" ON "employment_history"("employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "employment_history_userId_effectiveDate_idx" ON "employment_history"("userId", "effectiveDate");

-- CreateIndex
CREATE INDEX "employees_departmentId_idx" ON "employees"("departmentId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_nextPositionId_fkey" FOREIGN KEY ("nextPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_responsibilities" ADD CONSTRAINT "position_responsibilities_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Mavjud xodimlarning "Bo'lim" matnidan katalog bo'limlari yaratiladi va xodimlar ularga bog'lanadi.
-- Matn ustuni o'zgarmaydi (moslik uchun saqlanadi); bir xil nomdagi bo'lim bo'lsa — qayta yaratilmaydi.
INSERT INTO "departments" ("id", "name", "branchId", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'dep_' || md5(e."branchId" || ':' || trim(e."department")), trim(e."department"), e."branchId", true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "employees" e
WHERE e."department" IS NOT NULL AND trim(e."department") <> ''
GROUP BY e."branchId", trim(e."department")
ON CONFLICT ("branchId", "name") DO NOTHING;

UPDATE "employees" e
SET "departmentId" = d."id"
FROM "departments" d
WHERE e."departmentId" IS NULL AND d."branchId" = e."branchId" AND d."name" = trim(e."department");
