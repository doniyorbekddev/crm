-- =====================================================================
-- Telegram bog'lanishi va yetkazish navbati — PHASE 4
--
--   1. DeliveryChannel / DeliveryStatus enumlari;
--   2. NotificationType ga CHILD_ABSENT va PAYMENT_DUE_SOON;
--   3. telegram_links — chat bog'lanishi (egasi: xodim, o'quvchi yoki ota-ona);
--   4. notification_deliveries — outbox: yuborish asosiy so'rovni kutdirmaydi,
--      xatolikda qayta urinish mumkin (nextAttemptAt bilan backoff).
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CHILD_ABSENT';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_DUE_SOON';

-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "chatId" VARCHAR(64),
    "linkCode" VARCHAR(32) NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "parentId" TEXT,
    "chatTitle" VARCHAR(150),
    "verifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" VARCHAR(200),
    "telegramLinkId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "lastError" VARCHAR(500),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_chatId_key" ON "telegram_links"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_linkCode_key" ON "telegram_links"("linkCode");

-- CreateIndex
CREATE INDEX "telegram_links_userId_idx" ON "telegram_links"("userId");

-- CreateIndex
CREATE INDEX "telegram_links_studentId_idx" ON "telegram_links"("studentId");

-- CreateIndex
CREATE INDEX "telegram_links_parentId_idx" ON "telegram_links"("parentId");

-- CreateIndex
CREATE INDEX "telegram_links_verifiedAt_idx" ON "telegram_links"("verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_dedupeKey_key" ON "notification_deliveries"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_nextAttemptAt_idx" ON "notification_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_notificationId_idx" ON "notification_deliveries"("notificationId");

-- CreateIndex
CREATE INDEX "notification_deliveries_createdAt_idx" ON "notification_deliveries"("createdAt");

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_telegramLinkId_fkey" FOREIGN KEY ("telegramLinkId") REFERENCES "telegram_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Egasi aynan bitta bo'lishi shart: xodim, o'quvchi yoki ota-ona
ALTER TABLE "telegram_links"
  ADD CONSTRAINT "telegram_links_owner_check"
  CHECK (num_nonnulls("userId", "studentId", "parentId") = 1);
