-- SMS (Eskiz.uz) zaxira kanali: faqat qo'shimcha — mavjud yozuvlar o'zgarmaydi
ALTER TYPE "DeliveryChannel" ADD VALUE IF NOT EXISTS 'SMS';

ALTER TABLE "notification_deliveries" ADD COLUMN "phone" VARCHAR(20);
ALTER TABLE "notification_deliveries" ADD COLUMN "providerMessageId" VARCHAR(64);

-- Kunlik SMS limiti va statistika uchun
CREATE INDEX "notification_deliveries_channel_status_sentAt_idx" ON "notification_deliveries"("channel", "status", "sentAt");
