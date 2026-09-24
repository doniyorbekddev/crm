# CI/CD: `git push` → avtomatik production deploy

Maqsad: lokal kompyuterda `git push origin main` qilganingizda Ahost VPS'dagi CRM
o‘zi yangilanadi — testlar o‘tgan bo‘lsa, migratsiyalar qo‘llanadi, konteynerlar
almashtiriladi, sog‘liq tekshiriladi; ishlamasa avtomatik oldingi versiyaga qaytadi.

```
LOKAL KOMPYUTER            git push origin main
      │
      ▼
GITHUB  ──────► CI (typecheck, lint, 419 test, build, E2E)
      │                     │ muvaffaqiyatli bo‘lsa
      │                     ▼
      └──────► Deploy (production) ── SSH ──► AHOST VPS
                                               │  ./deploy/deploy.sh <sha>
                                               ├─ git fetch + reset --hard <sha>
                                               ├─ docker compose build     (ilova hali eski versiyada ishlaydi)
                                               ├─ baza zaxirasi
                                               ├─ prisma migrate deploy + ruxsatlarni moslash
                                               ├─ docker compose up -d     (backend + frontend almashtiriladi)
                                               └─ /api/health tekshiruvi → xato bo‘lsa avtomatik rollback
```

Serverdagi katalog (mavjud tuzilma saqlangan):

```
/opt/sales-crm/                  ← git repozitoriy (GitHub bilan bog‘langan)
├── .env.production              ← secretlar, faqat serverda (git'da yo‘q, huquq 600)
├── docker-compose.prod.yml      ← postgres + migrate + backend + frontend
├── deploy/
│   ├── setup-server.sh          ← serverni bir marta sozlash
│   ├── deploy.sh                ← har bir deploy (Actions shuni chaqiradi)
│   ├── rollback.sh              ← qo‘lda orqaga qaytish
│   └── nginx/crm.conf.example   ← host Nginx namunasi
├── scripts/{backup-db.sh,verify-backup.sh,restore-db.sh}
├── backups/                     ← baza zaxiralari (git'da yo‘q)
└── .deploy/                     ← last-good commit, deploy tarixi, qulf (git'da yo‘q)
```

---

## 1. Bir martalik server sozlash (copy-paste)

### 1.1. Serverga kirish va foydalanuvchi

O‘z kompyuteringizda:

```bash
ssh root@SERVER_IP
```

Serverda:

```bash
apt update && apt upgrade -y
adduser crm                      # parol o‘ylab toping
usermod -aG sudo crm
exit
```

O‘z kompyuteringizda — parolsiz kirish uchun kalit:

```bash
ssh-keygen -t ed25519            # kalitingiz bo‘lmasa
ssh-copy-id crm@SERVER_IP
ssh crm@SERVER_IP                # endi parol so‘ramaydi
```

### 1.2. Server GitHub'dan kod olishi uchun deploy key

Serverda (faqat o‘qish huquqli kalit — parol/token muddati tugab qolmaydi):

```bash
sudo apt install -y git
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N '' -C "ahost-vps-crm"
cat >> ~/.ssh/config <<'CONF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
CONF
chmod 600 ~/.ssh/config
cat ~/.ssh/github_deploy.pub
```

Chiqqan qatorni ko‘chirib oling → GitHub: **repo → Settings → Deploy keys → Add deploy key**
→ Title: `ahost-vps`, Key: shu qator, **Allow write access — BELGILAMANG** (server faqat o‘qiydi).

Tekshirish va klon:

```bash
ssh -T git@github.com            # "Hi USER/REPO! You've successfully authenticated" (shell bermaydi — normal)
sudo mkdir -p /opt/sales-crm && sudo chown $USER:$USER /opt/sales-crm
git clone git@github.com:FOYDALANUVCHI/REPO.git /opt/sales-crm
cd /opt/sales-crm
```

### 1.3. Server sozlash skripti

```bash
./deploy/setup-server.sh
```

Nima qiladi: paketlar (git, nginx, certbot, ufw, unattended-upgrades), Docker,
UFW (faqat 22/80/443), `backups/` va `.deploy/` kataloglari, kunlik zaxira cron (03:00, 14 kun),
va `~/.ssh/authorized_keys` mavjud bo‘lsa — SSH parol bilan kirishni hamda root loginni o‘chirish.

Docker guruhi kuchga kirishi uchun bir marta qayta kiring:

```bash
exit
ssh crm@SERVER_IP
cd /opt/sales-crm
```

### 1.4. Secretlar: `.env.production`

```bash
cp .env.production.example .env.production
openssl rand -base64 24    # POSTGRES_PASSWORD
openssl rand -base64 48    # JWT_SECRET
openssl rand -base64 48    # JWT_REFRESH_SECRET
nano .env.production
chmod 600 .env.production
```

Kamida: `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL=https://crm.example.uz`.
Bu fayl `.gitignore` da (`.env.*`) — GitHub'ga **hech qachon** chiqmaydi. Undagi qiymatlar
konteynerlarga faqat compose orqali beriladi va loglarga yozilmaydi.

### 1.5. Birinchi ishga tushirish

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
curl -s http://127.0.0.1:8080/api/health          # {"database":"up"}
```

### 1.6. Birinchi production admin (faqat bir marta)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e ADMIN_EMAIL='rahbar@markaz.uz' \
  -e ADMIN_PASSWORD='SizningKuchliParol1' \
  -e ADMIN_FIRST_NAME='Ism' -e ADMIN_LAST_NAME='Familiya' -e ADMIN_PHONE='901234567' \
  -e COMPANY_NAME='Markaz nomi' \
  migrate npm run db:bootstrap
```

`db:bootstrap` — rollar, ruxsatlar, kassalar, kategoriyalar, manbalar, sozlamalar va **bitta**
Super Admin. Demo o‘quvchi/lead/xodim yaratmaydi. **Deploy skripti buni hech qachon
chaqirmaydi** — har deployda yangi admin paydo bo‘lmaydi. `prisma db seed` (demo ma’lumotlar)
serverda ishlatilmaydi; deployda `prisma migrate deploy` va `db:sync-permissions` bajariladi.

**Nega ruxsatlarni moslash kerak:** migratsiya faqat jadval tuzilmasini yangilaydi, ruxsatlar esa
`permissions` jadvalidagi **ma'lumot**. Yangi modul (masalan ombor yoki chegirma) qo'shilganda uning
ruxsati bazada bo'lmasa, `requirePermission` hammani rad etadi — sahifa hatto Super Adminda ham
ochilmaydi. `db:sync-permissions` yangi ruxsatlarni yaratadi va **faqat shu yurishda paydo bo'lganini**
tizim rollariga qo'shadi; qo'lda o'zgartirilgan rol ruxsatlari tegilmaydi, demo ma'lumot yaratilmaydi.

Parolni unutib qolsangiz: shu buyruqqa `-e ADMIN_RESET_PASSWORD=yes` qo‘shib qayta ishlatasiz.

### 1.7. DNS, Nginx, HTTPS

DNS (Ahost paneli → domen → DNS records):

| Tur | Nom | Qiymat | TTL |
|---|---|---|---|
| A | `crm` | `SERVER_IP` | 3600 |

```bash
dig +short crm.example.uz        # server IP chiqishi shart (keyingi qadamgacha kutiladi)
```

Nginx + sertifikat:

```bash
sudo cp deploy/nginx/crm.conf.example /etc/nginx/sites-available/crm
sudo nano /etc/nginx/sites-available/crm            # server_name → crm.example.uz
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d crm.example.uz               # "Redirect HTTP to HTTPS" ni tanlang
sudo systemctl status certbot.timer                  # avtomatik yangilanish (90 kunda bir)
```

Trafik yo‘li: `Internet :443 → host Nginx → 127.0.0.1:8080 (frontend konteyneri) → /api/ → backend:4000 → postgres`.
PostgreSQL tashqariga umuman chiqarilmagan (compose'da `ports` yo‘q, faqat ichki `crm` tarmog‘i).
Frontend porti ham standart holatda `127.0.0.1` ga bog‘langan (`HTTP_BIND`), ya’ni internetdan
faqat 80/443 ochiq.

---

## 2. GitHub Actions'ni ulash

### 2.1. Actions uchun alohida SSH kalit

Serverda:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gh_actions -N '' -C "github-actions-deploy"
cat ~/.ssh/gh_actions.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gh_actions            # shu MAXFIY kalitni to‘liq ko‘chirib oling
```

Ko‘chirib olgandan keyin maxfiy kalitni serverda qoldirmaslik yaxshi:

```bash
shred -u ~/.ssh/gh_actions       # nusxasi endi faqat GitHub secret'da
```

Serverning host kalitini ham olib qo‘yamiz (Actions har safar «taniqsiz server» bilan ishlamasligi uchun):

```bash
ssh-keyscan -H SERVER_IP 2>/dev/null
```

### 2.2. GitHub repository secrets

**Repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Qiymat | Majburiy |
|---|---|---|
| `SERVER_HOST` | server IP yoki `crm.example.uz` | ✅ |
| `SERVER_USER` | `crm` | ✅ (bo‘lmasa `crm` deb olinadi) |
| `SERVER_SSH_KEY` | `~/.ssh/gh_actions` maxfiy kaliti — `-----BEGIN` dan `-----END OPENSSH PRIVATE KEY-----` gacha, to‘liq | ✅ |
| `SERVER_PORT` | `22` (SSH porti boshqa bo‘lsa — o‘shanisi) | ➖ |
| `SERVER_APP_DIR` | `/opt/sales-crm` (boshqa katalog bo‘lsa) | ➖ |
| `SERVER_SSH_KNOWN_HOSTS` | `ssh-keyscan` chiqargan qatorlar | ➖ (tavsiya etiladi) |

Bu yerga **faqat serverga ulanish** ma’lumotlari kiradi. PostgreSQL paroli, JWT kalitlari,
admin paroli, SMTP ma’lumotlari GitHub'ga **umuman yuborilmaydi** — ular serverdagi
`.env.production` da qoladi. Secret qiymatlari Actions loglarida avtomatik `***` bilan yashiriladi.

### 2.3. Workflow qo‘shish uchun token huquqi

`.github/workflows/` ichidagi faylni push qilish uchun token'da **workflow** huquqi bo‘lishi kerak
(avval shu sababli xato chiqqan edi):

- **Fine-grained token**: Settings → Developer settings → Personal access tokens → Fine-grained →
  tokenni tahrirlab **Repository permissions → Workflows: Read and write** qo‘shasiz;
- **Classic token**: token huquqlarida `workflow` katagini belgilaysiz.

Token satrining o‘zi o‘zgarmaydi — faqat huquq qo‘shiladi. Tokenni menga (yoki hech kimga) yubormang.
Push xatosi shunday ko‘rinadi: `refusing to allow a Personal Access Token to create or update workflow`.

---

## 3. Deploy qanday ishlaydi

`.github/workflows/deploy-production.yml`:

- **Qachon:** `main` ga push bo‘lib, **CI muvaffaqiyatli tugagach** (`workflow_run`). Testdan
  o‘tmagan kod serverga chiqmaydi. Qo‘lda ham: **Actions → Deploy (production) → Run workflow**
  (xohlagan commit SHA sini kiritish mumkin).
- **Nima qiladi:** SSH kalitini sozlaydi va serverda bitta buyruq bajaradi:
  `cd /opt/sales-crm && ./deploy/deploy.sh <commit-sha>`.
- **Bir vaqtda bitta deploy:** `concurrency` va serverdagi `flock` qulfi.

`deploy/deploy.sh` tartibi:

| Qadam | Nima bo‘ladi | Xato bo‘lsa |
|---|---|---|
| 1 | `git fetch`, maqsad commit aniqlanadi, oldingi commit eslab qolinadi | — |
| 2 | `docker compose build` — **ilova hali eski versiyada ishlaydi** | kod oldingi commitga qaytariladi, ilovaga tegilmaydi |
| 3 | `./scripts/backup-db.sh` — migratsiyadan oldingi zaxira | ogohlantirish, davom etadi |
| 4 | `docker compose run --rm migrate` → `prisma migrate deploy` + `db:sync-permissions` | kod qaytariladi, zaxira yo‘li ko‘rsatiladi |
| 5 | `docker compose up -d --no-build` — backend/frontend almashtiriladi | — |
| 6 | `/api/health` tekshiruvi (40 × 3 s = 2 daqiqa) | avtomatik rollback: oldingi commit qayta yig‘iladi va ko‘tariladi |
| 7 | image'lar SHA bilan teglanadi, `.deploy/last-good` yoziladi, eski image'lar tozalanadi | — |

`postgres` servisi va `crm_pgdata` volume'i deployda **umuman o‘zgarmaydi**: skriptda
`down -v`, `volume rm` kabi buyruqlar yo‘q — ma’lumotlar joyida qoladi. Yuklangan hujjatlar ham
alohida `crm_uploads` volume'ida.

---

## 4. Deployni sinash

1. Kichik o‘zgarish (masalan README'ga bitta qator) → `git add . && git commit -m "deploy sinovi" && git push origin main`.
2. GitHub → **Actions**: avval `CI`, keyin `Deploy (production)` ishga tushadi. Deploy logida
   serverdagi qadamlar ko‘rinadi (build → zaxira → migratsiya → up → sog‘liq).
3. Tekshirish:

```bash
curl -s https://crm.example.uz/api/health
ssh crm@SERVER_IP 'cd /opt/sales-crm && git log --oneline -1 && cat .deploy/last-good && tail -5 .deploy/history.log'
```

Serverda qo‘lda ham ishga tushirish mumkin (Actions'siz):

```bash
cd /opt/sales-crm && ./deploy/deploy.sh
```

---

## 5. Rollback

**Avtomatik:** yangi versiya sog‘liq tekshiruvidan o‘tmasa, `deploy.sh` kodni oldingi commitga
qaytarib, konteynerlarni qayta ko‘taradi va xato bilan tugaydi. CRM ishlashda davom etadi.

**Qo‘lda:**

```bash
cd /opt/sales-crm
./deploy/rollback.sh                 # oxirgi muvaffaqiyatli deploy commitiga
./deploy/rollback.sh HEAD~1          # bitta commit orqaga
./deploy/rollback.sh a1b2c3d         # aniq commitga
```

Muhim: Prisma migratsiyalari **orqaga qaytarilmaydi** (faqat oldinga qo‘llanadi). Agar yangi
sxema eski kod bilan mos kelmasa, deploy boshida olingan zaxirani tiklash kerak:

```bash
ls -t backups/ | head
./scripts/restore-db.sh backups/crm-2026-09-20_03-00.sql.gz
```

Deploy tarixi va oxirgi ishlagan commit: `.deploy/history.log`, `.deploy/last-good`.
Oxirgi hafta image'lari `crm-backend:<sha>` / `crm-frontend:<sha>` teglari bilan saqlanadi
(`docker images | grep crm-`).

---

## 6. Zaxira (backup)

- Kunlik cron: `03:00`, `backups/crm-<sana>.sql.gz`, **14 kun** saqlanadi (`setup-server.sh` qo‘shadi).
- Har deploy oldidan qo‘shimcha zaxira olinadi.
- `pg_dump` ishlab turgan bazadan oladi — CRM to‘xtamaydi.
- Tiklash: `./scripts/restore-db.sh backups/<fayl>` (backend to‘xtatiladi, keyin qayta yoqiladi).
- Hujjat/chek fayllari bazada emas, `crm_uploads` volume'ida — ularni ham zaxiralang:

```bash
docker run --rm -v crm_uploads:/data -v "$PWD/backups":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

- Zaxirani vaqti-vaqti bilan boshqa joyga ko‘chirib turing (bitta serverdagi nusxa zaxira emas):

```bash
rsync -az crm@SERVER_IP:/opt/sales-crm/backups/ ~/crm-backups/
```

---

## 7. Xavfsizlik ro‘yxati

| Talab | Holat |
|---|---|
| SSH faqat kalit bilan, root login yopiq | `setup-server.sh` (authorized_keys mavjud bo‘lsa) |
| UFW: faqat 22/80/443 | `setup-server.sh` |
| PostgreSQL internetga ochiq emas | compose'da `ports` yo‘q, faqat ichki `crm` tarmog‘i |
| Frontend porti tashqariga chiqmaydi | `HTTP_BIND=127.0.0.1` (Docker UFW'ni chetlab o‘tadi, shuning uchun muhim) |
| Secretlar git'da yo‘q | `.gitignore`: `.env*`, `backups/`, `.deploy/` |
| Secretlar loglarda ko‘rinmaydi | deploy skripti `.env.production` ni ekranga chiqarmaydi; Actions secretlarni `***` qiladi |
| HTTPS va HSTS | certbot + production'da backend HSTS sarlavhasi |
| Cookie faqat HTTPS orqali | `NODE_ENV=production` → `secure` cookie |
| Serverdagi git kaliti faqat o‘qish huquqi bilan | Deploy key (write access belgilanmagan) |

---

## 8. Kundalik ish: shu yetarli

```bash
git add .
git commit -m "CRM update"
git push origin main
```

Qo‘shimcha buyruq **kerak emas**. Serverga SSH kirish faqat quyidagi hollarda kerak bo‘ladi:

| Holat | Buyruq |
|---|---|
| Yangi migratsiya qo‘shildi | Hech narsa — deploy o‘zi `migrate deploy` qiladi |
| `.env.production` ga yangi o‘zgaruvchi kerak | `nano .env.production`, keyin `./deploy/deploy.sh` (yoki Actions'ni qayta ishga tushirish) |
| Rollback | `./deploy/rollback.sh` |
| Zaxiradan tiklash | `./scripts/restore-db.sh backups/<fayl>` |
| Loglarni ko‘rish | `docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=200 backend` |

---

## 9. Muammolar

| Belgi | Sabab / yechim |
|---|---|
| Actions'da `Permission denied (publickey)` | `SERVER_SSH_KEY` to‘liq ko‘chirilmagan (`BEGIN`/`END` qatorlari bilan) yoki `authorized_keys` ga ochiq kalit qo‘shilmagan |
| `Host key verification failed` | `SERVER_SSH_KNOWN_HOSTS` noto‘g‘ri — `ssh-keyscan -H SERVER_IP` ni qayta oling yoki secretni o‘chirib tashlang |
| Deploy «Boshqa deploy ketmoqda» | oldingi deploy tugamagan; `.deploy/deploy.lock` qulfi bo‘shashini kuting |
| `refusing to allow a Personal Access Token to create or update workflow` | tokenda `workflow` huquqi yo‘q — 2.3-bo‘lim |
| Sog‘liq tekshiruvi o‘tmadi, avtomatik rollback bo‘ldi | `docker compose ... logs backend` da xato; odatda `.env.production` da yetishmayotgan o‘zgaruvchi yoki migratsiya muammosi |
| `502 Bad Gateway` | konteynerlar ko‘tarilmagan: `docker compose ... ps`, `curl -s http://127.0.0.1:8080/healthz` |
| Sertifikat olinmadi | `dig +short crm.example.uz` IP ni qaytarmayapti yoki 80-port yopiq |
| Disk to‘lib qoldi | `docker system df`, `docker image prune -f`, eski zaxiralarni tozalash |

Batafsil: [HOSTING-VA-DOMEN.md](HOSTING-VA-DOMEN.md) (birinchi o‘rnatish), [DEPLOYMENT.md](DEPLOYMENT.md) (operatsion tafsilotlar).
