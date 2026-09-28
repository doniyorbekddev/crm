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

/** `productionEnvIssues` tekshiradigan qiymatlar (sxema natijasining bir qismi) */
export interface EnvRuleInput {
  NODE_ENV: 'development' | 'test' | 'production';
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_POLLING: boolean;
  CLICK_SERVICE_ID?: string;
  CLICK_MERCHANT_ID?: string;
  CLICK_SECRET_KEY?: string;
  PAYME_MERCHANT_ID?: string;
  PAYME_KEY?: string;
  CODE_RUNNER_URL?: string;
  CODE_RUNNER_TOKEN?: string;
}

/** Telegram `secret_token` faqat shu belgilarni qabul qiladi (setWebhook, 1–256 belgi) */
const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * TZ 3.1 §45 — ishga tushishdan oldingi tekshiruv (PHASE 21). Qisman sozlangan provayder yoki productionda xavfsiz
 * bo'lmagan Telegram rejimi — server **umuman ko'tarilmaydi** (jimgina o'chiq ishlash o'rniga).
 */
export function productionEnvIssues(values: EnvRuleInput): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  const production = values.NODE_ENV === 'production';

  if (values.TELEGRAM_WEBHOOK_SECRET && !TELEGRAM_SECRET_PATTERN.test(values.TELEGRAM_WEBHOOK_SECRET)) {
    issues.push({ path: 'TELEGRAM_WEBHOOK_SECRET', message: 'Faqat A-Z, a-z, 0-9, "_" va "-" (Telegram talabi)' });
  }
  if (production && values.TELEGRAM_BOT_TOKEN) {
    if (!values.TELEGRAM_WEBHOOK_SECRET || values.TELEGRAM_WEBHOOK_SECRET.length < 32) {
      issues.push({ path: 'TELEGRAM_WEBHOOK_SECRET', message: 'Productionda bot yoqilgan bo‘lsa webhook siri majburiy (kamida 32 belgi)' });
    }
  }
  if (production && values.TELEGRAM_POLLING) {
    issues.push({ path: 'TELEGRAM_POLLING', message: 'Productionda faqat webhook: TELEGRAM_POLLING=false qiling' });
  }

  const click = [values.CLICK_SERVICE_ID, values.CLICK_MERCHANT_ID, values.CLICK_SECRET_KEY];
  if (click.some(Boolean) && !click.every(Boolean)) {
    issues.push({ path: 'CLICK_SECRET_KEY', message: 'Click qisman sozlangan: CLICK_SERVICE_ID, CLICK_MERCHANT_ID va CLICK_SECRET_KEY birga berilishi kerak' });
  }
  if (Boolean(values.PAYME_MERCHANT_ID) !== Boolean(values.PAYME_KEY)) {
    issues.push({ path: 'PAYME_KEY', message: 'Payme qisman sozlangan: PAYME_MERCHANT_ID va PAYME_KEY birga berilishi kerak' });
  }

  if (values.CODE_RUNNER_URL) {
    if (!z.url().safeParse(values.CODE_RUNNER_URL).success) {
      issues.push({ path: 'CODE_RUNNER_URL', message: 'To‘g‘ri URL bo‘lishi kerak' });
    }
    if (!values.CODE_RUNNER_TOKEN || values.CODE_RUNNER_TOKEN.length < 32) {
      issues.push({ path: 'CODE_RUNNER_TOKEN', message: 'Runner ulangan bo‘lsa token majburiy (kamida 32 belgi, runner bilan bir xil)' });
    }
  }
  return issues;
}

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

    // --- Kod sandbox (TZ 3.1 GAP-19): alohida runner server. Bo'sh — kod bajarilmaydi (soxta natija yo'q) ---
    CODE_RUNNER_URL: optionalString,
    CODE_RUNNER_TOKEN: optionalString,
  })
  .refine((values) => values.JWT_SECRET !== values.JWT_REFRESH_SECRET, {
    message: 'JWT_SECRET va JWT_REFRESH_SECRET bir-biridan farq qilishi kerak',
    path: ['JWT_REFRESH_SECRET'],
  })
  .superRefine((values, context) => {
    for (const issue of productionEnvIssues(values)) context.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
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
