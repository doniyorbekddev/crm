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
