-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('UPCOMING', 'PENDING', 'APPROVED', 'REJECTED', 'PAID');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_APPROVAL';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "recurringExpenseId" TEXT,
ADD COLUMN     "recurringPeriod" VARCHAR(7),
ADD COLUMN     "rejectReason" VARCHAR(255),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "vendor" VARCHAR(150),
ALTER COLUMN "transactionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "accountId" TEXT,
    "vendor" VARCHAR(150),
    "dayOfMonth" SMALLINT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_expenses_isActive_idx" ON "recurring_expenses"("isActive");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_recurringExpenseId_recurringPeriod_key" ON "expenses"("recurringExpenseId", "recurringPeriod");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- Mavjud xarajatlar to'langan (status default PAID). Tasdiqlash ruxsati — faqat rahbar
-- ---------------------------------------------------------------------
INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES ('perm_expense_approve', 'expense.approve', 'finance', 'Katta xarajatni tasdiqlash / rad etish, tasdiq chegarasini belgilash')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."key" IN ('SUPER_ADMIN', 'OWNER') AND p."key" = 'expense.approve'
ON CONFLICT DO NOTHING;
