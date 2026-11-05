# ORG System — texnik spetsifikatsiya (ijro)

Asl hujjat — **"ORG SYSTEM — TECHNICAL SPECIFICATION v1.0"** (repoda `ORG-SYSTEM-TECHNICAL-SPECIFICATION.md`, gitga kiritilmaydi).
Spetsifikatsiya "mos model bo'lsa — kengaytirish" talab qiladi; shu qoida bo'yicha yangi CRM yaratilmagan.

| § | Spetsifikatsiya | Ijro |
|---|---|---|
| 3 | Arxitektura qoidalari | Mavjud CRM ichida modul; mavjud auth/ruxsat; migratsiyalar faqat qo'shadi; vaqt — Asia/Tashkent |
| 4 | Modul tuzilmasi | Menyu "Tashkilot" bo'limi + Xodimlar, Xodimlar davomati, Vazifalar, Maosh, KPI, Audit |
| 5 | Ma'lumot modeli | 01-DATABASE-MAP: Employee/User, Department, Position + PositionResponsibility, EmploymentHistory, StaffAttendance*, StaffWorkSchedule, Task, EmployeeLeave + StaffPermissionRequest, Complaint, KpiDefinition/KpiManualResult, maosh davrlari, Asset/AssetEvent, KnowledgeArticle(+Version), Position.nextPosition (karyera), AuditLog |
| 5.8 | Ruxsat doirasi (own/department/all) | Filial doirasi, o'qituvchi — o'z guruhlari, "o'zim" (o'z davomati, so'rovlari, vazifalari). Bo'lim doirasi — hozircha kerak emas (hamma CEOga hisobot beradi) |
| 5.9 | QR: qisqa muddatli, bir martalik, replay himoyasi | Token 60 s, faqat SHA-256 xeshi, bir martalik, filial tekshiruvi |
| 7 | API | 02-API-MAP |
| 8 | Ruxsatlar matritsasi | 03-PERMISSION-MATRIX |
| 9 | Bildirishnomalar | Yangi/yaqinlashgan/o'tgan vazifa, ta'til so'rovi va qarori, jiddiy murojaat, davomat istisnosi, KPI/choraklik baholash vaqti, qarz, xarajat tasdig'i; Telegram navbati qayta urinish bilan, xato asosiy amalni bekor qilmaydi |
| 10 | CEO dashboard (14 vidjet) | Tashkilot paneli — 14 vidjet ruxsat bo'yicha |
| 11 | Xavfsizlik | 06-SECURITY-REVIEW |
| 12 | Qabul mezonlari | 05-TEST-PLAN |
