-- O'quvchi telefoni ixtiyoriy: o'quvchi yoki ota-ona telefonidan kamida bittasi bo'lishi kifoya.
-- Mavjud yozuvlar o'zgarmaydi (hammasida telefon bor) — faqat NOT NULL olib tashlanadi va qoida bazada ham tekshiriladi.
ALTER TABLE "students" ALTER COLUMN "phone" DROP NOT NULL;

ALTER TABLE "students" ADD CONSTRAINT "students_phone_or_parent_phone_check" CHECK ("phone" IS NOT NULL OR "parentPhone" IS NOT NULL);
