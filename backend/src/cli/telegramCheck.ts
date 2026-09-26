/**
 * Telegram sozlamasini tekshirish (token chiqarilmaydi).
 *   Production: node dist/cli/telegramCheck.js
 *   Dev:        npm run telegram:check
 */
import { runCheck } from './telegramTools.js';

process.exit(await runCheck());
