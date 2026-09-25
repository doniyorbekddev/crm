# Kuzatuv (observability) — loglar, xatolar, metrikalar

> Academy CRM 3.0, TZ §67–68. Manba: `backend/src/utils/metrics.ts`, `utils/errorTracker.ts`,
> `services/observability.ts`, `middleware/slowRequest.ts`, `frontend/src/lib/errorReporter.ts`.

Hammasi **tashqi SDK'siz** va **ixtiyoriy**: sozlanmasa hech narsa yuborilmaydi va `/metrics` yopiq.

## 1. TZ §68 bandlari

| Talab | Qayerda | Metrika / manba |
|---|---|---|
| Application logs | pino (JSON), `LOG_LEVEL`; parol/token/cookie redaction | stdout |
| Error tracking | backend: 5xx, ushlanmagan istisno, job xatolari → Sentry (`SENTRY_DSN`); frontend: render, `window.error`, `unhandledrejection` → Sentry (`VITE_SENTRY_DSN`) | `errorTracker.ts`, `errorReporter.ts` |
| API latency | har so'rov, **marshrut shabloni** bo'yicha (`/students/:id`, ID emas) | `crm_http_request_duration_seconds`, `crm_http_errors_total`; sekin so'rov logi `SLOW_REQUEST_MS` |
| DB latency | Prisma `query` hodisasi | `crm_db_query_duration_seconds` |
| AI latency / errors | `completeJson` (maqsad bo'yicha) | `crm_ai_request_duration_seconds`, `crm_ai_errors_total{reason="request"\|"schema"}` |
| Notification failures | oxirgi urinishdan keyin yetkazilmagan | `crm_notification_delivery_failures_total{channel}` |
| Telegram failures | Telegram API xatolari | `crm_telegram_failures_total` |
| Queue size | scrape paytida o'qiladi | `crm_notification_queue{channel,status}`, `crm_exam_attempts_in_progress`, `crm_tasks_open`, `crm_automation_errors_24h` |
| Fon vazifalari | 14 ta job `reportJobFailure` orqali (log + metrika + Sentry) | `crm_job_failures_total{job}` |
| Jarayon | | `crm_process_uptime_seconds`, `crm_process_memory_bytes` |

## 2. `/metrics` (Prometheus)

- `METRICS_TOKEN` (≥ 24 belgi) bo'lmasa — **404** (endpoint mavjudligi ham oshkor bo'lmaydi).
- Token `Authorization: Bearer ...` bilan, `timingSafeEqual` (bayt uzunligi oldin tekshiriladi); noto'g'ri — 404.
- `/api` ostida emas, ya'ni nginx `/api` proksisi uni tashqariga chiqarmaydi; Prometheus ichki tarmoqdan oladi.

```yaml
# prometheus.yml
scrape_configs:
  - job_name: crm
    metrics_path: /metrics
    authorization: { type: Bearer, credentials_file: /etc/prometheus/crm_token }
    static_configs: [{ targets: ['backend:4000'] }]
```

Tavsiya etilgan ogohlantirishlar: p95 API > 0.8 s (5 daq), `crm_http_errors_total` o'sishi, `crm_notification_queue{status="PENDING"}` > 500, `crm_job_failures_total` o'sishi, `crm_ai_errors_total` / so'rovlar > 20%.

## 3. Maxfiylik

- Yorliqlarda foydalanuvchi ma'lumoti yo'q (marshrut shabloni, kanal, job nomi).
- Sentry hodisasi: xabar va stack'dan email, telefon (+998…), JWT, `Bearer`, `password=`/`token=` yashiriladi; so'rov tanasi, sarlavhalar, cookie yuborilmaydi; foydalanuvchi — faqat ID (backend). Frontend: URL query olib tashlanadi, sahifa yuklanishida ko'pi bilan 10 hodisa.
- Frontend DSN brauzerda ochiq bo'ladi — frontend uchun alohida Sentry loyihasi.

## 4. Yuk testi (§67 "Large dataset bilan test qil")

```bash
# katta ma'lumot (ixtiyoriy): DATABASE_URL=.../crm_perf npm run db:perf-seed
# server alohida bazada, IP limiti o'chiq holda (NODE_ENV=test — faqat bcrypt raundi va AI o'zgaradi):
NODE_ENV=test DATABASE_URL=... PORT=4400 TELEGRAM_POLLING=false npx tsx src/server.ts
LOAD_URL=http://localhost:4400 LOAD_PASSWORD=... LOAD_CONCURRENCY=10 LOAD_SECONDS=10 npm run perf:load
```

Limit yoqilgan holda natija 429 bo'ladi — bu `apiLimiter` (300/daq/IP) ishlayotganini ko'rsatadi.
p95 > `LOAD_P95_MS` (800) yoki xato bo'lsa chiqish kodi 1.

**O'lchov (2026-09-25, E2E bazasi, 10 parallel, 10 s, ~49 RPS har endpoint, 0 xato):**

| Endpoint | p50 ms | p95 ms | p99 ms |
|---|---|---|---|
| `/api/dashboard/summary` | 41 | 59 | 107 |
| `/api/students` | 13 | 20 | 41 |
| `/api/leads` | 11 | 17 | 30 |
| `/api/debts` | 17 | 23 | 45 |
| `/api/teaching/overview` | 20 | 28 | 50 |
| `/api/analytics/academic` | 24 | 33 | 60 |
| `/api/search?q=ali` | 44 | 61 | 96 |
| `/api/alerts` | 13 | 18 | 25 |
| `/api/tasks` | 9 | 13 | 22 |
