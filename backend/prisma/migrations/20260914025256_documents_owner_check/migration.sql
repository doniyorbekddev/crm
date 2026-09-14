-- Hujjat endi xarajat yoki tushumga ham tegishli bo'lishi mumkin (chek, hisob-faktura).
-- Eski qoida (lead yoki o'quvchi) kengaytiriladi: kamida bitta egasi bo'lishi shart — mavjud yozuvlar buzilmaydi.
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_owner_check";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_owner_check"
  CHECK (num_nonnulls("leadId", "studentId", "expenseId", "incomeId") >= 1);
