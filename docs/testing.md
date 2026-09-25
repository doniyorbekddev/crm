# Testlash strategiyasi

> Academy CRM 3.0, TZ §62–66. Barcha testlar CI'da har push/PR da ishlaydi (`.github/workflows/ci.yml`).

## 1. Qatlamlar (§62)

| Qatlam | Nima | Qayerda | Asbob |
|---|---|---|---|
| **Unit** | servis va sof funksiyalar (baholash, blueprint, risk, mastery, metrikalar, scrub) | `backend/tests/unit/`, `backend/tests/*.test.ts` ichidagi sof bloklar, `frontend/src/**/*.test.ts` | Vitest |
| **Integration** | API + haqiqiy PostgreSQL: route → middleware → servis → Prisma | `backend/tests/*.test.ts` (supertest) | Vitest + supertest |
| **Komponent** | React komponentlari, foydalanuvchi harakati bilan | `frontend/src/**/*.test.tsx` | Vitest + Testing Library + jsdom |
| **E2E** | haqiqiy brauzer, haqiqiy server va baza, bir nechta rol ketma-ket | `e2e/specs/*.spec.ts` | Playwright |
| **Security** | begona ma'lumotga kirish, har endpoint auth/ruxsat | §3 jadvali | Vitest + supertest |
| **Performance** | katta ma'lumot, yuk testi | `backend/prisma/perfSeed*.ts`, `perf:bench`, `perf:load` | tsx skriptlar |

## 2. Ishga tushirish

```bash
# Backend (TEST_DATABASE_URL — alohida baza; har test faylida tozalanadi)
cd backend && npx vitest run
# Frontend
cd frontend && npx vitest run && npx tsc --noEmit -p tsconfig.app.json
# Lint (repo ildizidan)
npx eslint backend/src backend/tests && (cd frontend && npx eslint src)
# E2E: crm_e2e bazasi qaytadan yaratiladi, seed, keyin Playwright (backend + vite o'zi ko'tariladi)
npm run test:e2e
# Yuk testi — observability.md §4
```

`TEST_DATABASE_URL` bo'lmasa bazaga bog'liq testlar `skipIf(!hasTestDatabase)` bilan o'tkazib yuboriladi (lokal tez tekshiruv); CI'da baza bor — hammasi ishlaydi.

**E2E izolyatsiyasi** (`playwright.config.ts`): `NODE_ENV=test` (IP limiti o'chiq, bcrypt tez), bot tokeni, polling, Anthropic va Sentry kalitlari **bo'sh** — dev `.env` dagi sirlar bilan tashqi xizmatga hech narsa ketmaydi. Telegram xabarlari navbatga yozilishi bazadan tekshiriladi.

## 3. Majburiy xavfsizlik testlari (§63)

| Juftlik | Test | Kutilgan |
|---|---|---|
| O'quvchi A → O'quvchi B | `portal.test.ts` | 403 |
| Ota-ona A → Farzand B (13 endpoint) | `portal.test.ts` | 403 |
| O'qituvchi A → Guruh B (vazifa, imtihon, urinish, AI) | `homework.test.ts`, `examEngine.test.ts`, `aiAcademic.test.ts`, `teaching.test.ts` | 404 / 422 / ro'yxatda yo'q |
| Menejer A → Lead B | `leads.test.ts` | 403 |
| Filial A → Filial B (qarz, ogohlantirish) | `branchIsolation.test.ts`, `branchScopeDebtAlerts.test.ts` | ro'yxatda yo'q / 404 |
| Kabinet → xodim endpointlari | `portal.test.ts`, `rbac.spec.ts` (E2E) | 403 / kabinetga qaytariladi |
| **Barcha 440+ endpoint** | `endpointSecurity.test.ts` | tokensiz 401, ruxsatsiz rol 403 |

Batafsil: [security.md](security.md) §6.

## 4. To'liq oqimlar (§64–66) — `e2e/specs/flows.spec.ts`

Boshlang'ich ma'lumot (kabinet ochish, savollar banki) API orqali; **tekshiriladigan har qadam UI orqali**, rollar ketma-ket (o'qituvchi → o'quvchi → o'qituvchi → o'quvchi → ota-ona).

| TZ | Qadamlar | Tekshiruv |
|---|---|---|
| **§64 vazifa** | o'qituvchi beradi → o'quvchi bosh sahifada ko'radi, ochadi, topshiradi → o'qituvchi topshiriqni ko'radi → AI tekshiruv (qoidalar rejimi) → o'qituvchi ball + izoh → o'quvchi natijani ko'radi → ota-ona natija va bildirishnomani ko'radi → Telegram navbati | "85/100", izoh; `Yangi uy vazifasi`, `Vazifa baholandi` ota-ona Telegramiga navbatda |
| **§65 imtihon** | o'qituvchi onlayn imtihon + blueprint (mavzu 100%, "Bankni tekshirish") → o'quvchi boshlaydi, taymer, avtosaqlash, topshiradi → avto baholash (2/4, "O'qituvchi tekshirmoqda") → o'qituvchi esse javobini qo'lda baholaydi → 100% → o'quvchi natija va progress (mavzu 100) → AI tahlil (fakt: o'zlashtirish) → ota-onaga ilova + Telegram | natija ro'yxatida `100/100 · O'tdi` |
| **§66 AI** | mavzu bo'yicha past natija → o'qituvchi AI tahlili: risk belgisi, kuzatuv (zaif mavzu), tavsiya (remedial reja) → guruh AI → "Remedial reja" → o'qituvchi **tasdiqlaydi** → o'quvchi progressda mavzu 0 → takrorlash testini topshiradi → mavzu o'zlashtirishi oshadi | AI hech narsani o'zi yakunlamaydi — reja faqat tasdiqdan keyin yaratiladi |

Oqimlar topgan xato (PHASE 15): onlayn urinish natijasi `ExamResult` ga xom ball bilan yozilardi (4/100, lekin 100%) va o'tish bali xom ball bilan solishtirilardi — 100% olgan o'quvchi "O'tmadi". Tuzatildi (`isAttemptPassed`, `toExamScale`), regressiya testi `onlineExam.test.ts`, eski yozuvlar uchun `npm run db:backfill-exam-scale`.

## 5. Yozish qoidalari

- Test **o'chirilmaydi, o'tkazib yuborilmaydi, yumshatilmaydi**. Xatti-harakat ataylab o'zgarsa — tasdiq kamida shunchalik qat'iy qilib yangilanadi va sababi izohda.
- Yangi endpoint → `endpointSecurity.test.ts` avtomatik qamraydi; ochiq/"faqat o'ziniki" bo'lsa — istisno ro'yxatiga **sabab bilan**.
- Yangi egalik qoidasi → §3 jadvaliga qator (A → B testi).
- Backend: haqiqiy baza, mock faqat tashqi xizmatlar (Telegram — `captureBot`, LLM — `setLlmClient`).
- Frontend: servis qatlami mock qilinadi (`vi.mock('@/services/...')`), foydalanuvchi harakati `userEvent` bilan, qidiruv rol/label bo'yicha (`getByRole`, `getByLabelText`) — bu a11y'ni ham tekshiradi.
- E2E: `consoleGuard` — brauzer konsolidagi har xato testni yiqitadi; yorliqlar `exact: true` yoki aniq regex bilan.

## 6. Hozirgi hajm

| To'plam | Fayl | Test |
|---|---|---|
| Backend (Vitest) | 115 | 790 |
| Frontend (Vitest) | 30 | 104 |
| E2E (Playwright) | 13 | 31 |
