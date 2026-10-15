-- Leadda ikkinchi raqam — ota-ona telefoni; lead telefoni ixtiyoriy, lekin kamida bittasi bo'lishi shart.
-- Mavjud yozuvlar o'zgarmaydi (hammasida telefon bor).
ALTER TABLE "leads" ADD COLUMN "parentPhone" VARCHAR(32);
ALTER TABLE "leads" ALTER COLUMN "phone" DROP NOT NULL;

CREATE INDEX "leads_parentPhone_idx" ON "leads"("parentPhone");

ALTER TABLE "leads" ADD CONSTRAINT "leads_phone_or_parent_phone_check" CHECK ("phone" IS NOT NULL OR "parentPhone" IS NOT NULL);
