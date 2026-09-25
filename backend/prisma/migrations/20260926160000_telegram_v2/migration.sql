-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "mediaFileId" VARCHAR(200),
ADD COLUMN     "mediaKind" VARCHAR(10);

-- AlterTable
ALTER TABLE "telegram_broadcasts" ADD COLUMN     "mediaFileId" VARCHAR(200),
ADD COLUMN     "mediaKind" VARCHAR(10);

-- AlterTable
ALTER TABLE "telegram_links" ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;

