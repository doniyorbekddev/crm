-- Standart tushum/xarajat kategoriyalari: faqat bazada yo'q bo'lsa qo'shiladi.
-- Mavjud yozuvlarga tegilmaydi: kalit yoki nom (katta-kichik harfsiz) band bo'lsa — o'tkazib yuboriladi.
-- Bo'sh bazada (bootstrap ishga tushmagan) xarajat formasi "Kategoriya" ro'yxati bo'sh qolmasligi uchun.

INSERT INTO "expense_categories" ("id", "key", "name", "isSystem", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'expcat_' || lower(v.key), v.key, v.name, v.is_system, true, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('TEACHER_SALARY', 'O‘qituvchi maoshi', true, 1),
  ('RENT', 'Ijara', false, 2),
  ('ADVERTISEMENT', 'Reklama', false, 3),
  ('UTILITIES', 'Kommunal xizmatlar', false, 4),
  ('INTERNET', 'Internet', false, 5),
  ('EQUIPMENT', 'Jihozlar', false, 6),
  ('OFFICE', 'Ofis xarajatlari', false, 7),
  ('TAX', 'Soliq', false, 8),
  ('REPAIR', 'Ta’mirlash', false, 9),
  ('CLEANING', 'Tozalash', false, 10),
  ('OTHER_EXPENSE', 'Boshqa xarajat', false, 11)
) AS v(key, name, is_system, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "expense_categories" c
  WHERE c."key" = v.key OR lower(c."name") = lower(v.name)
)
ON CONFLICT DO NOTHING;

INSERT INTO "income_categories" ("id", "key", "name", "isSystem", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'inccat_' || lower(v.key), v.key, v.name, v.is_system, true, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('STUDENT_PAYMENT', 'O‘quvchi to‘lovi', true, 1),
  ('REGISTRATION', 'Ro‘yxatga olish', false, 2),
  ('BOOKS', 'Kitob va qo‘llanma', false, 3),
  ('UNIFORM', 'Forma', false, 4),
  ('OTHER_INCOME', 'Boshqa tushum', false, 5)
) AS v(key, name, is_system, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "income_categories" c
  WHERE c."key" = v.key OR lower(c."name") = lower(v.name)
)
ON CONFLICT DO NOTHING;
