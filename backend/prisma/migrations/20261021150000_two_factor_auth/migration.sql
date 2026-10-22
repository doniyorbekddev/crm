-- Ikki bosqichli kirish (TOTP): faqat qo'shimcha — standart o'chiq, mavjud kirish o'zgarmaydi
ALTER TABLE "users" ADD COLUMN "totpSecret" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "totpPendingSecret" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "totpLastStep" INTEGER;

CREATE TABLE "user_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_recovery_codes_codeHash_key" ON "user_recovery_codes"("codeHash");
CREATE INDEX "user_recovery_codes_userId_idx" ON "user_recovery_codes"("userId");

ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
