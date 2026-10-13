-- Profil rasmi. Faqat qo'shimcha: yangi ixtiyoriy ustun, mavjud ma'lumot o'zgarmaydi.
ALTER TABLE "users" ADD COLUMN "avatarPath" VARCHAR(120);

CREATE UNIQUE INDEX "users_avatarPath_key" ON "users"("avatarPath");
