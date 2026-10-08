# Deployment qo‘llanmasi

Sales CRM ni serverga o‘rnatish, yangilash, zaxiralash va kuzatish tartibi.
Stack: **PostgreSQL 17 + Node 24 (Express) + Nginx (React build)**, hammasi Docker konteynerlarida.

> Birinchi marta o‘rnatyapsizmi? [HOSTING-VA-DOMEN.md](HOSTING-VA-DOMEN.md) — yangi VPS va domen uchun
> qadam-baqadam yo‘riqnoma (SSH, Docker, kodni ko‘chirish, birinchi admin, DNS, HTTPS).
>
> Avtomatik deploy (`git push` → server yangilanadi): [CI-CD.md](CI-CD.md).

---

## 1. Talablar

| Nima | Eng kam | Tavsiya |
|---|---|---|
| Server | 2 vCPU, 2 GB RAM, 20 GB SSD | 4 vCPU, 4 GB RAM, 40 GB SSD |
| OS | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |
| Docker | 24+ | oxirgi barqaror |
| Domen | `crm.example.uz` A-yozuvi server IP’siga qaratilgan | + `www` |

```bash
# Docker o‘rnatish (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
docker --version && docker compose version
```

---

## 2. Birinchi o‘rnatish

```bash
sudo mkdir -p /opt/sales-crm && sudo chown $USER:$USER /opt/sales-crm
cd /opt/sales-crm
git clone <repo-url> .

cp .env.production.example .env.production
```

`.env.production` ni to‘ldiring — **kamida** shu uchtasi o‘zgartirilishi shart:

```bash
# Kuchli qiymatlar generatsiyasi
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
```

`CLIENT_URL` ni haqiqiy domenga qo‘ying (`https://crm.example.uz`) — CORS va cookie shunga bog‘lanadi.

Ishga tushirish:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Tartib avtomatik: `postgres` (sog‘lom bo‘lguncha kutiladi) → `migrate` (migratsiyalar qo‘llanadi va tugaydi) → `backend` → `frontend`.

Tekshirish:

```bash
curl -s http://localhost:8080/healthz          # Nginx
curl -s http://localhost:8080/api/health       # API + baza
```

### Boshlang‘ich ma’lumotlar (birinchi admin)

Bo‘sh bazaga ruxsatlar, rollar, ma’lumotnomalar (kassalar, kategoriyalar, lead manbalari,
XP qoidalari) va bitta Super Admin kerak. Buning uchun **`db:bootstrap`** buyrug‘i bor —
u demo lead, o‘quvchi, to‘lov va oldindan ma’lum parolli sinov xodimlarini yaratmaydi:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e ADMIN_EMAIL='rahbar@markaz.uz' \
  -e ADMIN_PASSWORD='BuYerdaKuchliParol1' \
  -e ADMIN_FIRST_NAME='Ism' -e ADMIN_LAST_NAME='Familiya' -e ADMIN_PHONE='901234567' \
  -e COMPANY_NAME='O‘quv markaz nomi' -e COMPANY_PHONE='+998 90 123 45 67' \
  migrate npm run db:bootstrap
```

Parol talablari login formasidagi bilan bir xil: kamida 8 belgi, katta harf, kichik harf va raqam.
Buyruq **idempotent** — qayta ishga tushirsa ruxsatlar va ma’lumotnomalar yangilanadi, mavjud
sozlamalar va ma’lumotlar o‘zgarmaydi. Admin allaqachon bo‘lsa paroli tegilmaydi; uni almashtirish
kerak bo‘lsa `-e ADMIN_RESET_PASSWORD=yes` qo‘shiladi (parolni unutib qolgan holat uchun).

Qolgan xodimlar CRM ichida yaratiladi: **Sozlamalar → Xodimlar → Xodim qo‘shish** (rol tanlanadi,
parol beriladi). Shunda hech qaysi hisobda umumiy/standart parol qolmaydi.

> `npm run db:seed` — faqat development uchun: u demo lead, o‘quvchi va parollari hujjatda
> yozilgan sinov xodimlarini yaratadi. Serverda **ishlatilmaydi**.

---

## 3. HTTPS (Let's Encrypt)

Konteynerlar `HTTP_PORT` (standart 8080) da turadi; tashqi HTTPS ni host Nginx bajaradi.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/crm
```

```nginx
server {
    listen 80;
    server_name crm.example.uz;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    client_max_body_size 10m;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d crm.example.uz        # sertifikat + avtomatik yangilanish
```

Certbot HTTPS blokini o‘zi qo‘shadi. Shundan keyin:

- `CLIENT_URL=https://crm.example.uz` ekanini tekshiring;
- backend `TRUST_PROXY=1` bilan ishlaydi (compose’da qo‘yilgan). Haqiqiy mijoz IP sini frontend konteyneridagi Nginx aniqlaydi
  (`frontend/nginx/app.conf`, `real_ip`) va backendga bitta manzil yuboradi — host Nginx bo‘lsa ham, bo‘lmasa ham. Deploy’dan keyin
  tekshiring: [CRM-4.0-PHASE-0.md](CRM-4.0-PHASE-0.md) §1 «Production Verification Required»;
- refresh cookie `secure` bo‘ladi (`NODE_ENV=production`), ya’ni **faqat HTTPS orqali** yuboriladi;
- HSTS sarlavhasi productionda backend tomonidan qo‘yiladi.

Faqat 80/443 portlarni oching:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

---

## 4. Yangilash (deploy)

```bash
cd /opt/sales-crm
./scripts/backup-db.sh                     # avval zaxira
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
```

`migrate` servisi har safar yangi migratsiyalarni qo‘llaydi; yangisi bo‘lmasa hech narsa qilmaydi.

**Orqaga qaytarish (rollback):**

```bash
git checkout <oldingi-teg-yoki-commit>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# Sxema ham o‘zgargan bo‘lsa — zaxiradan tiklash:
./scripts/restore-db.sh backups/crm-YYYY-MM-DD_HH-MM.sql.gz
```

---

## 4.1. Academy CRM 3.0 ga yangilash (bir martalik)

Avtomatik deploy (`deploy/deploy.sh`, [CI-CD.md](CI-CD.md)) tartibi o'zgarmaydi: zaxira → `migrate`
(`prisma migrate deploy` + `db:sync-permissions`) → konteynerlar → sog'liq tekshiruvi → xato bo'lsa
avtomatik qaytish. 3.0 migratsiyalari **faqat qo'shuvchi** (yangi jadval/ustun/indeks/enum qiymati) —
mavjud ma'lumot o'zgarmaydi, eski versiya yangi sxemada ishlay oladi (rollback xavfsiz).

**1. `.env.production` ga yangi (ixtiyoriy) o'zgaruvchilar** — `docker-compose.prod.yml` ularni uzatadi:

| O'zgaruvchi | Bo'sh qolsa | Qayerda |
|---|---|---|
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS` | AI qoidalar rejimida ishlaydi | [ai-academic.md](ai-academic.md) |
| `METRICS_TOKEN` (≥ 24 belgi) | `/metrics` 404 | [observability.md](observability.md) |
| `SENTRY_DSN` | server xatolari faqat logda | observability.md |
| `VITE_SENTRY_DSN` (frontend build) | brauzer xatolari yuborilmaydi | observability.md |

Fayl huquqi: `chmod 600 .env.production`. Kalitlarni gitga, chatga yoki tiketga yozmang.

**2. Deploydan keyin tekshiruv:**

```bash
curl -s https://crm.example.uz/api/health                   # "database":"up"
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 migrate
# Onlayn imtihonlar ishlatilgan bo'lsa — eski natijalarni imtihon shkalasiga o'tkazish (PHASE 15):
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate npm run db:backfill-exam-scale            # hisobot
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate npm run db:backfill-exam-scale -- --apply # yozish (zaxiradan keyin)
```

Keyin brauzerda: xodim sifatida kirish → "Direktor paneli" (Akademiya holati kartasi), o'quvchi/ota-ona
kabineti ([student-portal.md](student-portal.md)), Telegram webhook holati ([telegram-deployment.md](telegram-deployment.md)).

**3. Kuzatuv**: Prometheus `backend:4000/metrics` ni ichki tarmoqdan oladi (nginx `/api` dan tashqarida — internetga
ochilmaydi); tavsiya etilgan ogohlantirishlar — [observability.md](observability.md) §2.

**4. Zaxirani tekshirish**: 3.0 dan keyingi birinchi haftada `./scripts/verify-backup.sh` natijasini qo'lda ko'ring
(yangi jadvallar ham tiklanishi kerak: `topic_mastery`, `ai_analyses`, `tasks`, `exam_attempts`).

---

## 4.2. Academy CRM 3.1 ga yangilash (bir martalik)

Tartib 4.1 bilan bir xil (zaxira → `migrate` → konteynerlar → sog'liq). 3.1 migratsiyalari ham **faqat qo'shuvchi**:

| Migratsiya | Nima qo'shadi |
|---|---|
| `20260927100000_badge_category_referral` | nishon toifasi (mavjudlari qoidasiga qarab toifalanadi), `REFERRAL` qoidasi |
| `20260927110000_follow_up_priority` | follow-up ustuvorligi |
| `20260927120000_broadcast_buttons_media` | ommaviy xabar: URL tugmalar, web media |
| `20260927130000_payment_provider_transactions` | Click/Payme tranzaksiyalari (idempotentlik) |
| `20260927140000_recurring_homework` | takrorlanuvchi uy vazifasi jadvali |
| `20260927150000_code_runs` | kod sandbox navbati, vazifa testlari |
| `20260928120000_pending_uploads` | bog'lanmagan yuklamalar (yetim fayl tozalash) |

**1. Yangi o'zgaruvchilar** (`docker-compose.prod.yml` uzatadi). Hammasi ixtiyoriy — bo'sh qolsa integratsiya
**o'chiq** (soxta natija yo'q). Lekin **qisman** to'ldirilsa server ishga tushmaydi (TZ §45, pastda):

| O'zgaruvchi | Bo'sh qolsa | Qo'llanma |
|---|---|---|
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` (+ `CLICK_MERCHANT_USER_ID`, `CLICK_MODE`) | Click o'chiq, webhook 503 | [payments-online.md](payments-online.md) |
| `PAYME_MERCHANT_ID`, `PAYME_KEY` (+ `PAYME_MODE`, `PAYME_ACCOUNT_FIELD`, `PAYME_FISCAL_*`) | Payme o'chiq | payments-online.md |
| `PAYMENT_RETURN_URL` | birinchi `CLIENT_URL` | payments-online.md |
| `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN` (≥ 32) | kod bajarilmaydi, vazifa qo'lda baholanadi | [code-sandbox.md](code-sandbox.md) |
| `BROADCAST_HOURLY_LIMIT` | 10 | [broadcast.md](broadcast.md) |

**2. Ishga tushishdagi tekshiruv (TZ §45).** `backend/src/config/env.ts` → `productionEnvIssues`; xato bo'lsa
konteyner loglarida sabab (qiymat emas, faqat o'zgaruvchi nomi) chiqadi va jarayon 1 kod bilan to'xtaydi:

- productionda `TELEGRAM_BOT_TOKEN` bor → `TELEGRAM_WEBHOOK_SECRET` majburiy, **≥ 32** belgi, faqat `A-Z a-z 0-9 _ -`;
- productionda `TELEGRAM_POLLING=true` — taqiqlangan (faqat webhook);
- Click uchala kalit birga, Payme ikkala kalit birga (har qanday muhitda);
- `CODE_RUNNER_URL` bor → `CODE_RUNNER_TOKEN` ≥ 32 belgi (runner'dagi bilan bir xil).

**3. Telegram webhook** — production image'da `tsx` yo'q, `:prod` buyruqlari ishlatiladi
([telegram-deployment.md](telegram-deployment.md)):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend npm run telegram:webhook:prod -- https://crm.markaz.uz
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend npm run telegram:check:prod
```

**4. Click/Payme'ni yoqish** — faqat merchant kabineti berilgach: avval `*_MODE=test` bilan sinov kabinetida
[payments-online.md](payments-online.md) "Production'ga yoqish" bo'limidagi tekshiruvlar, keyin `*_MODE=production`.
Sinov rejimida UI va botda "sinov" belgisi ko'rinadi.

**5. Kod sandbox runner server** — CRM serverida **emas**, alohida VM: Docker + gVisor (`runsc`), `code-runner/`
workspace, `code-runner/deploy/code-runner.service` (systemd). O'rnatish va §41 xavfsizlik testlari —
[code-sandbox.md](code-sandbox.md) §3, §6, §7. Runner porti faqat CRM serverining IP'siga ochiladi (UFW).
Runner yo'q paytda ham CRM to'liq ishlaydi (avtomatik tekshirish tugmasi ko'rinmaydi).

**6. Deploydan keyin:**

```bash
curl -s https://crm.example.uz/api/health        # "database":"up"
```

Brauzerda direktor sifatida: "Tizim holati" → **Fon vazifalari** kartasi (har job oxirgi muvaffaqiyatli/xato
yurishi; server qayta ishga tushgach 1–15 daqiqada to'ladi). Prometheus: `crm_job_last_success_timestamp_seconds`,
`crm_job_last_failure_timestamp_seconds` — tavsiya etilgan ogohlantirish [observability.md](observability.md).

**7. Yetim fayllar**: bot vazifa qoralamasi va web broadcast media bog'lanmay qolsa, `orphanUploads` jobi (har 6 soat)
24 soatdan keyin ularni `crm_uploads`dan o'chiradi; biror yozuv ishlatayotgan fayl hech qachon o'chirilmaydi.

---

## 5. Zaxira nusxa (backup)

> **Cheklar va hujjatlar** bazada emas, `crm_uploads` docker volume'ida (`/app/uploads`) saqlanadi.
> Baza zaxirasi bilan birga shu volume'ni ham zaxiralang, aks holda tiklangan bazadagi hujjat yozuvlari
> faylsiz qoladi:
>
> `backup-db.sh` endi shu fayllarni ham arxivlaydi (`backups/uploads-<sana>.tar.gz`) va `BACKUP_REMOTE` berilsa nusxalarni
> boshqa serverga ko‘chiradi. To‘liq tartib, tiklash va hali sozlanishi kerak bo‘lganlar: [CRM-4.0-BACKUP-RECOVERY.md](CRM-4.0-BACKUP-RECOVERY.md).

```bash
./scripts/backup-db.sh                     # baza + yuklangan fayllar; baza nusxasi 30 kun (cron: 14), fayllar 7 kun
./scripts/verify-backup.sh                 # oxirgi nusxani tiklab ko‘radi (ishchi bazaga tegmaydi)
./scripts/restore-db.sh backups/crm-2026-09-12_03-00.sql.gz
```

Kunlik avtomatik zaxira (soat 03:00) va haftalik tekshiruv (dushanba 04:00):

```bash
crontab -e
0 3 * * * cd /opt/sales-crm && ./scripts/backup-db.sh >> /var/log/crm-backup.log 2>&1
0 4 * * 1 cd /opt/sales-crm && ./scripts/verify-backup.sh >> /var/log/crm-backup.log 2>&1
```

> **Zaxira olinayotgani uning tiklanishini bildirmaydi.** Fayl yarim yozilgan, gzip buzilgan yoki
> dump bo‘sh bo‘lishi mumkin — buni faqat haqiqiy tiklash ko‘rsatadi. `verify-backup.sh` aynan
> shuni qiladi: nusxani **vaqtinchalik `crm_verify_<vaqt>` bazasiga** tiklaydi, jadvallar,
> foydalanuvchilar va migratsiyalarni sanaydi, so‘ng o‘sha bazani o‘chiradi. Ishchi bazaga
> hech qachon tegmaydi. Muammo bo‘lsa chiqish kodi 1 bo‘ladi — cron xatoni log faylida ko‘rsatadi.
>
> Zaxirani boshqa serverga ham nusxalang (`rsync`, S3 va h.k.) — bitta serverdagi nusxa zaxira hisoblanmaydi.

---

## 6. Kuzatuv (monitoring)

| Nima | Buyruq |
|---|---|
| Konteynerlar holati | `docker compose -f docker-compose.prod.yml ps` |
| Backend loglari | `docker compose ... logs -f --tail=200 backend` |
| Sekin so‘rovlar | `docker compose ... logs backend \| grep "Sekin so‘rov"` |
| Xatoliklar | `docker compose ... logs backend \| grep '"level":50'` |
| Sog‘liq | `curl -s https://crm.example.uz/api/health` |
| Disk | `df -h && docker system df` |

- Loglar JSON (pino) — `X-Request-Id` bo‘yicha bitta so‘rovni oxirigacha kuzatish mumkin.
- `SLOW_REQUEST_MS` (standart 800 ms) dan uzun so‘rovlar `warn` bilan yoziladi.
- Log hajmini cheklash uchun `/etc/docker/daemon.json`:
  ```json
  { "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
  ```
- Tashqi kuzatuv: `https://crm.example.uz/api/health` manzilini UptimeRobot kabi xizmatga qo‘ying
  (javobdagi `"database":"up"` bazani ham tekshiradi).

---

## 7. Xavfsizlik ro‘yxati (ishga tushirishdan oldin)

- [ ] `.env.production` dagi barcha `CHANGE_ME` qiymatlar almashtirilgan
- [ ] `JWT_SECRET` va `JWT_REFRESH_SECRET` — har biri 32+ belgi va **bir-biridan farqli**
- [ ] `CLIENT_URL` haqiqiy HTTPS domen
- [ ] Baza porti tashqariga ochilmagan (compose’da `ports` yo‘q — faqat ichki tarmoq)
- [ ] UFW: faqat 22/80/443
- [ ] Demo hisoblar (`admin@example.com` va h.k.) o‘chirilgan yoki parollari almashtirilgan
- [ ] Zaxira jadvali (cron) ishlayapti va nusxalar boshqa joyga ko‘chiriladi
- [ ] `docker compose ... logs backend` da ogohlantirishlar yo‘q
- [ ] `METRICS_TOKEN` o'rnatilgan bo'lsa — 24+ belgi; `/metrics` tashqaridan ochilmaydi (`curl https://domen/metrics` → 404)
- [ ] `.env.production` huquqi `600`; `ANTHROPIC_API_KEY`/Sentry DSN faqat shu faylda
- [ ] Telegram bot tokeni oshkor bo'lgan bo'lsa (chat, skrinshot) — @BotFather'da `/revoke` bilan yangilangan
- [ ] 3.1: `TELEGRAM_WEBHOOK_SECRET` 32+ belgi, `TELEGRAM_POLLING=false`; Click/Payme kalitlari to'liq yoki butunlay bo'sh; runner tokeni 32+ belgi va runner porti faqat CRM IP'siga ochiq

---

## 8. Tez-tez uchraydigan muammolar

| Belgi | Sabab | Yechim |
|---|---|---|
| `/api/health` da `"database":"down"` | Baza ko‘tarilmagan yoki parol noto‘g‘ri | `docker compose ... logs postgres`, `.env.production` dagi `POSTGRES_PASSWORD` ni tekshiring |
| Loginda 401, lekin parol to‘g‘ri | `CLIENT_URL` mos emas — cookie yuborilmayapti | `CLIENT_URL` ni brauzerdagi manzil bilan bir xil qiling, keyin `up -d` |
| Sahifani yangilaganda 404 | Nginx SPA fallback ishlamayapti | `frontend/nginx/app.conf` dagi `try_files ... /index.html` joyida ekanini tekshiring |
| `migrate` servisi xato beradi | Migratsiya konflikti | `docker compose ... logs migrate`, zaxiradan tiklab qayta urinib ko‘ring |
| Rate limit juda tez ishlaydi yoki bir kishining xato parollari hammani bloklaydi | Barcha so‘rovlar bitta IP’dan ko‘rinadi | `SELECT ip, count(*) FROM audit_logs WHERE "createdAt" > now() - interval '1 day' GROUP BY ip` — bitta manzil chiqsa, `frontend/nginx/app.conf` dagi `real_ip` bloki va `TRUST_PROXY=1` ni tekshiring ([CRM-4.0-PHASE-0.md](CRM-4.0-PHASE-0.md) §1) |
| 413 xatolik | So‘rov tanasi 256 KB dan katta | Bu ataylab qo‘yilgan chegara; fayl yuklash alohida endpoint orqali bo‘ladi |

---

## 9. Docker’siz variant (systemd)

Docker ishlatilmasa: PostgreSQL 17 ni tizimga o‘rnating, `npm ci && npm run build`,
so‘ng `backend/dist/server.js` ni systemd xizmati sifatida ishga tushiring va
`frontend/dist` ni Nginx root qilib ko‘rsating.

```ini
# /etc/systemd/system/crm-backend.service
[Unit]
Description=Sales CRM backend
After=network.target postgresql.service

[Service]
Type=simple
User=crm
WorkingDirectory=/opt/sales-crm/backend
EnvironmentFile=/opt/sales-crm/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now crm-backend
```
