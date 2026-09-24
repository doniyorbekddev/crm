-- PHASE 11 (2-qism): Audit 2.0 — oldingi/keyingi qiymatlar alohida ustunda.
--
-- Avval ba'zi servislar `metadata.before` / `metadata.after` ichiga yozardi. Endi ular alohida
-- ustunlarda: jurnalda farqni ko'rsatish va qidirish osonlashadi. Mavjud yozuvlardagi qiymatlar
-- yangi ustunlarga ko'chiriladi — ma'lumot yo'qolmaydi, metadata ham joyida qoladi.

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB;



-- ===== Ma'lumot: mavjud yozuvlardagi before/after ni ko'chirish =====
UPDATE "audit_logs"
SET "before" = "metadata" -> 'before'
WHERE "before" IS NULL AND "metadata" ? 'before';

UPDATE "audit_logs"
SET "after" = "metadata" -> 'after'
WHERE "after" IS NULL AND "metadata" ? 'after';
