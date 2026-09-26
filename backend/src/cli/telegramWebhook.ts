/**
 * Webhook'ni ro'yxatdan o'tkazish / o'chirish.
 *   Production: node dist/cli/telegramWebhook.js https://crm.markaz.uz   (yoki --delete)
 *   Dev:        npm run telegram:webhook -- https://crm.markaz.uz
 */
import { runWebhook } from './telegramTools.js';

process.exit(await runWebhook(process.argv[2]));
