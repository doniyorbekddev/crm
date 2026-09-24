import { rateLimit } from 'express-rate-limit';
import { isTest } from '../config/env.js';
import { sendError } from '../utils/apiResponse.js';

/**
 * Testlarda limitlar o'chirilgan — aks holda har bir test bir-birining hisobini to'ldirib
 * yuborardi. Lekin limitlarning **o'zini** ham sinash kerak, shuning uchun test
 * `RATE_LIMIT_TEST=on` qo'yib ularni vaqtincha yoqishi mumkin (har so'rovda tekshiriladi).
 */
function skipLimits(): boolean {
  return isTest && process.env.RATE_LIMIT_TEST !== 'on';
}

/**
 * Webhook yo'llari (Telegram, to'lov provayderi) umumiy IP limitidan **chiqariladi**.
 *
 * Bu yo'llarga so'rov bitta manbadan — Telegram yoki provayder serverlaridan — keladi, ya'ni
 * bitta IP butun markaz uchun ishlaydi. IP bo'yicha 300/min chegara botni 300 o'quvchi bir
 * vaqtda tugma bosganda "o'chirib" qo'yardi; Telegram esa 429 ni ko'rib qayta yuboraveradi.
 * Ular uchun alohida, kengroq `webhookLimiter` bor; haqiqiy himoya — imzo (secret token).
 */
const WEBHOOK_PATHS = ['/telegram/webhook', '/payments/webhook/'];
function isWebhookPath(path: string): boolean {
  return WEBHOOK_PATHS.some((prefix) => path.startsWith(prefix));
}

/** Umumiy API limiti: bitta IP’dan daqiqasiga 300 ta so‘rov. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => skipLimits() || isWebhookPath(req.path),
  handler: (_req, res) => {
    sendError(res, 429, 'Juda ko‘p so‘rov yuborildi. Birozdan keyin qayta urinib ko‘ring.');
  },
});

/**
 * Parolni tiklash so‘rovi: soatiga 5 ta. Bu endpoint har doim 200 qaytaradi,
 * shuning uchun muvaffaqiyatli so‘rovlar ham hisobga olinadi (email spam’ining oldini olish).
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimits,
  handler: (_req, res) => {
    sendError(res, 429, 'Parolni tiklash so‘rovlari juda ko‘p. Bir soatdan keyin qayta urinib ko‘ring.');
  },
});

/** Login, parol tiklash kabi endpointlar uchun: 15 daqiqada 10 ta muvaffaqiyatsiz urinish. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipLimits,
  handler: (_req, res) => {
    sendError(res, 429, 'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring.');
  },
});

/**
 * Webhook'lar uchun: bitta IP'dan daqiqasiga 1200 ta (soniyasiga 20).
 *
 * Bu haqiqiy trafikni cheklamaydi (Telegram bitta markaz uchun bunchalik yubormaydi), lekin
 * sirli kalit sizib chiqqanda yoki noto'g'ri sozlangan mijoz tinmay urganda serverni himoya qiladi.
 * Chat bo'yicha chegara botning o'zida (`telegram/rateLimit.ts`).
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimits,
  handler: (_req, res) => {
    sendError(res, 429, 'Juda ko‘p so‘rov.');
  },
});

/**
 * Og‘ir endpointlar (global qidiruv, hisobot eksporti): daqiqasiga 30 ta.
 * Bu so‘rovlar bazaga bir nechta og‘ir so‘rov yuboradi, shuning uchun alohida cheklanadi.
 */
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimits,
  handler: (_req, res) => {
    sendError(res, 429, 'Juda ko‘p so‘rov yuborildi. Bir daqiqadan keyin qayta urinib ko‘ring.');
  },
});
