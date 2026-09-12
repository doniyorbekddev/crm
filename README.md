# Sales CRM — o‘quv markaz uchun

O‘quv markaz sotuv bo‘limi har kuni ishlatadigan CRM tizimi: leadlar, qo‘ng‘iroqlar, follow-up, sotuv funneli,
kurslar, guruhlar, o‘quvchilar, to‘lovlar, qarzdorlik, hisobotlar, bildirishnomalar va audit log.

Arxitektura, ERD, API va rejalar: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Texnik topshiriq (rahbar va xodimlar uchun, sxemalar bilan): [docs/TZ.html](docs/TZ.html) · [docs/TZ.pdf](docs/TZ.pdf)

> **Holat:** loyiha bosqichma-bosqich ishlab chiqilmoqda. Tayyor: **PHASE 1** (arxitektura va poydevor),
> **PHASE 2** (PostgreSQL + Prisma sxema, migratsiya, seed), **PHASE 3** (autentifikatsiya: login, register,
> refresh token rotatsiyasi, parolni tiklash, profil), **PHASE 4** (rollar va ruxsatlar: permission middleware,
> xodimlar boshqaruvi, rollar matritsasi), **PHASE 5** (leadlar: ro‘yxat, Kanban, lead profili va timeline), **PHASE 6** (qo‘ng‘iroqlar va follow-up: eslatmalar, bugungi ishlar ro‘yxati), **PHASE 7** (kurslar va guruhlar), **PHASE 8** (o‘quvchilar: lead → o‘quvchi konvertatsiyasi, shartnoma va
> qarzdorlik, guruhga biriktirish, davomat jurnali), **PHASE 9** (to‘lovlar va qarzdorlik: kvitansiyalar,
> to‘lov usullari kesimi, sabab bilan bekor qilish, qarzdorlar ro‘yxati), **PHASE 10** (dashboard: KPI kartalar,
> dinamika grafigi, sotuv voronkasi, managerlar reytingi, bugungi vazifalar), **PHASE 11** (hisobotlar: 8 turdagi
> hisobot, sana oralig‘i va filtrlar, CSV eksport), **PHASE 12** (bildirishnomalar markazi: qo‘ng‘iroqcha,
> o‘qilmaganlar soni, filtrlar, kunlik qarzdorlik eslatmasi), **PHASE 13** (audit jurnali: kim/nima/qachon/IP,
> filtrlar va "oldin/keyin" tafsilotlari), **PHASE 14** (global qidiruv Ctrl+K, klaviatura bilan boshqarish,
> sahifa sarlavhalari), **PHASE 15** (xavfsizlik va unumdorlik: himoya sarlavhalari, so‘rov chegaralari,
> gzip siqish, indekslar va og‘ir hisobotlarni optimallashtirish), **PHASE 16** (testlar: 209 ta backend testi —
> unit + integratsion, 24 ta frontend unit testi, qamrov hisoboti), **PHASE 17** (deployment: Dockerfile’lar,
> production compose, Nginx, HTTPS, zaxira va CI). **Barcha 17 bosqich yakunlandi.**
>
> **Kengaytirish (o‘quv markaz boshqaruv tizimi):** PHASE 1 — audit, PHASE 2 — baza sxemasi
> (29 yangi model: davomat seanslari, gamification, o‘qituvchi va maosh, moliya, uy vazifasi,
> imtihon, ota-ona, target va alertlar; 62 ruxsat, 7 rol — `OWNER` qo‘shildi), PHASE 3 — davomat
> (dars seanslari, kalendar, statistika, o‘qituvchi paneli), PHASE 4 — gamification (XP, darajalar,
> nishonlar, seriya, reyting), **PHASE 5 — o‘qituvchi boshqaruvi** (profil va yuklama, 5 xil maosh
> modeli, oylik hisob-kitob, bonus/jarima, tasdiqlash va to‘lov — xarajat va kassa yozuvi bilan),
> **PHASE 7–8 — moliya** (yagona moliyaviy daftar, kassalar va qoldiqlar, o‘tkazma, tushum va xarajat
> yozuvlari, kategoriyalar, sabab bilan bekor qilish, oylik budjet va pul oqimi grafigi),
> **PHASE 9 — direktor paneli** (12 ta bosiladigan KPI, bugungi va oylik yakunlar, 6 oylik dinamika,
> diqqat talab qiladigan holatlar ro‘yxati).

| Qism | Texnologiyalar |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query, React Hook Form, Zod, Axios, Zustand, Recharts, Lucide, Sonner |
| Backend | Node.js, Express 5, TypeScript, Zod, JWT (access + refresh), bcrypt, Helmet, CORS, rate limit, Pino |
| Database | PostgreSQL 17, Prisma ORM 7 |

---

## 1. Talablar (Requirements)

- **Node.js 22.12+** (tavsiya: 24 — `.nvmrc`)
- **npm 10+**
- **PostgreSQL 15+** — Docker orqali (tavsiya) yoki lokal o‘rnatilgan

## 2. O‘rnatish (Installation)

```bash
git clone <repo-url> crm
cd crm
npm install          # backend va frontend bog‘liqliklari birga o‘rnatiladi (npm workspaces)
```

## 3. Environment o‘zgaruvchilari

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Windows (PowerShell): `Copy-Item backend/.env.example backend/.env` va `Copy-Item frontend/.env.example frontend/.env`.

**backend/.env**

| O‘zgaruvchi | Tavsif |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanishi |
| `JWT_SECRET` | Access token kaliti (kamida 32 belgi) |
| `JWT_REFRESH_SECRET` | Refresh token kaliti (kamida 32 belgi, `JWT_SECRET` dan farqli) |
| `JWT_ACCESS_EXPIRES_IN` | Access token muddati (standart `15m`) |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | Refresh token muddati, kun (standart `7`) |
| `PORT` | API porti (standart `4000`) |
| `CLIENT_URL` | Frontend manzili (CORS), vergul bilan bir nechta |
| `TRUST_PROXY` | Nginx orqasida `1` |
| `LOG_LEVEL` | `info`, `debug`, ... |

Kalit yaratish:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**frontend/.env**

| O‘zgaruvchi | Tavsif |
|---|---|
| `VITE_API_URL` | API manzili, masalan `http://localhost:4000/api` |
| `VITE_APP_NAME` | Ilova nomi |

Env noto‘g‘ri bo‘lsa backend ishga tushmaydi va qaysi o‘zgaruvchi xato ekanini aniq yozadi —
kod ichida hech qanday “zaxira” maxfiy kalit yo‘q.

## 4. PostgreSQL sozlash

Uchta variantdan birini tanlang:

**A) Docker (tavsiya etiladi)**

```bash
npm run db:up        # = docker compose up -d postgres  (localhost:5432, baza: crm)
```

`backend/.env.example` dagi `DATABASE_URL` shu konteynerga mos — o‘zgartirish shart emas.

**B) O‘rnatilgan PostgreSQL** — `crm` nomli baza va foydalanuvchi yarating, `DATABASE_URL` ni moslang:

```sql
CREATE USER crm WITH PASSWORD 'crm_dev_password' CREATEDB;
CREATE DATABASE crm OWNER crm;
```

**C) Docker’siz lokal baza (tezkor sinov uchun)** — Prisma’ning o‘rnatilgan PostgreSQL serveri:

```bash
npm run db:local     # = prisma dev --name crm --detach
```

So‘ng `backend/.env` ga:

```
DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable"
SHADOW_DATABASE_URL="postgres://postgres:postgres@localhost:51215/template1?sslmode=disable"
```

To‘xtatish: `cd backend && npx prisma dev stop crm`. Bu variant faqat development uchun — production’da haqiqiy PostgreSQL ishlating.

## 5. Prisma sozlash

- Sxema: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — 23 ta model, indekslar, foreign keylar
- Konfiguratsiya: [backend/prisma.config.ts](backend/prisma.config.ts) (Prisma 7)
- Prisma Client `npm install` paytida avtomatik generatsiya qilinadi (`backend/src/generated/prisma`, git’ga kirmaydi).
  Qo‘lda: `npm run db:generate -w @crm/backend`

## 6–7. Migratsiya

```bash
cd backend
npx prisma migrate dev          # development: migratsiyalarni qo‘llaydi (sxema o‘zgarsa yangisini yaratadi)
npx prisma migrate deploy       # production: faqat mavjud migratsiyalarni qo‘llaydi
```

Root’dan: `npm run db:migrate`, `npm run db:deploy`. Bazani tozalab qaytadan yaratish: `npm run db:reset`.

Birinchi migratsiyada `pg_trgm` kengaytmasi (tez qidiruv) va biznes qoidalari uchun CHECK constraintlar
(masalan, to‘lov summasi > 0, chegirma ≤ narx) qo‘lda qo‘shilgan.

## 8. Seed

```bash
cd backend
npx prisma db seed              # yoki root’dan: npm run db:seed
```

Seed idempotent: rollar, permissionlar, xodimlar, manbalar, kurslar, guruhlar va sozlamalar har safar tekshiriladi;
demo ma’lumotlar (40 lead, qo‘ng‘iroqlar, follow-up, 18 o‘quvchi, to‘lovlar, qarzdorlik, davomat) faqat baza bo‘sh bo‘lsa yoziladi.

| Rol | Email | Parol |
|---|---|---|
| Super Admin | admin@example.com | Admin123! |
| Direktor (Owner) | owner@example.com | Owner123! |
| Sales Manager | manager@example.com | Manager123! |
| Sales Manager | manager2@example.com | Manager123! |
| Call Center | callcenter@example.com | Callcenter123! |
| O‘qituvchi | teacher@example.com | Teacher123! |
| O‘qituvchi | teacher2@example.com | Teacher123! |
| Buxgalter | accountant@example.com | Accountant123! |
| Tasdiqlanmagan (PENDING) | pending@example.com | Pending123! |

> ⚠️ **Bu hisoblar faqat lokal development uchun.** Productionga chiqarishdan oldin ularni o‘chiring
> yoki parollarini almashtiring — [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) dagi xavfsizlik ro‘yxatiga qarang.

Rollar permissionlarini koddagi standart holatga qaytarish: `SEED_RESET_PERMISSIONS=true npx prisma db seed`.

Ma'lumotlarni brauzerda ko‘rish: `npm run db:studio`.

## 9. Development

```bash
npm run dev            # backend (4000) + frontend (5173) birga
npm run dev:backend    # faqat API
npm run dev:frontend   # faqat web
```

Yoki har birini alohida papkada: `cd backend && npm run dev`, `cd frontend && npm run dev`.

- Frontend: http://localhost:5173 → login sahifasi (demo hisoblar 8-bo‘limda)
- API: http://localhost:4000/api/health

Parolni tiklash xatlari: `SMTP_*` sozlanmagan bo‘lsa, development’da havola backend terminaliga (logga) chiqadi.

Tekshiruvlar:

```bash
npm run typecheck      # TypeScript (strict)
npm run lint           # ESLint
npm test               # Backend (unit + integratsion) va frontend testlari
npm run test:unit      # Faqat backend unit testlari (bazasiz, ~6 soniya)
npm run test:coverage  # Qamrov hisoboti (backend + frontend)
```

Testlar tarkibi: **209 ta backend testi** (23 fayl — 49 unit + 160 integratsion) va **24 ta frontend unit testi**.
Backend qamrovi: statements 87.9%, branches 75.6%, functions 89.3%.

**Integratsion testlar** alohida bazani talab qiladi — testlar uni har safar tozalaydi, shuning uchun
development bazasini hech qachon ko‘rsatmang. `backend/.env` ga qo‘shing:

```
TEST_DATABASE_URL="postgresql://crm:crm_dev_password@localhost:5432/crm_test?schema=public"
```

(Docker’siz variantda: `cd backend && npx prisma dev --name crm-test --detach`, chiqqan `postgres://...` manzilni yozing.)
`TEST_DATABASE_URL` bo‘lmasa, integratsion testlar o‘tkazib yuboriladi va unit testlar ishlaydi.

## 10–12. Production, build, deployment

Lokal build:

```bash
npm run build          # backend → backend/dist, frontend → frontend/dist
cd backend && npm start
```

Serverga o‘rnatish (Docker):

```bash
cp .env.production.example .env.production   # parollar va domenni to‘ldiring
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Tartib avtomatik: PostgreSQL → migratsiyalar → backend → frontend (Nginx).
Zaxira nusxa: `./scripts/backup-db.sh`, tiklash: `./scripts/restore-db.sh <fayl>`.

**To‘liq qo‘llanma:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — HTTPS (Let's Encrypt), yangilash va rollback,
zaxira jadvali, kuzatuv, xavfsizlik ro‘yxati, tez-tez uchraydigan muammolar va Docker‘siz (systemd) variant.

---

## Loyiha tuzilmasi

```
crm/
├── backend/     Express API (src/config, controllers, routes, services, middleware, validators, utils, types) + Dockerfile
├── frontend/    React SPA (src/components, pages, layouts, hooks, services, store, types, utils, lib, routes) + Dockerfile, nginx/
├── docs/        ARCHITECTURE.md, DEPLOYMENT.md, TZ.html/TZ.pdf
├── scripts/     backup-db.sh, restore-db.sh
├── .github/     CI (typecheck, lint, test, build)
├── docker-compose.yml        development uchun PostgreSQL
└── docker-compose.prod.yml   production stack
```
