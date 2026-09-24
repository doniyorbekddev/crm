-- Telegram bot PHASE 1: poydevor.
--
-- `telegram_sessions` — ko'p qadamli oqim holati (davomat olish, ommaviy xabar).
-- Telegram suhbat holatini saqlamaydi, shuning uchun "qayerda to'xtaganimiz" shu yerda turadi.
-- Yozuv muddatli: yarim qolgan oqim abadiy osilib qolmaydi.
--
-- `telegram_events` — kiruvchi update jurnali. Chiquvchi xabarlar `notification_deliveries`
-- da yozilardi, kiruvchilari esa hech qayerda — "bot javob bermadi" degan shikoyatni
-- tekshirib bo'lmasdi. Foydalanuvchi matni **saqlanmaydi**: faqat buyruq nomi va holati.
--
-- Ikkala jadval ham yangi va bo'sh boshlanadi; mavjud ma'lumotga tegilmaydi.

-- CreateEnum
CREATE TYPE "TelegramEventStatus" AS ENUM ('OK', 'IGNORED', 'THROTTLED', 'FAILED');

-- CreateTable
CREATE TABLE "telegram_sessions" (
    "chatId" VARCHAR(64) NOT NULL,
    "flow" VARCHAR(50) NOT NULL,
    "step" VARCHAR(50) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_sessions_pkey" PRIMARY KEY ("chatId")
);

-- CreateTable
CREATE TABLE "telegram_events" (
    "id" TEXT NOT NULL,
    "chatId" VARCHAR(64),
    "telegramUserId" VARCHAR(64),
    "kind" VARCHAR(30) NOT NULL,
    "action" VARCHAR(100),
    "status" "TelegramEventStatus" NOT NULL DEFAULT 'OK',
    "error" VARCHAR(500),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_sessions_expiresAt_idx" ON "telegram_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "telegram_events_chatId_createdAt_idx" ON "telegram_events"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "telegram_events_createdAt_idx" ON "telegram_events"("createdAt");

