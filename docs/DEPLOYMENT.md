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
- backend `TRUST_PROXY=1` bilan ishlaydi (compose’da qo‘yilgan) — IP va rate limit to‘g‘ri hisoblanadi;
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

## 5. Zaxira nusxa (backup)

> **Cheklar va hujjatlar** bazada emas, `crm_uploads` docker volume'ida (`/app/uploads`) saqlanadi.
> Baza zaxirasi bilan birga shu volume'ni ham zaxiralang, aks holda tiklangan bazadagi hujjat yozuvlari
> faylsiz qoladi:
>
> ```bash
> docker run --rm -v crm_uploads:/data -v "$PWD/backups":/backup alpine \
>   tar czf /backup/uploads-$(date +%F_%H-%M).tar.gz -C /data .
> ```

```bash
./scripts/backup-db.sh                     # backups/crm-<sana>.sql.gz, 30 kun saqlanadi
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

---

## 8. Tez-tez uchraydigan muammolar

| Belgi | Sabab | Yechim |
|---|---|---|
| `/api/health` da `"database":"down"` | Baza ko‘tarilmagan yoki parol noto‘g‘ri | `docker compose ... logs postgres`, `.env.production` dagi `POSTGRES_PASSWORD` ni tekshiring |
| Loginda 401, lekin parol to‘g‘ri | `CLIENT_URL` mos emas — cookie yuborilmayapti | `CLIENT_URL` ni brauzerdagi manzil bilan bir xil qiling, keyin `up -d` |
| Sahifani yangilaganda 404 | Nginx SPA fallback ishlamayapti | `frontend/nginx/app.conf` dagi `try_files ... /index.html` joyida ekanini tekshiring |
| `migrate` servisi xato beradi | Migratsiya konflikti | `docker compose ... logs migrate`, zaxiradan tiklab qayta urinib ko‘ring |
| Rate limit juda tez ishlaydi | `TRUST_PROXY` noto‘g‘ri — barcha so‘rovlar bitta IP’dan ko‘rinadi | Nginx `X-Forwarded-For` yuborishini va `TRUST_PROXY=1` ekanini tekshiring |
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
