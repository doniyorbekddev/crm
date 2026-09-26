-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "buttons" JSONB;

-- AlterTable
ALTER TABLE "telegram_broadcasts" ADD COLUMN     "buttons" JSONB,
ADD COLUMN     "mediaFileName" VARCHAR(200),
ADD COLUMN     "mediaPath" VARCHAR(255);

