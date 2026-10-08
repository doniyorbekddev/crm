# CRM 4.0 — Faza 0: production barqarorlashtirish

> Boshlangan va yakunlangan: 2026-10-05 · Asos: [CRM-4.0-AUDIT.md](CRM-4.0-AUDIT.md) §12 · Doira: faqat quyidagi 7 band.
> Yangi imkoniyat, yangi modul, sxema o'zgarishi va migratsiya **yo'q**. Commit qilinmagan — ko'rib chiqish uchun.

Har band bir xil tartibda: fayllar → sabab → eng kichik xavfsiz tuzatish → mavjud testlar → tuzatish → maqsadli testlar → umumiy tekshiruv.
"Verification Result" da faqat haqiqatan yurgizilgan tekshiruvlar yozilgan; yurgizilmagani ochiq aytilgan.

---

## 1. TRUST_PROXY / haqiqiy mijoz IP manzili

### Issue
Production zanjirida ikki proxy bor (host nginx → konteyner nginx → backend), backend esa `trust proxy = 1` bilan ishlaydi.

### Root Cause
- `deploy/nginx/crm.conf.example:34` — host nginx `X-Forwarded-For: <mijoz>` qo'shadi.
- `frontend/nginx/app.conf:46` — konteyner nginx `$proxy_add_x_forwarded_for` bilan **o'z qo'shnisining** manzilini (Docker shlyuzi) qo'shadi:
  `X-Forwarded-For: <mijoz>, <docker shlyuzi>`.
- `backend/src/app.ts:27` + `docker-compose.prod.yml:67` — `trust proxy = 1`: Express faqat bevosita qo'shnisiga ishonadi va zanjirning
  **oxirgi** yozuvini oladi. Natijada `req.ip` = Docker shlyuzi — hamma foydalanuvchi uchun bir xil.

Oqibat (Express semantikasidan kelib chiqadi; ishlab turgan serverda tasdiqlanmagan):
- `apiLimiter` (300 so'rov/daq) butun markaz uchun umumiy — band paytda hammaga 429;
- `authLimiter` (15 daqiqada 10 ta muvaffaqiyatsiz urinish) umumiy — bir kishining 10 ta xato paroli **hammaning** loginini 15 daqiqaga yopadi;
- `audit_logs.ip` har yozuvda bir xil.

To'g'ridan-to'g'ri rejimda (`HTTP_BIND=0.0.0.0`, host nginx'siz) zanjir bitta proxy — o'sha holatda `1` to'g'ri. Demak to'g'ri son
topologiyaga bog'liq; `TRUST_PROXY` ni shunchaki `2` ga o'zgartirish to'g'ridan-to'g'ri rejimda mijozga IP ni soxtalashtirish imkonini berardi.

### Fix
Sonni o'zgartirish o'rniga zanjir **konteyner nginx'da normallashtiriladi**:
- `frontend/nginx/app.conf`: `real_ip` moduli. Ulanish ichki manbadan (loopback, Docker yoki xususiy tarmoq) kelsa, mijoz manzili
  sifatida `X-Forwarded-For` ning **oxirgi** yozuvi olinadi — uni host nginx qo'shgan; mijoz yuborgan soxta qiymatlar undan oldinda
  qoladi. `real_ip_recursive off` (yopish ko'rigida `on` dan o'zgartirildi: `on` bo'lsa xususiy tarmoqdagi mijoz soxta manzil o'tkaza olardi).
  Backendga `X-Forwarded-For: $remote_addr` — bitta, aniqlangan manzil yuboriladi.
- Shunda backend har ikki topologiyada bitta yozuv oladi va `TRUST_PROXY=1` to'g'ri bo'lib qoladi.
- `docker-compose.prod.yml`: qiymat **qat'iy `1`** (faqat izoh yangilandi). Qayta yoziladigan qilish yopish ko'rigida bekor qilindi:
  serverdagi `.env.production` da tasodifiy `TRUST_PROXY=0` bo'lsa, nuqson qaytib kelardi.
- `backend/src/app.ts`: `createApp({ trustProxy })` — test uchun ixtiyoriy parametr (standart — `env.TRUST_PROXY`).

**Ma'lum cheklov:** host nginx'siz rejimda (`HTTP_BIND=0.0.0.0`) xususiy tarmoqdagi mijoz sarlavhani soxtalashtira oladi — production'da
host nginx (yoki boshqa ishonchli proxy) bo'lishi kerak.

### Files Changed
`frontend/nginx/app.conf`, `docker-compose.prod.yml`, `backend/src/app.ts`, `backend/tests/clientIp.test.ts` (yangi), `docs/deployment.md`.

### Tests Added/Updated
`backend/tests/clientIp.test.ts` (yangi, 6 test):
- proxy bitta manzil yuborsa, audit aynan shu IP ni yozadi;
- zanjir normallashtirilmasa (`"mijoz, shlyuz"`, trust proxy = 1) — oxirgi proxy manzili olinadi (**nuqsonning o'zi qotirilgan**);
- proxy'siz rejimda mijoz yuborgan `X-Forwarded-For` e'tiborga olinmaydi;
- rate limit: bir mijozning 12 ta xato urinishi boshqa IP dagi foydalanuvchini bloklamaydi;
- zanjir normallashtirilmasa, bitta mijoz hammani bloklaydi (nega Nginx sozlamasi shart);
- hisob darajasidagi blok IP ga bog'liq emas: 8 ta xato paroldan keyin hisob boshqa IP dan, to'g'ri parol bilan ham yopiq; boshqa hisobga ta'sir qilmaydi.

Mavjud `rateLimit.test.ts` o'zgarmagan.

### Verification Result
- Backend testlari: **o'tdi** (`clientIp` 6/6, `rateLimit` 2/2).
- **Yangilanish (2026-10-08): konfiguratsiya lokal Docker'da bajarib tekshirildi.** `nginx:1.27-alpine` (production obrazi bilan bir xil)
  + sarlavhalarni qaytaradigan soxta backend, mijoz — xususiy Docker tarmog'idagi boshqa konteyner:
  `nginx -t` — muvaffaqiyatli; `X-Forwarded-For` yo'q → backend mijoz konteynerining manzilini oladi; `X-Forwarded-For: 203.0.113.7`
  (host nginx qo'shgandek) → `203.0.113.7`; `X-Forwarded-For: 1.2.3.4, 203.0.113.7` (mijoz soxtasi + host nginx) → `203.0.113.7`.
  Ya'ni sintaksis va `real_ip` mantig'i tasdiqlandi. **Tasdiqlanmagani** — production'dagi haqiqiy zanjir (host nginx sozlamasi,
  `audit_logs.ip`, rate limit): quyidagi B–G qadamlar hali serverda bajarilishi kerak. Quyidagi band — tekshiruvdan oldingi holat.
- **Nginx konfiguratsiyasi bajarib tekshirilmagan.** Bu muhitda Docker ishlamaydi va nginx o'rnatilmagan — `nginx -t` ham, ikki
  proxy'li zanjir sinovi ham yurgizilmadi. O'zgarish standart `ngx_http_realip_module` direktivalaridan iborat (rasmiy `nginx` obrazida
  bor), lekin sintaksis va xatti-harakat **serverda tasdiqlanishi shart**.
- Demak bu band: backend tomoni tasdiqlangan, nginx tomoni — yo'q.

### Production Verification Required
**⚠️ PRODUCTION VERIFICATION REQUIRED.** Bu band production'da tasdiqlanmagan. Quyidagi ro'yxat serverda, tartib bilan bajariladi;
`$DC` = `docker compose -f docker-compose.prod.yml --env-file .env.production`, `$PSQL` = `$DC exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c`.

**0. Deploy'dan oldin — taxminni tekshirish.** Haqiqiy zanjir "mijoz → host nginx → konteyner nginx → backend" ekanini tasdiqlang:
```bash
sudo nginx -T 2>/dev/null | grep -n "proxy_pass\|X-Forwarded-For\|set_real_ip_from\|real_ip_header"   # host nginx
$PSQL "SELECT ip, count(*) FROM audit_logs WHERE \"createdAt\" > now() - interval '7 days' GROUP BY ip ORDER BY 2 DESC LIMIT 10;"
```
- Deyarli hamma yozuv bitta xususiy manzilda (`172.x.x.x`) → nuqson tasdiqlandi, davom eting.
- Turli ochiq manzillar → serverdagi sozlama repozitoriydagi misoldan farq qiladi: **to'xtang**, host nginx konfiguratsiyasini ko'rib chiqing.
- Host nginx oldida CDN/yuk taqsimlagich bo'lsa → host nginx'da ularning manzillari uchun `set_real_ip_from` kerak (repozitoriydan tashqarida).

**A. `nginx -t`** (yangi obraz yig'ilgach, ishga tushirishdan oldin):
```bash
$DC build frontend && $DC run --rm --no-deps frontend nginx -t
```
Kutiladi: `syntax is ok`, `test is successful`. Xato bo'lsa — deploy qilinmaydi.

**B. Haqiqiy zanjir orqali so'rov** (deploy'dan keyin, serverdan tashqaridagi tarmoqdan — masalan telefon interneti; o'z ochiq manzilingizni
`curl -s https://ifconfig.me` bilan bilib oling):
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<domen>/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"ip-tekshiruv@example.uz","password":"NotoGri123"}'      # 401 kutiladi
```

**C. `audit_logs.ip` haqiqiy mijoz manzilini saqlaydi:**
```bash
$PSQL "SELECT ip, \"createdAt\" FROM audit_logs WHERE action = 'auth.login_failed' ORDER BY \"createdAt\" DESC LIMIT 3;"
```
Kutiladi: `ip` = B-qadamdagi ochiq manzilingiz. `172.x`/`10.x`/`127.0.0.1` chiqsa — **o'tmadi**.

**D. Rate limit to'g'ri manzil bo'yicha:** bitta tarmoqdan (1-qurilma) 11 marta noto'g'ri login yuboring — 11-so'rov `429` qaytarishi kerak:
```bash
for i in $(seq 1 11); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://<domen>/api/auth/login \
  -H 'Content-Type: application/json' -d "{\"email\":\"rl-$i@example.uz\",\"password\":\"NotoGri123\"}"; done; echo
```
Shu zahoti **boshqa tarmoqdan** (2-qurilma) haqiqiy foydalanuvchi bilan kiring — kirish **o'tishi** kerak. 2-qurilma ham `429` olsa — manzillar hali ham birlashib qolgan.

**E. Hisob darajasidagi blok:** sinov hisobiga 1-qurilmadan 8 marta noto'g'ri parol yuboring; keyin 2-qurilmadan **to'g'ri** parol bilan —
`429` ("Hisob 15 daqiqaga vaqtincha bloklandi") kutiladi (blok hisobga bog'liq, IP ga emas — bu mavjud xatti-harakat). Auditda:
```bash
$PSQL "SELECT action, ip FROM audit_logs WHERE action IN ('auth.login_failed','auth.login_locked') ORDER BY \"createdAt\" DESC LIMIT 10;"
```
Kutiladi: muvaffaqiyatsiz urinishlar 1-qurilma manzili bilan, `auth.login_locked` — 2-qurilma manzili bilan. 15 daqiqadan keyin hisob o'zi ochiladi.

**F. Soxta sarlavha bilan urinish:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<domen>/api/auth/login -H 'X-Forwarded-For: 1.2.3.4' -H 'X-Real-IP: 1.2.3.4' \
  -H 'Content-Type: application/json' -d '{"email":"spoof-tekshiruv@example.uz","password":"NotoGri123"}'
$PSQL "SELECT ip FROM audit_logs WHERE action = 'auth.login_failed' ORDER BY \"createdAt\" DESC LIMIT 1;"
```
Kutiladi: `ip` = haqiqiy ochiq manzilingiz, **`1.2.3.4` emas**.

**G. Soxtalashtirish cheklovni chetlab o'tmaydi:** D-qadamdagi siklni har so'rovda boshqa soxta `X-Forwarded-For` bilan takrorlang
(`-H "X-Forwarded-For: 9.9.9.$i"`). Kutiladi: baribir 11-so'rovda `429` (hisob haqiqiy manzil bo'yicha yuritiladi).

**Natijani yozing:** har qadam uchun o'tdi/o'tmadi va sana — shu hujjatning "Phase 0 Closure Report" bo'limiga. C, F yoki G o'tmasa —
deploy'ni orqaga qaytaring (`deploy/rollback.sh`) va host nginx konfiguratsiyasini tekshiring.

### Risk
O'rta: nginx konfiguratsiyasi o'zgaradi. Xato bo'lsa konteyner ishga tushmaydi — deploy skripti sog'liq tekshiruvida to'xtab, orqaga qaytaradi.

---

## 2. To'lovlar eksportida filial doirasi

### Issue
`GET /payments/export` filial doirasini qo'llamaydi; `GET /payments/:id`, to'lovni bekor qilish va qaytarish ham filialni tekshirmaydi.

### Root Cause
`payment.controller.ts:21-25` eksportga aktyorni uzatmaydi; `paymentService.exportTable(query)` `buildPaymentWhere(query)` ni filial
parametrisiz chaqiradi (`payment.service.ts:260-261`). Ro'yxat va statistika esa `getBranchAccess(actor)` ni uzatadi. `getById`, `remove`,
`refund` to'lovni faqat `id` bo'yicha oladi.

### Fix
Mavjud `branchAccess` yordamchilari qayta ishlatiladi (yangi ruxsat tizimi yo'q):
- `exportTable(actor, query)` — ro'yxat bilan bir xil `buildPaymentWhere(query, access)`;
- `getById(actor, id)` — boshqa filial to'lovi "topilmadi" (404, mavjudligi oshkor qilinmaydi);
- `remove` / `refund` — `assertBranchAccess` (aktyor bo'lsa; provayder webhook'i aktyorsiz ishlaydi va o'zgarmaydi).

### Files Changed
`backend/src/services/payment.service.ts`, `backend/src/controllers/payment.controller.ts`, `backend/tests/branchIsolation.test.ts`.

### Tests Added/Updated
`branchIsolation.test.ts` ga yangi test: ikki filial, har birida to'lov. Filial xodimi (ADMIN): ro'yxat va eksport faqat o'z
filiali; boshqa filialni so'rab eksport — 403; begona to'lov `GET /:id` — 404; bekor qilish va qaytarish — 403 va to'lov o'zgarmagan.
Egasi (OWNER): eksportda ikkala filial, begona to'lov ochiladi.

### Verification Result
**O'tdi** (`branchIsolation` 6/6). Mavjud to'lov testlari o'zgarishsiz o'tdi.

### Production Verification Required
Yo'q.

### Risk
Past. Barcha filialni ko'radigan rollar uchun hech narsa o'zgarmaydi.

---

## 3. Qaytarish (refund) parallelligi

### Issue
Ikki parallel qaytarish so'rovi birgalikda to'lov summasidan oshishi mumkin; bekor qilish (void) va qaytarish ham poyga qilishi mumkin.

### Root Cause
`payment.service.ts:578-612`: to'lov va uning qaytarishlari tranzaksiyadan **oldin**, qulfsiz o'qiladi; qaytariladigan summa shu eskirgan
qiymatdan tekshiriladi. `remove` ham `deletedAt` va qaytarishlar sonini tranzaksiyadan tashqarida tekshiradi (`:520-533`).

### Fix
To'lov yaratishdagi mavjud naqsh qayta ishlatiladi (`SELECT … FOR UPDATE`):
- tranzaksiya boshida o'quvchining **qarz qatori** qulflanadi (to'lov yaratish bilan bir xil qulf — tartib bir xil, deadlock yo'q), keyin
  **to'lov qatori**;
- `deletedAt` va qaytarilgan summa qulf ostida qayta o'qiladi va tekshiriladi;
- daftar, komissiya, qarzni qayta hisoblash va audit — o'zgarmaydi.

Sxema o'zgarmaydi: qaytarish uchun idempotentlik kaliti yangi ustun talab qiladi — Faza 0 da qo'shilmaydi; qulf ortiqcha qaytarishni yopadi.

### Files Changed
`backend/src/services/debtLock.ts` (yangi, kichik yordamchi), `backend/src/services/payment.service.ts`, `backend/tests/paymentConcurrency.test.ts` (yangi).

### Tests Added/Updated
`paymentConcurrency.test.ts` (yangi; poyga ssenariylari 4 marta takrorlanadi):
- 5 ta parallel qaytarish (har biri 600 000, to'lov 1 000 000) — aynan bittasi o'tadi, qaytarilgan jami 600 000, daftarda bitta yozuv;
- to'liq summani 4 ta parallel qaytarish — bitta muvaffaqiyat;
- bekor qilish va qaytarish bir vaqtda — ikkalasi birga o'tmaydi, aralash holat yo'q;
- 3 ta parallel bekor qilish — bitta muvaffaqiyat, ikkita 409, bitta audit yozuvi.

Har testdan keyin qarz invarianti tekshiriladi (qarz qatori = shartnoma narxi va to'lovlar tarixi).

### Verification Result
- **O'tdi** (10/10, 4-band testlari bilan birga).
- **Testlar poygani haqiqatan ushlashi tekshirildi:** qulflar vaqtincha olib tashlanganda 10 testdan 7 tasi yiqildi; qaytarilgach — hammasi o'tdi.
- Mavjud `payments`, `paymentDuplicates`, `finance`, `financeExtra`, `financialPeriods`, `commissions`, `onlinePayment`,
  `paymentProviders`, `paymentSchedule` — o'zgarishsiz o'tdi.

### Production Verification Required
Yo'q.

### Risk
O'rta (moliya yadrosi). Muvaffaqiyatli yo'l natijasi o'zgarmaydi — mavjud `payments`, `finance`, `commissions` testlari o'zgarishsiz o'tishi shart.

---

## 4. Qarzga ta'sir qiluvchi tahrirlar

### Issue
Chegirma berish/bekor qilish, o'quvchini tahrirlash va taklif bonusi qarzni qulfsiz, tranzaksiyadan oldin o'qilgan qiymat bilan yozadi.

### Root Cause
| Amal | Joy | Muammo |
|---|---|---|
| Chegirma berish | `discount.service.ts:572-615` | `paid`, `contractPrice`, cheklovlar tranzaksiyadan oldin o'qiladi; parallel to'lov yoki ikkinchi chegirma bilan qarz eskirgan qiymatda qoladi yoki umumiy chegara oshadi |
| Chegirmani bekor qilish | `discount.service.ts:621-655` | `revokedAt` tashqarida tekshiriladi — ikki marta bekor qilish narxni ikki marta oshirishi mumkin |
| Promo kod limiti | `discount.service.ts:258, 598` | limit tashqarida tekshiriladi, keyin shartsiz `increment` |
| Taklif bonusi | `referral.service.ts:229-262`, `discount.service.ts:665-695` | holat tashqarida tekshiriladi — ikki marta bosish ikki bonus beradi |
| O'quvchini tahrirlash | `student.service.ts:436-470` | `paid` tranzaksiyadan oldin o'qiladi |

### Fix
Har amal tranzaksiyasi **qarz qatorini qulflashdan** boshlanadi (3-banddagi yordamchi), keyin kerakli qiymatlar qulf ostida qayta o'qiladi:
- chegirma berish: narx/chegirmalar o'zgargan bo'lsa — 409 "ma'lumot o'zgardi, qayta urinib ko'ring"; `paid` qulflangan qatordan;
- bekor qilish va taklif bonusi: holat shartli yangilanish bilan (`updateMany … where revokedAt IS NULL` / `status = CONVERTED`) — ikkinchi so'rov 409;
- promo limit: shartli atomik oshirish (limit to'lgan bo'lsa 422);
- o'quvchini tahrirlash: `paid` qulflangan qatordan.

`Payment` snapshot ustunlari va daftar o'zgarmaydi. Enrollment kiritilmaydi.

### Files Changed
`backend/src/services/debtLock.ts`, `backend/src/services/discount.service.ts`, `backend/src/services/referral.service.ts`,
`backend/src/services/student.service.ts`, `backend/tests/paymentConcurrency.test.ts`.

### Tests Added/Updated
`paymentConcurrency.test.ts`:
- chegirma va to'lov bir vaqtda — qarz ikkalasini hisobga oladi (avval to'lov "yo'qolishi" mumkin edi);
- bir xil chegirma 3 marta parallel — bittasi beriladi;
- chegirmani 3 marta parallel bekor qilish — narx bir marta qaytadi;
- promo kod (limit 1) uch o'quvchiga parallel — bittasi oladi, `usedCount` = 1;
- taklif bonusi 3 marta parallel — bitta bonus;
- shartnoma narxini tahrirlash va to'lov bir vaqtda — qarz mos qoladi.

### Verification Result
**O'tdi** (yuqoridagi 10/10 ichida). Mavjud `referralDiscount`, `students` testlari o'zgarishsiz o'tdi.

### Production Verification Required
Yo'q.

### Risk
O'rta. Bir vaqtda kelgan ikkinchi so'rov endi 409 oladi (avval jimgina noto'g'ri yozardi).

---

## 5. Guruhni tahrirlashda xona saqlanmaydi

### Issue
Guruh formasida xona almashtirilsa, saqlangandan keyin eski xona qoladi.

### Root Cause
`group.service.ts` `update`: ziddiyat tekshiruviga `roomId` uzatiladi (`:274`), lekin `tx.group.update` ning `data` blokida `roomId`
yo'q (`:288-299`). `create` da bor (`:232`). Frontend to'g'ri yuboradi (`GroupFormModal.tsx:67`). Mavjud testlar faqat yaratishni tekshiradi.

### Fix
`data` ga `roomId: input.roomId ?? null` qo'shiladi. Ruxsat, filial va ziddiyat tekshiruvi o'zgarmaydi.

### Files Changed
`backend/src/services/group.service.ts` (bitta qator), `backend/tests/rooms.test.ts`.

### Tests Added/Updated
`rooms.test.ts` ga yangi test: xonani almashtirish (javobda va bazada yangi xona); band xonaga o'tkazish — 409, guruh eski xonasida
qoladi; xonasiz saqlash — xona bo'shatiladi; ruxsatsiz rol — 403.

### Verification Result
**O'tdi** (`rooms` + `groups` 15/15). Tuzatish vaqtincha olib tashlanganda yangi test yiqilishi tasdiqlandi.

### Production Verification Required
Yo'q. (Tuzatishgacha tahrirlangan guruhlarda xona eski qiymatda qolgan bo'lishi mumkin — ma'lumot avtomatik tuzatilmaydi.)

### Risk
Past.

---

## 6. Zaxira xavfsizligi

### Issue
Zaxira shu serverda saqlanadi; yuklangan fayllar zaxiralanmaydi; muvaffaqiyatsiz dump yarim fayl qoldirishi mumkin.

### Root Cause
`scripts/backup-db.sh` faqat `pg_dump | gzip` ni `backups/` ga yozadi. Fayllar (`crm_uploads` volume) uchun skript yo'q — faqat hujjatda
qo'lda buyruq. Tashqi nusxa — `docs/deployment.md` dagi tavsiya, avtomatlashtirilmagan.

### Fix
Katta platforma qurilmaydi — mavjud skript xavfsiz yaxshilanadi:
- atomik yozish (`.partial` → `mv`), `gzip -t` yaxlitlik tekshiruvi, bo'sh dumpni rad etish;
- yuklangan fayllar arxivi (`uploads-<sana>.tar.gz`) shu skriptda;
- ixtiyoriy tashqi nusxa: `BACKUP_REMOTE` (rsync manzili) berilsa — nusxalanadi; berilmasa aniq ogohlantirish yoziladi;
- hujjat: [CRM-4.0-BACKUP-RECOVERY.md](CRM-4.0-BACKUP-RECOVERY.md).

### Files Changed
`scripts/backup-db.sh`, `docs/CRM-4.0-BACKUP-RECOVERY.md` (yangi), `docs/deployment.md`.

### Tests Added/Updated
Avtomatik test qo'shilmadi (shell skript, CI da Docker stack yo'q). Qo'lda tekshirildi — pastda.

### Verification Result
- `bash -n` va `shellcheck` — o'tdi.
- Soxta `docker` bilan 8 holat: odatiy yurish; dump xatosi; uzilgan dump; backend o'chiq; tashqi nusxa (lokal papkaga); tashqi
  manzil xatosi; arxiv tarkibi; eski nusxalarni tozalash — **kutilgandek**. Xatoda yarim fayl qolmaydi, chiqish kodi 1.
- Sinov ikki xatoni yo'l-yo'lakay ochdi va ular tuzatildi: (a) `tar -z` chiqishi ayrim tizimlarda `gzip -t` dan o'tmaydi — siqish
  xost tomoniga ko'chirildi; (b) `pg_dump` 17 yakunlovchi satrdan keyin `\unrestrict` yozadi — tekshiruv oxirgi 20 qatorni qaraydi.
- Haqiqiy `pg_dump` (lokal dev baza) skriptdan o'tdi va hosil bo'lgan nusxa `verify-backup.sh` bilan vaqtinchalik bazaga
  **tiklandi**: 107 jadval, 62 migratsiya.
- **Production stack'da yurgizilmagan; production nusxasidan tiklash sinalmagan; haqiqiy uzoq serverga `rsync` sinalmagan.**

### Production Verification Required
**Ha** — tashqi manzil va kalitlar serverda sozlanadi; tiklash production nusxasida sinab ko'rilmagan.

### Risk
Past–o'rta: skript cron ostida ishlaydi; yangi tekshiruvlar xato bo'lsa nolga teng bo'lmagan kod bilan chiqadi (avval jim o'tardi).

---

## 7. Bildirishnoma toifalarining ikki nusxasi

### Issue
Ikki xil toifa ro'yxati bor: `config/notificationTypes.ts` (7 toifa, bot sozlamalari ishlatadi) va `validators/notification.validator.ts`
(boshqa 7 toifa, shu oy ro'yxat filtri uchun qo'shilgan).

### Root Cause
Toifa filtri qo'shilganda mavjud ta'rif qidirilmagan va ikkinchi, boshqacha guruhlangan ro'yxat yozilgan. Ayrim turlar ikki ro'yxatda
turli toifada (masalan `RISK_INCREASED`, `WEEKLY_REPORT`).

### Fix
- **Yagona manba:** `backend/src/config/notificationTypes.ts` (avvalgi, `Record<NotificationType, …>` bilan to'liqligi kompilyatsiyada tekshiriladi).
- Validator va servis shu yerdan import qiladi; validatordagi nusxa o'chiriladi.
- **Orqaga moslik:** API eski qiymatlarni qabul qilishda davom etadi (`SALES` → `MARKETING`, `FINANCE` → `PAYMENT`, `ACADEMIC` → `ACHIEVEMENT`).
- Frontend kanonik toifalarga o'tadi (backenddan import qila olmaydi — nusxa qoladi, lekin kontrakt testi bilan qotiriladi).
- Testlar: (a) validator kanonik ro'yxatning o'zini ishlatadi; (b) `backend/src` da ro'yxat faqat bitta joyda e'lon qilingan;
  (c) frontend nusxasi backend bilan bir xil.

### Files Changed
`backend/src/config/notificationTypes.ts`, `backend/src/validators/notification.validator.ts`, `backend/src/services/notification.service.ts`,
`backend/tests/notifications.test.ts`, `backend/tests/unit/notificationCategories.test.ts` (yangi), `frontend/src/types/notification.ts`,
`frontend/src/utils/notificationLabels.ts`, `e2e/specs/table-sort.spec.ts`, `docs/notifications.md`.

### Tests Added/Updated
- `backend/tests/unit/notificationCategories.test.ts` (yangi, 5 test): har tur aynan bitta toifada; filtr kanonik ro'yxatning o'zini
  qabul qiladi; eski nomlar kanonikka o'giriladi; `backend/src` da ro'yxat va tur→toifa jadvali **faqat bitta faylda** e'lon qilingan;
  frontend nusxasi backend bilan bir xil.
- `backend/tests/notifications.test.ts`: toifa testi kanonik qiymatlarga o'tkazildi (qat'iyligi oshdi: yana bitta toifa va eski
  nomlar mosligi tekshiriladi).
- `e2e/specs/table-sort.spec.ts`: toifa tabi nomi va so'rov parametri kanonik qiymatga o'tkazildi (tekshiruvlar o'zgarmagan).

### Verification Result
**O'tdi**: unit 5/5, `notifications` 13/13, `telegramSettings` (bot sozlamalari, o'zgarmagan) o'tdi, E2E toifa testi o'tdi.

### Production Verification Required
Yo'q.

### Risk
Past. Foydalanuvchi uchun ko'rinadigan o'zgarish: bildirishnomalar sahifasidagi toifa tablari nomi va guruhlanishi bot sozlamalaridagi bilan bir xil bo'ladi.

---

# Phase 0 Closure Report

> Yopish tekshiruvi: 2026-10-05 – 2026-10-06. Commit qilinmagan. Belgilar: ✅ VERIFIED · ⚠️ REQUIRES PRODUCTION VERIFICATION · ❌ NOT VERIFIED · 🔴 BLOCKER.

## Completed

| # | Band | Holat |
|---|---|---|
| 2 | To'lovlar eksporti va `id` bo'yicha amallarda filial doirasi | ✅ VERIFIED |
| 3 | Qaytarish / bekor qilish parallelligi | ✅ VERIFIED |
| 4 | Qarzga ta'sir qiluvchi tahrirlar (chegirma, promo limit, taklif bonusi, o'quvchini tahrirlash) | ✅ VERIFIED |
| 5 | Guruhni tahrirlashda xona | ✅ VERIFIED |
| 7 | Bildirishnoma toifalari — bitta manba | ✅ VERIFIED |
| 1 | TRUST_PROXY: backend xatti-harakati (IP, rate limit, login bloki) | ✅ VERIFIED (testlar) |
| 1 | TRUST_PROXY: nginx konfiguratsiyasi va haqiqiy zanjir | ⚠️ REQUIRES PRODUCTION VERIFICATION (sintaksis va `real_ip` mantig'i 2026-10-08 da lokal Docker'da ✅ tasdiqlandi; haqiqiy zanjir — serverda) |
| 6 | Zaxira skripti (repozitoriy tomoni) | ✅ VERIFIED (lokal) |
| 6 | Production zaxirasi va tiklash | ⚠️ REQUIRES PRODUCTION VERIFICATION |
| — | Tasodifiy test yiqilishlari (yopish bosqichida topildi) | ✅ VERIFIED — sabab topildi va tuzatildi |

## Test Stability

### CURRICULUM TEST
- **Root cause:** test infratuzilmasi, regressiya emas. Supertest har so'rov uchun `http.createServer(app).listen(0)` qiladi: server barcha
  manzillarga bog'lanadi, tizim tasodifiy port beradi, so'rov esa `127.0.0.1:<port>` ga yuboriladi. Boshqa lokal jarayon aynan
  `127.0.0.1:<port>` ni tinglayotgan bo'lsa, ulanish o'shanga tushadi. Shu mashinada bu — VS Code kengaytma jarayonining (`Code Helper
  (Plugin)`, `--inspect`) Node inspector'i: u tasodifiy portda tinglaydi va oddiy HTTP so'rovga `400 "WebSockets request was expected"`
  qaytaradi. `curriculum` testida modul/mavzu yaratuvchi so'rovlardan biri shunday begona `400` olgan — keyingi tekshiruv kutilgan
  ro'yxatni topmagan (yiqilish 481 ms da, vaqt chegarasi emas). Xuddi shu sabab yopish bosqichidagi birinchi to'liq yurishda
  `endpointSecurity` testini yiqitdi — u yerda dalil aniq ushlandi: `POST /api/homework/:id/attachments/upload → 400`.
- **Fixed:** ha. `backend/tests/setupLoopback.ts` (vitest `setupFiles`): har test faylida bitta server, **aniq `127.0.0.1` ga** bog'lanadi
  (bir xil manzilda band portni tizim bermaydi) va fayl oxirigacha ishlatiladi; `request(app)` shu serverga yo'naltiriladi. Test
  fayllari, tekshiruvlar va vaqt chegaralari o'zgarmagan.
- **Reproduction:** ishonchli qayta chiqarildi. 10 ta `node --inspect=127.0.0.1:<port>` jarayoni efemer oraliqda (50011…63511) ochiladi,
  so'ng 30 100 ta ketma-ket so'rov yuboriladi: **tuzatishsiz 17–22 tasi** begona `400 "WebSockets request was expected"` oldi (uch
  yurish: 22, 21, 17 — nazariy kutilgan 30100 × 10/16384 ≈ 18). Begona tinglovchilar bo'lmaganda tuzatishsiz ham 0 — shuning uchun
  nosozlik ba'zi kunlari chiqib, ba'zi kunlari chiqmagan (VS Code porti oraliqqa tushgan-tushmaganiga qarab).
- **Verification:** bir xil sharoitda (10 ta tinglovchi ochiq) tuzatish bilan **30 100 so'rovdan 0 tasi** adashdi. To'liq backend
  to'plami shu sharoitda ikki marta: **976/976, 976/976**. `curriculum` + `finance` + `endpointSecurity` + qo'shni fayllar
  (`courses`, `dashboard`) shu sharoitda 10 marta ketma-ket: 0 yiqilish. `curriculum` yolg'iz 12 marta: 0 yiqilish.
- **Remaining risk:** past. (a) Tuzatish yo'lida ikki variant ishlamagan edi (biri portlarni tugatdi, ikkinchisida server har
  so'rovdan keyin yopilib qolayotgan ekan) — yakuniy variant nazorat tajribasi bilan tasdiqlangan. (b) Mexanizmning yadro darajasidagi
  tafsiloti (nega tizim aynan shu tinglovchilar portini beradi) to'liq tushuntirilmagan: oddiy `net` tinglovchilari bilan qayta
  chiqmadi, inspector bilan chiqdi. Tuzatish bunga bog'liq emas (port fayl boshiga bir marta, aniq manzilga bog'lanadi). (c) CI
  (Linux) da bu holat kuzatilmagan — tuzatish u yerda ham zararsiz.

### Moliya testi (20 soniyalik to'xtash)
- **Tasnif:** xuddi shu sabab, boshqa ko'rinishi — so'rov javob bermaydigan begona tinglovchiga tushgan va test vaqt chegarasigacha
  kutgan. Bu ishlash beqarorligi, baza "isishi" yoki poyga **emas**.
- **Dalil:** test 5 ta oddiy so'rovdan iborat; diagnostikada bitta so'rovning mediani 1–4 ms. Yopish bosqichidagi stress yurishlarida
  begona `400` bilan birga 8 soniyalik javobsiz osilishlar ham qayd etilgan (30 000 so'rovga 4 ta). Tuzatishdan keyin butun to'plamda
  5 soniyadan sekin test yo'q (0 ta); to'plam 30% tezlashdi (≈550 s → ≈390–415 s).
- **Vaqt chegarasi o'zgartirilmadi** (`testTimeout: 20 s`). U 3.1 da "yuk ostida tasodifiy yiqilish" deb ko'tarilgan edi — o'sha
  yiqilishlarning ham shu sababdan bo'lgani ehtimoli katta, lekin buni o'tgan sana bilan isbotlab bo'lmaydi. Chegarani pasaytirish — alohida qaror.

### Yakuniy tekshiruv (2026-10-06)

| Tekshiruv | Natija |
|---|---|
| Backend to'liq to'plam (begona tinglovchilar ochiq), 1-yurish | ✅ 976 o'tdi, 1 o'tkazib yuborilgan, 144 fayl |
| Backend to'liq to'plam, 2-yurish | ✅ 976 o'tdi, 1 o'tkazib yuborilgan |
| Backend `tsc` (ilova va build), ESLint | ✅ toza |
| Prisma sxema tekshiruvi | ✅ yaroqli; `prisma/` o'zgarmagan, migratsiya yo'q |
| Frontend `tsc`, ESLint | ✅ toza |
| Frontend testlari | ✅ 195/195 |
| Frontend production build | ✅ muvaffaqiyatli |
| E2E | ✅ 51/51 |

Tuzatishdan oldingi to'liq yurishlar: 4 tadan 2 tasida bittadan-ikkitadan tasodifiy yiqilish
(`finance` + `curriculum`; `endpointSecurity`) — hammasi yuqoridagi sababdan. Tuzatishdan keyin: 2/2 toza.

## Security Verification

| Tekshiruv | Holat |
|---|---|
| Filial xodimi boshqa filial to'lovlarini eksport qila olmaydi, ocha olmaydi, bekor qila/qaytara olmaydi | ✅ VERIFIED (`branchIsolation`) |
| Barcha filialni ko'radigan rol uchun hech narsa o'zgarmagan | ✅ VERIFIED |
| Mijoz IP: proxy'dan kelgan bitta manzil auditga yoziladi | ✅ VERIFIED (`clientIp`) |
| Proxy'siz rejimda mijoz yuborgan `X-Forwarded-For` e'tiborga olinmaydi (backend) | ✅ VERIFIED |
| Rate limit va login bloki mijoz bo'yicha alohida | ✅ VERIFIED (backend testi) |
| nginx `real_ip` bloki sintaksisi va xatti-harakati | ✅ VERIFIED (2026-10-08, lokal Docker, `nginx:1.27-alpine`: `nginx -t` + uch so'rov) — yopish paytida ❌ edi |
| Haqiqiy production zanjirida IP, rate limit, soxtalashtirish | ⚠️ REQUIRES PRODUCTION VERIFICATION (§1, A–G) |
| Ruxsatlar va mavjud doira yordamchilari chetlab o'tilmagan; yangi ruxsat tizimi yo'q | ✅ VERIFIED (diff ko'rigi) |

**Yopish ko'rigida topilib, tuzatilgan ikki narsa:**
1. `real_ip_recursive on` → **`off`**. `on` bo'lsa, xususiy tarmoqdan (masalan ofis LAN) kelgan mijozning o'zi "ishonchli proxy" deb
   olinib, u yuborgan soxta `X-Forwarded-For` qabul qilinardi. `off` da host nginx qo'shgan oxirgi yozuv olinadi.
2. `TRUST_PROXY: ${TRUST_PROXY:-1}` → **qat'iy `1`**. Qayta yoziladigan qilish xavfli edi: serverdagi `.env.production` da dev'dan
   ko'chirilgan `TRUST_PROXY=0` bo'lsa, hamma foydalanuvchi yana bitta IP bo'lib qolardi.

Ma'lum cheklov (o'zgarmadi): host nginx'siz rejimda xususiy tarmoqdagi mijoz sarlavhani soxtalashtira oladi.

## Financial Integrity Verification

| Tekshiruv | Holat |
|---|---|
| Parallel qaytarishlar to'lov summasidan oshmaydi; daftarda bitta yozuv | ✅ VERIFIED |
| Bekor qilish va qaytarish bir vaqtda — aralash holat yo'q | ✅ VERIFIED |
| Chegirma / tahrirlash / to'lov bir vaqtda — qarz to'lovlar tarixiga mos | ✅ VERIFIED |
| Promo limit va taklif bonusi parallel so'rovlarda bir marta | ✅ VERIFIED |
| Testlar poygani haqiqatan ushlaydi (qulflarsiz 10 tadan 7 tasi yiqiladi) | ✅ VERIFIED |
| Mavjud to'lov, daftar, davr, komissiya, onlayn to'lov testlari o'zgarishsiz o'tadi | ✅ VERIFIED |
| `Payment` snapshot ustunlari, daftar tuzilishi, sxema | ✅ o'zgarmagan |

Ko'rikda qayd etilgan, o'zgartirilmagan: (a) `payment.create` qarz qulfini o'z ichida, `debtLock.ts` dagi bilan bir xil SQL bilan oladi —
ishlab turgan yadroga tegmaslik uchun birlashtirilmadi (kichik takrorlanish); (b) o'quvchini tahrirlash va guruhga ko'chirish bir vaqtda
kelsa, nazariy o'zaro blokirovka ehtimoli bor (qatorlar turli tartibda qulflanadi) — bu Faza 0 dan **oldin ham** shunday edi, PostgreSQL
birini bekor qiladi; (c) qaytarish uchun idempotentlik kaliti yo'q — qulf ortiqcha qaytarishni yopadi, lekin tarmoq qayta urinishida
ikkinchi (summa yetsa) qaytarish yaratilishi mumkin.

## Backup Verification

| Tekshiruv | Holat |
|---|---|
| Baza nusxasi: atomik yozish, `gzip -t`, eng kichik hajm, yakunlovchi satr | ✅ VERIFIED (soxta `docker` + haqiqiy `pg_dump` 17) |
| Yuklangan fayllar arxivi va uning tarkibi | ✅ VERIFIED (soxta `docker`) |
| Xatoda yarim fayl qolmaydi, chiqish kodi 1 | ✅ VERIFIED |
| `BACKUP_REMOTE`: berilsa ko'chiradi, xatoda 1, berilmasa ogohlantiradi | ✅ VERIFIED (lokal papkaga) |
| `verify-backup.sh` bilan tiklash | ✅ VERIFIED (lokal dev baza: 107 jadval, 62 migratsiya) |
| `restore-db.sh` (ishchi bazani almashtiradi) | ❌ NOT VERIFIED — bajarilmagan (buzuvchi, interaktiv) |
| Production stack'da zaxira olish | ❌ NOT VERIFIED |
| Haqiqiy uzoq serverga `rsync` | ❌ NOT VERIFIED |
| Production nusxasidan tiklash, fayllar va baza yaxlitligi | ⚠️ REQUIRES PRODUCTION VERIFICATION ([CRM-4.0-BACKUP-RECOVERY.md](CRM-4.0-BACKUP-RECOVERY.md) §7, 9 qadam) |

Production zaxirasi **xavfsiz deb e'lon qilinmaydi**: tashqi manzil sozlanmagan va production nusxasidan tiklash sinalmagan.

## Remaining Repository Issues

Faza 0 doirasidan tashqarida qoldirilgan (ko'rsatma bo'yicha tegilmadi): qaytarish idempotentlik kaliti; qaytarish daftar yozuvida
filial; 2FA; hisobni bloklash dizayni; bitirgan o'quvchining guruhdagi o'rni; avtomatlashtirishdagi `daysBefore`; fikr va takliflar
ro'yxatida filial doirasi.

Faza 0 ichida ochiq qolgan: yo'q.

## Production Verification Required

1. ⚠️ **TRUST_PROXY / nginx** — §1 dagi 0 va A–G qadamlar (`nginx -t`, haqiqiy zanjir orqali so'rov, `audit_logs.ip`, rate limit,
   login bloki, soxta sarlavha).
2. ⚠️ **Zaxira** — `BACKUP_REMOTE`, kalitlar, saqlash muddati, haftalik tekshiruv cron'i, birinchi production nusxasi va uni
   izolyatsiyalangan muhitga tiklash; natija `CRM-4.0-BACKUP-RECOVERY.md` §9 ga yoziladi.
3. ⚠️ **Guruh xonalari** — tuzatishgacha tahrirlash orqali o'zgartirilgan xonalar saqlanmagan bo'lishi mumkin; ko'zdan kechirish.

## Final Risk Assessment

| Xavf | Daraja | Izoh |
|---|---|---|
| nginx konfiguratsiyasi sintaktik xato bo'lishi | O'rta | Bajarib tekshirilmagan. Xato bo'lsa frontend konteyneri ishga tushmaydi; `deploy.sh` sog'liq tekshiruvida to'xtab, orqaga qaytaradi. A-qadam (`nginx -t`) deploy'dan **oldin** bajarilsin |
| Haqiqiy proxy zanjiri taxmindan farq qilishi | O'rta | 0-qadam buni deploy'dan oldin ko'rsatadi |
| Moliya o'zgarishlari | Past | Qulf ostida qayta tekshiruv; muvaffaqiyatli yo'l natijasi o'zgarmagan; 110+ mavjud moliya testi o'tadi |
| Bir vaqtda kelgan ikkinchi so'rov endi 409 oladi | Past | Kutilgan o'zgarish (avval jimgina noto'g'ri yozardi) |
| Zaxira: deploy har safar fayllarni ham arxivlaydi | Past | Disk hajmi kuzatilsin (`UPLOADS_KEEP_DAYS`) |
| Test infratuzilmasi o'zgarishi | Past | Faqat testlar; ilova kodiga ta'sir yo'q |

**🔴 BLOCKER:** repozitoriy tomonida yo'q. §1 A-qadam (`nginx -t`) 2026-10-08 da lokal Docker'da bajarildi; serverda deploy skripti sog'liq tekshiruvi bilan qayta tasdiqlaydi.

**Xulosa:** Faza 0 repozitoriy tomonida yakunlandi va tekshirildi. Ikki band (1 va 6) production'da tasdiqlanmaguncha "to'liq yopilgan"
hisoblanmaydi. Faza 1 boshlanmagan.

---

## Faza 0 natijasi (2026-10-05 holati — tarix uchun; yangilangan xulosa yuqorida)

### Umumiy tekshiruv (2026-10-05)

| Tekshiruv | Natija |
|---|---|
| Backend `tsc`, ESLint, `prisma validate` | Toza |
| Backend to'liq to'plam | **976 o'tdi, 1 o'tkazib yuborilgan (144 fayl)** — ikkinchi yurishda |
| | Birinchi yurishda 974 o'tdi, 2 yiqildi: `finance.test.ts` (20 s vaqt chegarasi) va `curriculum.test.ts`. Ikkalasi alohida va ikkinchi to'liq yurishda o'tdi — yuk ostidagi ma'lum beqarorlik, lekin `curriculum` yiqilishining sababi aniqlanmagan |
| Frontend `tsc`, ESLint, testlar | Toza; 195/195 |
| Frontend production build | Muvaffaqiyatli |
| E2E | 51/51 |
| Migratsiya | **Yo'q.** `prisma/` o'zgarmagan, sxema o'zgarmagan |

### Fixed
- **2.** To'lovlar eksporti, bitta to'lov, bekor qilish va qaytarish — filial doirasida.
- **3.** Qaytarish va bekor qilish — qulf ostida; parallel so'rovlar to'lov summasidan oshmaydi.
- **4.** Chegirma berish/bekor qilish, promo limit, taklif bonusi, o'quvchini tahrirlash — qarz qulfi ostida, atomik.
- **5.** Guruhni tahrirlashda xona saqlanadi.
- **7.** Bildirishnoma toifalari — bitta manba, takrorlanishga qarshi testlar.

### Partially Fixed
- **1. TRUST_PROXY.** Repozitoriy tomoni tuzatildi va backend testlari o'tdi; **nginx konfiguratsiyasi bajarib tekshirilmagan** (Docker/nginx yo'q).
- **6. Zaxira.** Skript xavfsizroq, fayllar zaxiralanadi, tashqi nusxa imkoni bor, tiklash lokalda sinaldi; production'da tashqi manzil sozlanmagan.

### Requires Production Verification
1. `audit_logs.ip` bo'yicha nuqsonni tasdiqlash, `nginx -t`, deploy'dan keyin haqiqiy IP va soxtalashtirish sinovi (§1).
2. `BACKUP_REMOTE` ni sozlash, haftalik `verify-backup.sh` cron'i, production nusxasidan birinchi tiklash mashqi ([CRM-4.0-BACKUP-RECOVERY.md](CRM-4.0-BACKUP-RECOVERY.md) §7).
3. Xonasi tahrirlash orqali o'zgartirilgan guruhlarni ko'zdan kechirish (tuzatishgacha saqlanmagan bo'lishi mumkin).

### Blocked
Yo'q.

### Faza 0 ga kirmagan (auditda qayd etilgan, tegilmadi)
Qaytarish uchun idempotentlik kaliti (yangi ustun kerak); qaytarish daftar yozuvida filial; bitirgan o'quvchining guruhdagi o'rni;
avtomatlashtirishdagi `daysBefore`; hisobni bloklash DoS; 2FA; fikr va takliflar ro'yxatida filial doirasi. Bular alohida qaror kutadi.
