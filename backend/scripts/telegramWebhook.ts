/**
 * Dev: `npm run telegram:webhook -- https://crm.markaz.uz` (yoki `-- --delete`).
 * Mantiq `src/cli/telegramTools.ts` da — production image'da `node dist/cli/telegramWebhook.js` (audit S9).
 */
import { runWebhook } from '../src/cli/telegramTools.js';

process.exit(await runWebhook(process.argv[2]));
