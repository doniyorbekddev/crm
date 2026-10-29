-- "Boshqa" tanlanganda markaz o'zi yozadigan nomlar. Faqat qo'shimcha nullable ustunlar — mavjud ma'lumot o'zgarmaydi.
ALTER TABLE "courses" ADD COLUMN "categoryLabel" VARCHAR(60);
ALTER TABLE "student_parents" ADD COLUMN "relationLabel" VARCHAR(40);
ALTER TABLE "employees" ADD COLUMN "positionTitle" VARCHAR(80);
