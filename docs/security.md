# Xavfsizlik — autentifikatsiya, avtorizatsiya, egalik

> Academy CRM 3.0. Manba: `backend/src/middleware/`, `backend/src/services/auth.service.ts`, `teachingAccess.ts`, `leadAccess.ts`, `branchAccess.ts`, `portal.service.ts`.
> Telegramga xos qism: [telegram-security.md](telegram-security.md). Ruxsat matritsasi: [permissions.md](permissions.md).

## 1. Autentifikatsiya

| Mexanizm | Qiymat | Manba |
|---|---|---|
| Access token | JWT (`{id, roleKey}`), qisqa muddat (`JWT_ACCESS_EXPIRES_IN`), faqat xotirada | `utils/tokens.ts` |
| Refresh token | JWT, DB da **faqat SHA-256 hash**, oilalar (`familyId`), rotatsiya | `RefreshToken`, `auth.service.ts` |
| Reuse detection | eski refresh qayta ishlatilsa (30 s grace'dan keyin) — butun oila bekor, audit `auth.refresh_token_reuse` | `auth.service.ts:299-363` |
| Cookie | `httpOnly`, `sameSite=strict`, cheklangan `path` | `utils/refreshCookie.ts` |
| Har so‘rovda | `authenticate` foydalanuvchini DB dan qayta o‘qiydi: `deletedAt`, `status ≠ ACTIVE`, `passwordChangedAt` dan oldingi token — rad | `middleware/authenticate.ts` |
| Lockout | 15 daqiqada 8 xato (audit `auth.login_failed` bo‘yicha), mavjud bo‘lmagan email ham | `auth.service.ts:158-199` |
| Rate limit | auth 10/15 min, parol tiklash 5/soat, API 300/min, og‘ir 30/min, webhook 1200/min | `middleware/rateLimiter.ts` |
| Parol | bcrypt; talab `lib/validation.ts` (frontend) + `passwordPolicy.test.ts` | |
| Parol tiklash | bir martalik hash token, email; tiklangach barcha refresh bekor | `PasswordResetToken` |
| Sessiyalar | `POST /auth/logout-all` | |
| Vaqtinchalik parol | Kabinet ochilganda/xodim tiklaganda `mustChangePassword = true`; o‘zgartirilmaguncha `authenticate` faqat `/auth/me`, `/auth/change-password`, `/auth/logout(-all)` ni o‘tkazadi, qolgani 403 `PASSWORD_CHANGE_REQUIRED` | `middleware/authenticate.ts`, `parentPortal.test.ts` |
| Kabinet logini | O‘quvchi — ID (`ST-000045`), ota-ona — telefon; ichki manzil `*@kabinet.invalid` (xat ketmaydi); telefon noaniq bo‘lsa kirish yo‘q | `portalAccount.service.ts` → `resolveLoginIdentifier` |

Kabinet (o‘quvchi/ota-ona) — **xuddi shu** mexanizm; alohida auth yo‘q.

## 2. Avtorizatsiya (RBAC)

- `requirePermission(...all)` / `requireAnyPermission(...any)` — har route.
- Ruxsatlar `config/permissions.ts` (90 ta), rollar DB da, tizim rollari sinxronlanadi.
- Kabinet rollari (`STUDENT`, `PARENT`) faqat `portal.*` ruxsatga ega — xodim endpointlari 403 (`portal.test.ts`).
- Xodimga `portal.*` berilmaydi — aks holda u kabinetga "tushib qolardi" (`permissions.ts` izohi).

## 3. Egalik (ownership) — "nima" emas, "qaysi yozuv"

| Sub’ekt | Qoida | Modul | Qanday |
|---|---|---|---|
| O‘quvchi | faqat o‘zi | `portal.service.ts` → `resolvePortalScope`, `requireOwnStudent` | `Student.userId = actor.id`; begona `studentId` → 403 |
| Ota-ona | faqat farzandlari | o‘sha | `Parent.userId` → `StudentParent` |
| O‘qituvchi | faqat o‘z guruhlari | **`teachingAccess.ts`** (PHASE 1 da bitta modulga yig‘ildi) | `group.manage` yo‘q → `group.teacherId = actor.id`; begona yozuv **404** (mavjudligi oshkor bo‘lmaydi) |
| Menejer | faqat o‘z leadlari | `leadAccess.ts` | `lead.view_all` yo‘q → `assignedToId = actor.id` |
| Rahbar / xodim | filial doirasi | `branchAccess.ts` | `branch.view_all` yo‘q → `branchId = actor.branchId` |

`teachingAccess.ts` ni ishlatuvchilar: `homework.service`, `exam.service`, `examAttempt.service` (savol biriktirish, urinish boshlash/topshirish/baholash/ko‘rish). Boshqa servislarda (`group`, `student`, `attendance*`, `parent`, `search`) hozircha o‘z nusxasi — keyingi fazalarda shu modulga o‘tkaziladi.

**Callback/query ma’lumotiga ishonilmaydi**: `studentId`, `groupId`, `examId` — har safar doira bilan solishtiriladi.

## 4. Kirish ma’lumotlari (input)

- zod — har body/query/params (`validators/`), JSON limit 256 KB.
- Fayl yuklash: tur **baytlar bo‘yicha** (`detectFileType`), faqat PDF/PNG/JPG/WEBP, hajm `MAX_UPLOAD_MB`, saqlash `UPLOAD_DIR/YYYY/MM/<uuid>` — nom foydalanuvchidan olinmaydi.
- HTML: Telegram xabarlarida `escapeHtml`; frontend React (avtomatik).
- helmet (CSP, HSTS prod), CORS faqat `CLIENT_URL` + credentials.

## 5. Audit va maxfiylik

- `AuditLog` — kim, nima, oldingi/keyingi holat, IP, UA; saqlash muddati sozlanadi.
- Loglar: pino redaction (parol, token, cookie); Telegram hodisalarida foydalanuvchi matni **yozilmaydi**.
- AI: whitelist toollar, raw SQL yo‘q, `AiQuery` da parol/token/to‘lov siri yo‘q.
- Kabinetda o‘qituvchi haqida faqat ism va mutaxassislik — telefon/email yo‘q.

## 6. Majburiy xavfsizlik testlari (TZ 3.0 §63)

| Juftlik | Test | Kutilgan |
|---|---|---|
| O‘quvchi A → O‘quvchi B | `portal.test.ts` | 403 |
| Ota-ona A → Farzand B (barcha 13 endpoint) | `portal.test.ts` | 403 |
| O‘qituvchi A → Guruh B (vazifa) | `homework.test.ts` | 422 (guruh topilmadi) / ro‘yxatda yo‘q |
| O‘qituvchi A → Guruh B (imtihon urinishlari, 7 endpoint) | `examEngine.test.ts` | 404 |
| Menejer A → Lead B | `leads.test.ts` | 403 / ro‘yxatda yo‘q |
| Kabinet → xodim endpointlari | `portal.test.ts` | 403 |
| Filial A → Filial B | `branchIsolation.test.ts` | ro‘yxatda yo‘q / 403 |
| Rol matritsasi | `securityHardening.test.ts`, `rbac.spec.ts` (E2E) | |

Yangi endpoint qo‘shilganda shu jadvalga qator qo‘shiladi.

## 7. Ma’lum bo‘shliqlar (ROADMAP)

- `debtService.list`, `alertService.list` filial doirasini olmaydi (veb va bot) — PHASE 14.
- Teaching scope 6 servisda alohida nusxa, mezon farqli (`!GROUP_MANAGE` vs `ATTENDANCE_MARK`) — bosqichma-bosqich `teachingAccess.ts` ga.
- 2FA yo‘q (TZ talab qilmaydi).
- Modal focus-trap yo‘q (a11y, PHASE 14).
