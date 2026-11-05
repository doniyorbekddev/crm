# 06 — Xavfsizlik ko'rigi

| Talab (spetsifikatsiya §11) | Holat |
|---|---|
| Server tomonida ruxsat | Har route `requirePermission` / `requireStaff`; doira (filial, egasi) servisda. Frontend yashirishi — faqat qulaylik |
| Parol va tokenlar | Parol — bcrypt xesh; refresh token rotatsiyasi (qayta ishlatilsa — butun oila bekor qilinadi); 2FA tiklash kodlari xeshda; QR token — faqat SHA-256 |
| QR muddati | 60 soniya, bir martalik, filial tekshiruvi, idempotent replay |
| CSRF / XSS / SQLi / IDOR | API — `Authorization: Bearer` access token (brauzer o'zi yubormaydi); refresh token — `httpOnly`, `secure`, `SameSite=Strict` cookie, faqat `/api/auth` yo'liga; React escaping; Prisma parametrli so'rovlar (`$queryRaw` tagged template); obyektlar doira bilan o'qiladi (begona — 404/403, `endpointSecurity.test.ts`) |
| Audit log himoyasi | Yozuvlarni o'zgartirish yoki o'chirish API'si yo'q (faqat `audit.view` bilan o'qish/eksport); yagona sozlama — saqlash muddati (`settings.manage`), eskilarini `auditCleanup.job.ts` o'chiradi |
| Backup va tiklash | Har deploydan oldin backup; `scripts/verify-backup.sh` — vaqtinchalik bazaga tiklab tekshiradi (07) |
| Maosh va shaxsiy ma'lumot | `salary.*`, `employee.*` ruxsatlari; maxfiy murojaat — `complaint.confidential`; kalendarda sabablar faqat rahbarga |
| Offboarding | Kirish huquqi bekor qilinmaguncha offboarding yopilmaydi |
| Loglar | Tokenlar, parollar va `.env` qiymatlari logga yozilmaydi |

## Ochiq risklar
- **Avtomatik davomat** — jadval bo'yicha yoziladi, jismoniy kelishni isbotlamaydi (CEO qarori, 2026-11-05). Yozuvlar "Avtomatik" yorlig'i bilan
  ajraladi; kelmagan kun rahbar tuzatishi bilan bekor qilinadi.
- **Bo'lim doirasidagi ruxsat** yo'q (hozir kerak emas).
- **Staging muhit** yo'q: tekshiruv — test bazasi, E2E va eski nusxaga migratsiya sinovi.
