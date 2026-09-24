-- Telegram bot PHASE 2: bog'lash kodi xavfsizligi.
--
-- Muammo: kod muddatsiz va bir martalik emas edi, `verifiedAt` esa tekshirilmasdi.
-- Kodni ko'rgan (masalan, ekran suratidan) boshqa chat o'zini bog'lab, foydalanuvchining
-- barcha bildirishnomalarini o'ziga burib yuborishi mumkin edi.
--
-- Yangi ustunlar: kod muddati, ishlatilgan vaqti, bog'lagan Telegram foydalanuvchisi
-- va oxirgi faollik.

-- AlterTable
ALTER TABLE "telegram_links" ADD COLUMN     "codeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "codeUsedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "telegramUserId" VARCHAR(64);


-- ===== Mavjud yozuvlarni xavfsiz holatga keltirish =====
-- Allaqachon bog'langanlar: kodi ishlatilgan deb belgilanadi, shunda u bilan
-- boshqa chat bog'lana olmaydi. Bog'lanishning o'zi va chat o'zgarmaydi.
UPDATE "telegram_links" SET "codeUsedAt" = "verifiedAt" WHERE "verifiedAt" IS NOT NULL;

-- Tasdiqlanmagan eski kodlar muddati o'tgan deb belgilanadi: ular CRM sahifasi
-- ochilganda avtomatik yangilanadi. Hech qanday yozuv o'chirilmaydi.
--
-- `now()` ATAYLAB ishlatilmaydi: ustun `TIMESTAMP` (mintaqasiz), Prisma esa uni UTC deb
-- o'qiydi. Baza mintaqasi UTC dan farq qilsa (masalan Asia/Tashkent), `now()` kodni
-- "eskirgan" emas, bir necha soat kelajakka qo'yib yuborardi. Aniq o'tmishdagi sana
-- hech qanday mintaqada chalkashmaydi.
UPDATE "telegram_links" SET "codeExpiresAt" = TIMESTAMP '1970-01-01 00:00:00'
 WHERE "verifiedAt" IS NULL AND "codeExpiresAt" IS NULL;
