# Ota-ona kabineti (Parent Portal)

> Academy CRM 3.0 — PHASE 1 holati. Texnik asos [student-portal.md](student-portal.md) bilan **bir xil** — bu hujjat faqat farqlarni yozadi.

## 1. Farq nimada

| | O‘quvchi | Ota-ona |
|---|---|---|
| Rol / ruxsat | `STUDENT` / `portal.student` | `PARENT` / `portal.parent` |
| Bog‘lanish | `Student.userId` | `Parent.userId` → `StudentParent[]` |
| Doira | bitta o‘quvchi | bir nechta farzand; har so‘rovda `?studentId=` |
| Hisob ochish | `POST /students/:id/portal-account` | `POST /parents/:id/portal-account` — farzandsiz ota-onaga **ochilmaydi**; filial birinchi farzandniki |
| Interfeys | bo‘limlar | bo‘limlar + **farzand tanlovi** (2+ bo‘lsa), layout darajasida |

## 2. Farzand tanlovi

- `PortalLayout` → `ChildSwitcher` (faqat `kind === 'PARENT'` va `children.length > 1`).
- Tanlov `usePreference('portal.activeChild')` orqali **serverda** saqlanadi (`UserPreference`) — telefonda tanlagani kompyuterda ham ochiladi.
- Saqlangan id ro‘yxatda bo‘lmasa (farzand chiqarilgan) — birinchisiga qaytadi.
- Barcha sahifalar `usePortal().activeChild` dan oladi; backend `requireOwnStudent` bilan **qayta tekshiradi** — tanlov faqat qulaylik.

## 3. Xavfsizlik

`tests/portal.test.ts` — "ota-ona A begona farzand (B) uchun barcha kabinet bo‘limlarida 403": 11 ta GET + `homework/:id/submit` + `feedback` — hammasi 403; o‘z farzandi — 200. Telegram tomonida ham xuddi shu (`telegram.test.ts`, `st_child:<begona>` rad etiladi).

## 4. Bildirishnomalar

Ota-ona portal hisobiga in-app bildirishnoma `notifyFamily` orqali keladi (vazifa berildi/baholandi, imtihon natijasi, sertifikat). Telegramga — `parentId` bo‘yicha alohida chat. Sozlamalar `/portal/settings` da.

## 5. Keyingi bosqich (PHASE 3)

- Farzand kartalari bilan bosh sahifa (har biri uchun 4 ko‘rsatkich).
- **Haftalik hisobot**: `GET /portal/weekly-report` — davomat, vazifa, imtihon, XP, progress, zaif/kuchli mavzular, o‘qituvchi fikri; web + Telegram (yakshanba) + PDF.
- To‘lov eslatmasi ota-onaga Telegramda (`findChats` → `parentId`).
