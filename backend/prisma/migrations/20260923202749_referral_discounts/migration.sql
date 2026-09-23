-- PHASE 7 (2-qism): referal tizimi va chegirma dvigateli.
--
-- Qo'shiladi:
--   * discount_rules  — chegirma qoidalari katalogi (oila, referal, promo, oldindan to'lov, ...)
--   * promo_codes     — qoidaga ishlovchi kodlar, ishlatilish limiti bilan
--   * student_discounts — o'quvchiga berilgan chegirma; qiymatlar nusxa sifatida muzlatiladi va
--     yozuv o'chirilmaydi (bekor qilinadi), shunda shartnoma narxi tarixi saqlanadi
--   * referrals       — kim kimni taklif qilgani; bonus xodim tomonidan aniq beriladi
--   * students.referralCode (R00045) va students.discountTotal (faol chegirmalar yig'indisi)
--
-- Mavjud ma'lumot o'chirilmaydi: barcha ustunlar yangi va NULL/0 qiymat bilan qo'shiladi,
-- referral kodlar mavjud o'quvchilarga raqamidan hosil qilib to'ldiriladi.

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FAMILY', 'REFERRAL', 'PROMO_CODE', 'PREPAY_3', 'PREPAY_6', 'FIRST_PAYMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONVERTED', 'REWARDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "referralCode" VARCHAR(16);

-- CreateTable
CREATE TABLE "discount_rules" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "DiscountType" NOT NULL,
    "valueType" "DiscountValueType" NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(14,2) NOT NULL,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" SMALLINT NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "description" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "ruleId" TEXT NOT NULL,
    "usageLimit" SMALLINT NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_discounts" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ruleId" TEXT,
    "promoCodeId" TEXT,
    "label" VARCHAR(120) NOT NULL,
    "type" "DiscountType" NOT NULL,
    "valueType" "DiscountValueType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(255),
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" VARCHAR(255),

    CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerStudentId" TEXT NOT NULL,
    "leadId" TEXT,
    "referredStudentId" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "bonusAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonusDiscountId" TEXT,
    "rewardedById" TEXT,
    "rewardedAt" TIMESTAMP(3),
    "note" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_rules_key_key" ON "discount_rules"("key");

-- CreateIndex
CREATE INDEX "discount_rules_isActive_sortOrder_idx" ON "discount_rules"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "discount_rules_type_idx" ON "discount_rules"("type");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_isActive_idx" ON "promo_codes"("isActive");

-- CreateIndex
CREATE INDEX "student_discounts_studentId_revokedAt_idx" ON "student_discounts"("studentId", "revokedAt");

-- CreateIndex
CREATE INDEX "student_discounts_type_idx" ON "student_discounts"("type");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_leadId_key" ON "referrals"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredStudentId_key" ON "referrals"("referredStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_bonusDiscountId_key" ON "referrals"("bonusDiscountId");

-- CreateIndex
CREATE INDEX "referrals_referrerStudentId_status_idx" ON "referrals"("referrerStudentId", "status");

-- CreateIndex
CREATE INDEX "referrals_status_createdAt_idx" ON "referrals"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "students_referralCode_key" ON "students"("referralCode");

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "discount_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "discount_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerStudentId_fkey" FOREIGN KEY ("referrerStudentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredStudentId_fkey" FOREIGN KEY ("referredStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_bonusDiscountId_fkey" FOREIGN KEY ("bonusDiscountId") REFERENCES "student_discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_rewardedById_fkey" FOREIGN KEY ("rewardedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ===== Ma'lumot: mavjud o'quvchilarga taklif kodi =====
-- Kod raqamdan hosil bo'ladi (ST-45 -> R00045), shuning uchun takrorlanmaydi.
UPDATE "students" SET "referralCode" = 'R' || LPAD("number"::text, 5, '0') WHERE "referralCode" IS NULL;

-- ===== Ma'lumot: standart chegirma qoidalari =====
-- Markaz keyin tahrirlaydi yoki o'chirib qo'yadi; kalit bo'yicha takror yaratilmaydi.
INSERT INTO "discount_rules" ("id", "key", "name", "type", "valueType", "value", "stackable", "priority", "isActive", "sortOrder", "description", "createdAt", "updatedAt")
VALUES
  ('drule_family',    'family',        'Oila chegirmasi',              'FAMILY',        'PERCENT', 10, true,  10, true, 10, 'Aka-uka yoki opa-singil birga o''qisa', NOW(), NOW()),
  ('drule_referral',  'referral',      'Do''st taklif qilgani uchun',  'REFERRAL',      'PERCENT', 5,  true,  20, true, 20, 'Taklif qilgan o''quvchiga beriladigan bonus', NOW(), NOW()),
  ('drule_prepay3',   'prepay_3',      '3 oylik oldindan to''lov',     'PREPAY_3',      'PERCENT', 5,  false, 30, true, 30, '3 oylik summa bir yo''la to''langanda', NOW(), NOW()),
  ('drule_prepay6',   'prepay_6',      '6 oylik oldindan to''lov',     'PREPAY_6',      'PERCENT', 10, false, 31, true, 31, '6 oylik summa bir yo''la to''langanda', NOW(), NOW()),
  ('drule_first',     'first_payment', 'Birinchi to''lov chegirmasi',  'FIRST_PAYMENT', 'PERCENT', 5,  true,  40, true, 40, 'Birinchi oy uchun', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- ===== Cheklovlar: noto'g'ri qiymat bazaga yozilmasin =====
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_value_check"
  CHECK ("value" >= 0 AND ("valueType" <> 'PERCENT' OR "value" <= 100));
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_priority_check" CHECK ("priority" >= 0);
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_usage_check" CHECK ("usageLimit" >= 0 AND "usedCount" >= 0);
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_value_check"
  CHECK ("value" >= 0 AND "amount" >= 0 AND ("valueType" <> 'PERCENT' OR "value" <= 100));
ALTER TABLE "students" ADD CONSTRAINT "students_discount_total_check" CHECK ("discountTotal" >= 0);
-- O'quvchi o'zini o'zi taklif qila olmaydi
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_self_check"
  CHECK ("referredStudentId" IS NULL OR "referredStudentId" <> "referrerStudentId");
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_bonus_check" CHECK ("bonusAmount" >= 0);
