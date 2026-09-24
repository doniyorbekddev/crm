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

/** Umumiy API limiti: bitta IP’dan daqiqasiga 300 ta so‘rov. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimits,
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
