-- =====================================================================
-- O'quv xonalari va jadval konflikti — PHASE 5
--
--   1. rooms — xona (filialga bog'langan, kalit filial ichida unikal);
--   2. groups.roomId — guruh qaysi xonada; eski matnli `room` ustuni
--      saqlanadi va o'chirilmaydi (mos kelish uchun).
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "roomId" TEXT;

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "capacity" SMALLINT NOT NULL DEFAULT 15,
    "equipment" TEXT[],
    "note" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rooms_branchId_isActive_idx" ON "rooms"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_branchId_key_key" ON "rooms"("branchId", "key");

-- CreateIndex
CREATE INDEX "groups_roomId_idx" ON "groups"("roomId");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Sig'im musbat bo'lishi shart
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_capacity_check" CHECK ("capacity" > 0);
