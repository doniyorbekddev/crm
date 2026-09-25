# Markaz ma'lumotlari (Academy Settings)

> Academy CRM 3.1, GAP-01. Manba: `backend/src/services/academySettings.service.ts`,
> `validators/academySettings.validator.ts`, `routes/settings.routes.ts`, `frontend/src/pages/settings/AcademySettingsPage.tsx`,
> `hooks/useBranding.ts`, `components/BrandMark.tsx`.

## Maydonlar

| Maydon | Qoida | Ta'siri |
|---|---|---|
| Markaz nomi | 2–120 belgi, majburiy | Menyu, kirish sahifasi, brauzer sarlavhasi |
| Logo | PNG/JPG/WEBP (baytlar bo'yicha), 2 MB | Menyu va kirish sahifasi |
| Telefon, email, manzil | ixtiyoriy; telefon `+998…` ga normallashadi, email kichik harfga | Ma'lumot uchun |
| Ish vaqti | haftaning 7 kuni, har biri bir marta; ochiq kunda `from < to` | Ma'lumot uchun |
| O'quv yili | boshlanish < tugash, ≤ 400 kun | Ma'lumot uchun |
| Vaqt mintaqasi | IANA nomi (`Asia/Tashkent`) | **Faqat ko'rsatish** — hisob-kitoblar `APP_UTC_OFFSET_MINUTES` bo'yicha |
| Valyuta | hozircha faqat `UZS` | `<html>`/summalar so'mda |
| Standart til | hozircha faqat `uz` | `<html lang>` |

Valyuta va til ro'yxati ataylab faqat haqiqatda ishlaydigan qiymatlardan iborat: summalar va to'lov qoidalari
(eng kam to'lov 1 000 so'm, Payme tiyin) so'mga bog'langan, interfeys o'zbekcha. Boshqa valyuta/til qo'shish —
qoidalar va tarjimalar bilan birga alohida ish.

## Saqlash

Mavjud `Setting` (key/value) modeli, kalit `academy.profile` — yangi jadval yo'q. Bazadagi qiymat buzilgan bo'lsa,
faqat to'g'ri maydonlar olinadi, qolgani standartga qaytadi (ilova yiqilmaydi). Logo fayli `UPLOAD_DIR` da,
almashtirilganda eskisi o'chiriladi.

## API

| Endpoint | Ruxsat | Izoh |
|---|---|---|
| `GET /api/settings/academy` | `settings.manage` | to'liq sozlama, `configured`, kim/qachon o'zgartirgan |
| `PUT /api/settings/academy` | `settings.manage` | qat'iy sxema (noma'lum maydon — 422) |
| `POST /api/settings/academy/logo` | `settings.manage` | xom fayl (`application/octet-stream`) |
| `DELETE /api/settings/academy/logo` | `settings.manage` | |
| `GET /api/public/branding` | ochiq | faqat nom, logo URL, valyuta, til — telefon/manzil **qaytarilmaydi** |
| `GET /api/public/branding/logo?v=…` | ochiq | versiyalangan URL, `Cache-Control: public, max-age=86400` |

`settings.manage` — OWNER va SUPER_ADMIN (ADMIN'dan ataylab chiqarilgan). DIRECTOR roli tizimda yo'q — OWNER "Direktor".

## Audit

`settings.academy_updated`, `settings.academy_logo_updated`, `settings.academy_logo_removed` — kim, oldingi va yangi
qiymat, vaqt, IP, brauzer; bitta tranzaksiyada. Uchalasi **muhim amallar** ro'yxatida (uzoq saqlanadi).

## Testlar

`backend/tests/academySettings.test.ts` (RBAC 7 rol, audit, validatsiya, logo, ochiq endpoint, buzilgan qiymat),
`endpointSecurity.test.ts` (ochiq ro'yxatda sabab bilan), `frontend/.../AcademySettingsPage.test.tsx`, `BrandMark.test.tsx`,
`e2e/specs/settings.spec.ts`.
