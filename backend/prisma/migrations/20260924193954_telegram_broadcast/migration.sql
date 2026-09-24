-- Telegram bot PHASE 9: ommaviy xabar (broadcast).
--
-- `telegram_broadcasts` — kim, kimga, nima yuborgani. Xabarning o'zi mavjud yetkazish
-- navbati orqali ketadi; `notification_deliveries.broadcastId` statistika uchun.
-- Yangi jadval va ixtiyoriy ustun — mavjud ma'lumot o'zgarmaydi.

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF', 'GROUP', 'COURSE');

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "broadcastId" TEXT;

-- CreateTable
CREATE TABLE "telegram_broadcasts" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "audience" "BroadcastAudience" NOT NULL,
    "targetId" VARCHAR(50),
    "label" VARCHAR(150) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_broadcasts_createdAt_idx" ON "telegram_broadcasts"("createdAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_broadcastId_idx" ON "notification_deliveries"("broadcastId");

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "telegram_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_broadcasts" ADD CONSTRAINT "telegram_broadcasts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

