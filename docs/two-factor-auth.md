# Ikki bosqichli kirish (2FA, TOTP)

Ixtiyoriy, har xodim o'zi yoqadi — rahbar va adminlarga tavsiya etiladi. Standart o'chiq: yoqmaganlar uchun kirish o'zgarmaydi.

## Foydalanuvchi uchun

1. **Profil → Ikki bosqichli kirish → Yoqish**, joriy parolni kiriting.
2. Telefonda Google Authenticator / Microsoft Authenticator / 1Password: "Hisob qo'shish" → QR kodni skanerlang
   (yoki kalitni qo'lda kiriting).
3. Ilovadagi 6 xonali kodni kiriting → **10 ta tiklash kodi** chiqadi. Ularni xavfsiz joyga saqlang: har biri bir
   marta ishlaydi va boshqa ko'rsatilmaydi.
4. Endi kirishda paroldan keyin ilovadagi kod so'raladi. Telefon yo'q bo'lsa — "Tiklash kodi bilan".

Telefon ham, tiklash kodlari ham yo'qolsa: boshqa admin **Xodimlar → ⋯ → 2FA ni o'chirish** (`user.manage`).
Xodimning sessiyalari yopiladi, u parol bilan kirib qayta yoqadi.

## Xavfsizlik

- Sir bazada AES-256-GCM bilan shifrlangan (`TOTP_ENCRYPTION_KEY`, bo'lmasa `JWT_SECRET` dan HKDF).
  `JWT_SECRET` almashtirilsa va alohida kalit berilmagan bo'lsa — 2FA yoqqanlar tiklash kodi bilan kirib qayta yoqadi.
- Tiklash kodlari faqat SHA-256 xeshi bilan saqlanadi.
- Parol to'g'ri bo'lsa ham sessiya/cookie berilmaydi — 5 daqiqalik tasdiqlash tokeni (alohida audience, access token
  sifatida ishlamaydi). Shu orada parol almashtirilsa, token yaroqsiz.
- Bir kod ikki marta ishlatilmaydi (oxirgi qadam atomar yoziladi), ±30 soniya soat farqi qabul qilinadi.
- 15 daqiqada 5 noto'g'ri koddan keyin hisob vaqtincha bloklanadi (qayta parol kiritish ham chetlab o'tmaydi).
- Yoqish, o'chirish, kodlarni yangilash va har noto'g'ri kod auditda.

## API

| Usul | Yo'l | Izoh |
| --- | --- | --- |
| POST | `/api/auth/login` | 2FA yoqilgan bo'lsa: `{ twoFactorRequired: true, challengeToken, expiresIn }` |
| POST | `/api/auth/login/2fa` | `{ challengeToken, code }` — 6 xonali kod yoki tiklash kodi → sessiya |
| GET | `/api/auth/2fa` | holat, qolgan tiklash kodlari |
| POST | `/api/auth/2fa/setup` | `{ password }` → `{ secret, otpauthUrl }` |
| POST | `/api/auth/2fa/enable` | `{ code }` → `{ recoveryCodes }` |
| POST | `/api/auth/2fa/disable` | `{ password, code }` |
| POST | `/api/auth/2fa/recovery-codes` | `{ password, code }` → yangi kodlar |
| POST | `/api/users/:id/2fa/reset` | admin, `user.manage` |
