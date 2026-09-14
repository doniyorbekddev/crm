-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'CONVERSION_DROP';
ALTER TYPE "AlertType" ADD VALUE 'DROPOUT_INCREASE';
ALTER TYPE "AlertType" ADD VALUE 'CASH_SHORTAGE';
ALTER TYPE "AlertType" ADD VALUE 'PENDING_EXPENSE_APPROVAL';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DAILY_DIGEST';

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "readById" TEXT;

-- CreateIndex
CREATE INDEX "alerts_resolvedAt_readAt_idx" ON "alerts"("resolvedAt", "readAt");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_readById_fkey" FOREIGN KEY ("readById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- Ogohlantirish chegaralarini sozlash — faqat rahbar
-- ---------------------------------------------------------------------
INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES ('perm_alert_manage', 'alert.manage', 'alerts', 'Ogohlantirish qoidalari va chegaralarini, kunlik xulosani sozlash')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."key" IN ('SUPER_ADMIN', 'OWNER') AND p."key" = 'alert.manage'
ON CONFLICT DO NOTHING;
