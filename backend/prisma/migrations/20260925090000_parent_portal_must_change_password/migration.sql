-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_REPORT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

