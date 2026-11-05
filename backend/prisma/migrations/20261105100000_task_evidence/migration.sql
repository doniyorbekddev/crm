-- Vazifa uchun bajarilganlik dalili (additive): mavjud vazifalarga tegilmaydi (evidenceRequired = false).


-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completionEvidence" VARCHAR(2000),
ADD COLUMN     "evidenceRequired" BOOLEAN NOT NULL DEFAULT false;

