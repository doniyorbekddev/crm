# CRM ni hostingga qo‘yish va domenga bog‘lash (qadam-baqadam)

Bu — **birinchi marta** serverga o‘rnatish uchun amaliy yo‘riqnoma: buyruqlarni tartib bilan
ko‘chirib qo‘yib borish kifoya. Har bir bo‘limning texnik tafsiloti [DEPLOYMENT.md](DEPLOYMENT.md) da.

Boshlashdan oldin qo‘lingizda bo‘lishi kerak:

| Nima | Qanday bo‘lishi kerak |
|---|---|
| Server turi | **VPS/VDS**, Ubuntu 24.04 (yoki 22.04). Oddiy «shared hosting» (cPanel, faqat PHP) **to‘g‘ri kelmaydi** — unda Docker va Node.js ishlamaydi |
| Resurs | 750–1000 foydalanuvchi uchun: 4 vCPU, 8 GB RAM, 80–100 GB SSD |
| Kirish | Server **IP manzili**, `root` foydalanuvchi va paroli (Ahost panelidan/xatidan) |
| Domen | Masalan `markaz.uz`. CRM `crm.markaz.uz` subdomenida turadi |

> Agar xato server turi olingan bo‘lsa, Ahost qo‘llab-quvvatlash xizmatiga yozib VPS ga
> almashtirishni so‘rang — keyinchalik ko‘chirishdan osonroq.

---

## 1-qadam. Serverga ulanish va asosiy sozlash

O‘z kompyuteringizda terminal (Mac/Linux) yoki PowerShell (Windows) oching:

```bash
ssh root@SERVER_IP            # parolni Ahost bergan
```

Tizimni yangilash va o‘zingiz uchun alohida foydalanuvchi (root bilan ishlamaslik uchun):

```bash
apt update && apt upgrade -y
adduser crm                   # parol o‘ylab topib kiriting
usermod -aG sudo crm
```

Parol emas, SSH kalit bilan kirish (xavfsizroq). **O‘z kompyuteringizda**, yangi terminalda:

```bash
ssh-keygen -t ed25519         # kalit bo‘lmasa; Enter bosib o‘tib ketish mumkin
ssh-copy-id crm@SERVER_IP
ssh crm@SERVER_IP             # endi parol so‘ramasligi kerak
```

Faqat kerakli portlarni ochamiz (SSH, HTTP, HTTPS):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 2-qadam. Docker o‘rnatish

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
exit                          # guruh o‘zgarishi kuchga kirishi uchun qayta kirish
ssh crm@SERVER_IP
docker --version && docker compose version
```

## 3-qadam. Loyiha kodini serverga olib chiqish

Ikki yo‘ldan **bittasi** yetarli.

**A) GitHub orqali (tavsiya etiladi — keyingi yangilanishlar `git pull` bilan bo‘ladi):**

```bash
sudo mkdir -p /opt/sales-crm && sudo chown $USER:$USER /opt/sales-crm
cd /opt/sales-crm
git clone https://github.com/<foydalanuvchi>/<repo>.git .
```

Repozitoriy yopiq (private) bo‘lsa, parol o‘rniga GitHub token so‘raydi.

**B) To‘g‘ridan-to‘g‘ri o‘z kompyuteringizdan (GitHub ochilmasa).** O‘z kompyuteringizda,
loyiha papkasida turib:

```bash
ssh crm@SERVER_IP 'sudo mkdir -p /opt/sales-crm && sudo chown $USER:$USER /opt/sales-crm'
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude dist \
  --exclude '.env*' --exclude backend/uploads \
  ./ crm@SERVER_IP:/opt/sales-crm/
```

`.env` fayllari **ataylab** ko‘chirilmaydi — serverda alohida, yangi parollar bilan yaratiladi.

## 4-qadam. Parol va kalitlarni yozish (`.env.production`)

Serverda:

```bash
cd /opt/sales-crm
cp .env.production.example .env.production
openssl rand -base64 24      # POSTGRES_PASSWORD uchun — natijani ko‘chirib oling
openssl rand -base64 48      # JWT_SECRET uchun
openssl rand -base64 48      # JWT_REFRESH_SECRET uchun
nano .env.production
```

Kamida shu qatorlarni to‘ldiring:

```ini
POSTGRES_PASSWORD=<birinchi generatsiya>
JWT_SECRET=<ikkinchi generatsiya>
JWT_REFRESH_SECRET=<uchinchi generatsiya>
CLIENT_URL=https://crm.markaz.uz
VITE_APP_NAME=Markaz CRM
```

Saqlash: `Ctrl+O`, `Enter`, `Ctrl+X`. Bu faylni hech kimga yubormang va git'ga qo‘shmang.

## 5-qadam. CRM ni ishga tushirish

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Birinchi marta 5–10 daqiqa ketadi (image'lar yig‘iladi). Tartib avtomatik:
baza → migratsiyalar → backend → frontend.

Tekshirish:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/api/health
```

Ikkinchi buyruq `ok`, uchinchisi `"database":"up"` qaytarishi kerak.

## 6-qadam. Birinchi admin

Baza bo‘sh — ruxsatlar, rollar, kassalar, kategoriyalar va bitta Super Admin yaratamiz.
Parolni o‘zingiz tanlaysiz (kamida 8 belgi, katta harf, kichik harf, raqam):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e ADMIN_EMAIL='rahbar@markaz.uz' \
  -e ADMIN_PASSWORD='SizningKuchliParol1' \
  -e ADMIN_FIRST_NAME='Ism' -e ADMIN_LAST_NAME='Familiya' -e ADMIN_PHONE='901234567' \
  -e COMPANY_NAME='Markaz nomi' -e COMPANY_PHONE='+998 90 123 45 67' \
  migrate npm run db:bootstrap
```

Bu buyruq demo o‘quvchi, lead va standart parolli xodimlar yaratmaydi —
serverda faqat sizning hisobingiz bo‘ladi. Qolgan xodimlarni CRM ichida
**Sozlamalar → Xodimlar** bo‘limidan qo‘shasiz.

## 7-qadam. Domenni serverga bog‘lash (DNS)

Ahost panelida domen bo‘limi → **DNS yozuvlari (DNS records)** → yangi yozuv:

| Tur | Nom (Host) | Qiymat | TTL |
|---|---|---|---|
| A | `crm` | `SERVER_IP` | 3600 |

Natijada CRM `https://crm.markaz.uz` da ochiladi. Asosiy domenning o‘zida ochilishini
xohlasangiz, `crm` o‘rniga `@` yozuvini qo‘yasiz.

> Domen boshqa joydan olingan bo‘lsa (masalan `cctld.uz`), o‘sha panelda **NS** yozuvlarini
> Ahost bergan nom-serverlarga o‘zgartirasiz, keyin A yozuvini Ahost panelida yaratasiz.

DNS tarqalishini tekshirish (5 daqiqadan bir necha soatgacha ketadi):

```bash
dig +short crm.markaz.uz          # server IP chiqishi kerak
```

IP chiqmaguncha keyingi qadamga o‘tmang — sertifikat olinmaydi.

## 8-qadam. HTTPS (bepul Let's Encrypt sertifikati)

Serverda:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/crm
```

Ichiga (domenni o‘zingizniki bilan almashtiring):

```nginx
server {
    listen 80;
    server_name crm.markaz.uz;

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
sudo certbot --nginx -d crm.markaz.uz      # email so‘raydi, sertifikat o‘zi yangilanadi
```

`CLIENT_URL` domen bilan bir xil ekanini tekshirib, konteynerlarni qayta ko‘taramiz:

```bash
grep CLIENT_URL /opt/sales-crm/.env.production      # https://crm.markaz.uz
cd /opt/sales-crm
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Endi brauzerda `https://crm.markaz.uz` ochiladi va qulf belgisi ko‘rinadi.

## 9-qadam. Kunlik zaxira nusxa

```bash
cd /opt/sales-crm && ./scripts/backup-db.sh        # qo‘lda sinab ko‘ramiz
crontab -e
```

Faylning oxiriga (har kuni soat 03:00 da):

```cron
0 3 * * * cd /opt/sales-crm && ./scripts/backup-db.sh >> /var/log/crm-backup.log 2>&1
```

Cheklar va hujjatlar fayllari alohida zaxiralanadi — [DEPLOYMENT.md, 5-bo‘lim](DEPLOYMENT.md).
Zaxirani vaqti-vaqti bilan boshqa joyga (o‘z kompyuteringiz yoki bulut) ko‘chirib turing.

## 10-qadam. Xodimlarga topshirish

1. `https://crm.markaz.uz` ni ochib o‘z admin hisobingiz bilan kirasiz.
2. **Sozlamalar → Xodimlar → Xodim qo‘shish**: har bir xodimga alohida email, parol va rol
   (Direktor, Sotuv menejeri, Call-center, O‘qituvchi, Buxgalter).
3. Xodimga faqat link, email va parolni berasiz. Parolni birinchi kirishda o‘zgartirishni aytasiz.
4. **Kurslar** va **Guruhlar** bo‘limlarini to‘ldirib, o‘quvchilarni kiritishni boshlaysiz.

## Keyingi yangilanishlar

```bash
cd /opt/sales-crm
./scripts/backup-db.sh
git pull                                    # yoki 3-qadamdagi rsync
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Nimadir ishlamasa

| Belgi | Tekshirish |
|---|---|
| Sahifa ochilmaydi | `docker compose -f docker-compose.prod.yml --env-file .env.production ps` — hamma servis `running` bo‘lsin |
| 502 xato | `sudo systemctl status nginx`, `curl -s http://localhost:8080/healthz` |
| Kira olmayapman | Parolni tiklash: 6-qadam buyrug‘iga `-e ADMIN_RESET_PASSWORD=yes` qo‘shib qayta ishga tushiring |
| Sertifikat olinmadi | `dig +short crm.markaz.uz` IP ni qaytaryaptimi, 80-port ochiqmi (`sudo ufw status`) |
| Xatoliklarni ko‘rish | `docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=200 backend` |
