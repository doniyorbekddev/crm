import { config } from 'dotenv';
import { z } from 'zod';

config({ quiet: true });

const urlList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .pipe(z.array(z.url('CLIENT_URL to‘g‘ri URL bo‘lishi kerak')).min(1));

/** Bo‘sh qator `undefined` deb hisoblanadi (.env da `SMTP_HOST=` kabi qatorlar uchun). */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z
      .string('DATABASE_URL majburiy')
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL postgresql:// bilan boshlanishi kerak'),
    JWT_SECRET: z.string('JWT_SECRET majburiy').min(32, 'JWT_SECRET kamida 32 belgi bo‘lishi kerak'),
    JWT_REFRESH_SECRET: z
      .string('JWT_REFRESH_SECRET majburiy')
      .min(32, 'JWT_REFRESH_SECRET kamida 32 belgi bo‘lishi kerak'),
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, 'JWT_ACCESS_EXPIRES_IN formati: 15m, 1h, 1d')
      .default('15m'),
    JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(30),
    CLIENT_URL: urlList,
    /** "Bugun", "ertaga" kabi hisoblar uchun o‘quv markaz vaqt mintaqasi (UTC dan farq, daqiqa). Toshkent: +300 */
    APP_UTC_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(300),
    /** Frontend va API turli subdomenlarda bo‘lsa (masalan: .example.uz) */
    COOKIE_DOMAIN: optionalString,
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Shu vaqtdan uzoq davom etgan so‘rovlar ogohlantirish sifatida logga tushadi */
    SLOW_REQUEST_MS: z.coerce.number().int().min(50).max(60_000).default(800),
    /** Yuklangan hujjatlar papkasi — public emas, yuklab olish faqat API orqali */
    UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(5),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanString,
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    SMTP_FROM: z.string().trim().min(3).default('Sales CRM <no-reply@localhost>'),

    // --- Telegram bot (ixtiyoriy) ---
    // Token berilmasa bot "o'chirilgan rejim"da ishlaydi: xabarlar yuborilmaydi,
    // lekin navbat, bog'lanish va barcha mantiq ishlayveradi (loglarga yoziladi).
    TELEGRAM_BOT_TOKEN: optionalString,
    /// Webhook so'rovini tekshirish uchun: Telegram X-Telegram-Bot-Api-Secret-Token sarlavhasida qaytaradi
    TELEGRAM_WEBHOOK_SECRET: optionalString,
    /// Bot foydalanuvchi nomi — kabinetdagi "Telegramni ulash" havolasi uchun (masalan: markaz_crm_bot)
    TELEGRAM_BOT_USERNAME: optionalString,
    /**
     * Sinov rejimi: bot Telegramdan yangiliklarni **o'zi so'rab** turadi (long polling).
     *
     * Ishlab chiqishda kerak: `localhost` ga Telegram webhook yubora olmaydi, tunnel esa
     * ortiqcha tayyorgarlik. Productionda **webhook** ishlatiladi — u tezroq va bitta
     * botda ikkalasi birga ishlamaydi (Telegram `getUpdates` ni 409 bilan rad etadi).
     */
    TELEGRAM_POLLING: booleanString,
    /** Bir xodim soatiga yuborishi mumkin bo'lgan ommaviy xabarlar (TZ 3.1 GAP-15) */
    BROADCAST_HOURLY_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
    // --- AI (ixtiyoriy, TZ 3.0 §30–41) ---
    // Kalit berilmasa AI akademik markaz **qoidalar rejimida** ishlaydi: faktlar, ballar, tavsiyalar
    // CRM ma'lumotidan kod bilan hisoblanadi; til modeli faqat matnni boyitadi.
    ANTHROPIC_API_KEY: optionalString,
    AI_MODEL: z.string().trim().min(3).default('claude-sonnet-5'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(25_000),
    // --- Kuzatuv (TZ 3.0 §68) ---
    /** `/metrics` (Prometheus) uchun Bearer token; bo'sh — endpoint o'chiq (404) */
    // Qisqa token taxmin qilinishi mumkin — /metrics ichki holatni (navbat, xatolar) ochadi
    METRICS_TOKEN: optionalString.refine((value) => value === undefined || value.length >= 24, 'METRICS_TOKEN kamida 24 belgi bo‘lishi kerak'),
    /** Xatolarni Sentry'ga yuborish (ixtiyoriy): https://<key>@<host>/<projectId> */
    SENTRY_DSN: optionalString,
    /** Sinov to'lov provayderi uchun imzo kaliti — bo'sh bo'lsa provayder o'chiq */
    PAYMENT_SANDBOX_SECRET: optionalString,

    // --- Click / Payme (TZ 3.1 GAP-17). Bo'sh — provayder o'chiq (webhook 503, havola yo'q) ---
    /** `test` — sinov kabineti (UI'da "sinov" deb ko'rsatiladi); `production` — faqat haqiqiy merchant bilan */
    CLICK_MODE: z.enum(['test', 'production']).default('test'),
    CLICK_SERVICE_ID: optionalString,
    CLICK_MERCHANT_ID: optionalString,
    CLICK_SECRET_KEY: optionalString,
    /** Merchant API (to'lovni qaytarish) uchun — ixtiyoriy */
    CLICK_MERCHANT_USER_ID: optionalString,
    PAYME_MODE: z.enum(['test', 'production']).default('test'),
    PAYME_MERCHANT_ID: optionalString,
    /** Kassa kaliti (test yoki production) — Basic auth paroli */
    PAYME_KEY: optionalString,
    /** Payme kabinetida sozlangan hisob maydoni (`account.<maydon>`) */
    PAYME_ACCOUNT_FIELD: z.string().trim().regex(/^[a-z_]{2,32}$/).default('order_id'),
    /** Fiskal chek (OFD) uchun: MXIK (IKPU) va o'lchov birligi kodi — ikkalasi berilsa `detail` qaytariladi */
    PAYME_FISCAL_MXIK: optionalString,
    PAYME_FISCAL_PACKAGE_CODE: optionalString,
    /** To'lovdan keyin qaytiladigan sahifa (bo'lmasa — birinchi CLIENT_URL) */
    PAYMENT_RETURN_URL: optionalString,
  })
  .refine((values) => values.JWT_SECRET !== values.JWT_REFRESH_SECRET, {
    message: 'JWT_SECRET va JWT_REFRESH_SECRET bir-biridan farq qilishi kerak',
    path: ['JWT_REFRESH_SECRET'],
  });

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `\nEnvironment o‘zgaruvchilari noto‘g‘ri:\n${z.prettifyError(parsed.error)}\n\n` +
      'backend/.env faylini backend/.env.example asosida to‘ldiring.\n\n',
  );
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Email’dagi havolalar uchun asosiy frontend manzili (CLIENT_URL ro‘yxatidagi birinchisi). */
export const primaryClientUrl = (env.CLIENT_URL[0] ?? 'http://localhost:5173').replace(/\/+$/, '');
