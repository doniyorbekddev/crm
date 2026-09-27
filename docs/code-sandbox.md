# Kod sandbox (dasturlash vazifalarini xavfsiz tekshirish)

> Academy CRM 3.1, GAP-19. Qaror (2026-09-27): **alohida runner server**. Kod: `code-runner/` (runner xizmati),
> `backend/src/services/codeRun.service.ts` (CRM navbati), `backend/src/jobs/codeRun.job.ts`.

## 1. Maqsad va chegara

O'quvchi **JavaScript, TypeScript, Python** kodini o'qituvchi yozgan testlar (kirish → kutilgan chiqish) bilan
tekshirish. **HTML/CSS** serverda bajarilmaydi — brauzerda `iframe sandbox` (pastda).

Talab (TZ): o'quvchi kodi — asosiy serverda **emas**; baza, fayl tizimi, tarmoq, sirlar va host tizimiga kirishsiz.

**Hech qachon soxta natija yo'q:** runner sozlanmagan (`CODE_RUNNER_URL` bo'sh) yoki ishlamasa — CRM "kod bajarish
ulanmagan / xato" deydi, "o'tdi" demaydi.

## 2. Arxitektura

```
 CRM server (backend)                         Runner server (alohida VPS)
 ───────────────────                          ──────────────────────────
 o'quvchi kodni topshiradi                    code-runner (Node, root emas, faqat HTTP)
   │                                            │  POST /v1/runs  (Bearer token, IP allowlist, TLS)
   ▼                                            ▼
 code_runs (QUEUED) ──job (30 s)──HTTPS──►  navbat (≤ N parallel) → har test uchun YANGI konteyner:
   ▲                                          docker run --rm --runtime=runsc (gVisor)
   │                                            --network none  --read-only  --tmpfs /tmp (16 MB)
   └──────── natija (JSON) ◄───────────────     --user 65534  --cap-drop ALL  --security-opt no-new-privileges
 code_runs (PASSED/FAILED/ERROR)                --memory 128m (swap yo'q)  --cpus 0.5  --pids-limit 32
 o'qituvchi va o'quvchi ko'radi                  --ulimit fsize=1 MB, nofile=64   vaqt: timeout + docker kill
                                                kod va kirish — ENV orqali (bind mount YO'Q, host fayli yo'q)
```

| Qatlam | Nima himoya qiladi |
|---|---|
| Alohida server | CRM, baza va sirlar boshqa mashinada — runner butunlay buzilsa ham CRM'ga yo'l yo'q (runnerda baza manzili ham, CRM sirlari ham yo'q) |
| gVisor (`runsc`) | konteyner ichidagi kod host yadrosiga to'g'ridan-to'g'ri syscall qila olmaydi (yadro zaifliklari orqali chiqish) |
| `--network none` | tarmoq yo'q (faqat `lo`) — CRM, internet, metadata servislariga so'rov yo'q |
| `--read-only` + `tmpfs /tmp` (16 MB) | tizim fayllarini o'zgartirib bo'lmaydi; yozish faqat vaqtinchalik xotiraga, hajm cheklangan |
| bind mount yo'q | host fayllari konteynerga umuman ulanmaydi |
| `--user 65534` (nobody), `--cap-drop ALL`, `no-new-privileges` | root yo'q, imtiyoz olish yo'q |
| `--memory 128m --memory-swap 128m` | xotira bombasi — OOM, host ta'sirlanmaydi |
| `--cpus 0.5`, `--pids-limit 32` | CPU va fork bomba cheklangan |
| `timeout -s KILL` + runner `docker kill` | cheksiz sikl — vaqt tugashi bilan o'ldiriladi |
| chiqish ≤ 64 KB | chiqish bombasi — runner o'qishni to'xtatadi va konteynerni o'ldiradi |
| ENV da faqat kod va kirish | runnerning o'z muhiti (token) konteynerga o'tmaydi |
| navbat va parallel chegara | runner ortiqcha yuklanmaydi (to'lsa 429, CRM keyinroq qayta yuboradi) |

## 3. Infratuzilma talablari (runner server)

| Talab | Qiymat |
|---|---|
| Server | alohida VPS: 2 vCPU, 2–4 GB RAM, 20 GB disk (≈ 4 parallel ish) |
| OS | Ubuntu 24.04 LTS, avtomatik xavfsizlik yangilanishlari |
| Konteyner | Docker Engine (rootless tavsiya) + **gVisor** (`runsc`), `CODE_RUNNER_RUNTIME=runsc` |
| Tasvirlar | `node:24-alpine`, `python:3.13-alpine` — oldindan yuklangan, versiya qotirilgan |
| Tarmoq | runner porti **faqat CRM server IP'siga** ochiq (firewall), TLS (nginx) yoki ichki (WireGuard/privat) tarmoq |
| Sirlar | faqat `CODE_RUNNER_TOKEN` (CRM bilan umumiy, ≥ 32 belgi) — baza/CRM kalitlari **yo'q** |
| Monitoring | `/health`, disk, `docker ps` osilib qolgan konteyner yo'qligi |

Runner xizmati o'zi konteynerda **emas**, hostda (systemd, alohida foydalanuvchi, docker guruhi) ishlaydi — Docker
socket'ini konteynerga ulash (root'ga teng) oldi olinadi.

## 4. CRM tomoni

- Vazifada: `codeLanguage` (javascript/typescript/python/html) va `codeTests` — `[{ input, expected, hidden? }]`
  (≤ 10 ta; `hidden` — o'quvchiga faqat natija, kirish/kutilgan ko'rsatilmaydi).
- Topshirilganda (web kabinet yoki Telegram) kod bo'lsa, testlar bo'lsa va runner sozlangan bo'lsa → `code_runs`
  (QUEUED). Aks holda run yaratilmaydi (UI: "kod bajarish ulanmagan").
- Job har 30 s: navbatdan oladi (shartli `QUEUED → RUNNING`), runnerga yuboradi, natijani yozadi. Runner javob bermasa —
  3 urinish, keyin `ERROR` ("runner javob bermadi") — "o'tdi" hech qachon emas.
- Natija: holat, `passed/total`, har test — o'tdi/yo'q, vaqt, chiqish (kesilgan), sabab (vaqt, xotira, xato).
  O'qituvchi — to'liq; o'quvchi — yashirin testlar kirish/chiqishisiz.
- Baho qo'yilmaydi — natija o'qituvchiga yordam (baholash o'qituvchida).

## 5. HTML/CSS

Serverda bajarilmaydi. Ko'rish — brauzerda `<iframe sandbox="allow-scripts" srcdoc=…>` (`allow-same-origin` **yo'q** —
alohida "opaque" manba, CRM cookie/token'iga kira olmaydi) va CSP `default-src 'none'` (tarmoq so'rovi yo'q).

## 6. Sozlash

CRM (`backend/.env`): `CODE_RUNNER_URL=https://runner.markaz.uz`, `CODE_RUNNER_TOKEN=…` (bo'sh — o'chiq).
Runner (`code-runner/.env`): `CODE_RUNNER_TOKEN`, `CODE_RUNNER_PORT=4100`, `CODE_RUNNER_RUNTIME=runsc`,
`CODE_RUNNER_CONCURRENCY=2`. Batafsil ishga tushirish — `code-runner/README.md`.

## 7. Xavfsizlik testlari (TZ §41)

`code-runner/tests/security.test.ts` — **haqiqiy Docker konteynerlarida** (runner kodi orqali, soxta emas):
cheksiz sikl, xotira bombasi, fayl tizimi (host fayllari, `/etc`, rootfs'ga yozish), tarmoq (tashqi va host),
jarayon (fork bomba, `child_process`/`subprocess`), sirlar (muhit o'zgaruvchilari, runner tokeni) — hammasi bloklanadi.
Docker bo'lmagan muhitda test o'tkazib yuboriladi va buni aniq aytadi.

## 8. Tekshiruv holati (2026-09-27)

| Nima | Qanday | Natija |
|---|---|---|
| §41 xavfsizlik (16 ta) | `code-runner/tests/security.test.ts`, haqiqiy konteynerlar (Colima, Docker 29.5, **runc**) | ✅ hammasi bloklandi |
| Runner HTTP (auth 401, 422, 429, health) | `code-runner/tests/server.test.ts` | ✅ |
| CRM → runner → natija (alohida jarayon, haqiqiy konteyner) | `backend/tests/codeRun.test.ts` | ✅ to'g'ri kod PASSED, taqiqlangan kod FAILED |
| Runner yo'q — soxta natija yo'q | backend + E2E (GAP-19) | ✅ run yaratilmaydi, UI "ulanmagan" |
| **gVisor (`runsc`)** | macOS'da mavjud emas | ⏳ runner serverda `CODE_RUNNER_RUNTIME=runsc npm test` bilan tekshirilishi shart |

**Topilgan va tuzatilgan:** Python himoya muqaddimasi dastlab `os.listdir` ni butunlay bloklab, standart
kutubxona importlarini (`re`, `subprocess`, `encodings.idna`) buzardi — endi papka ro'yxati faqat standart kutubxona
ichida ruxsat. Testlar noto'g'ri sabab bilan "bloklangan" ko'rinishini ham ushladi (sabab tekshiriladi).

**Chegaralar:** til darajasidagi to'siqlar (Node permission model, Python audit hook) — qo'shimcha qatlam; asosiy
chegara — konteyner (+ gVisor). Python audit hook nazariy chetlab o'tilishi mumkin (ctypes bloklangan), shuning uchun
konteyner darajasi alohida testlangan (til himoyasisiz xom shell/node bilan).
