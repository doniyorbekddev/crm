/**
 * Dev: `npm run telegram:check`.
 * Mantiq `src/cli/telegramTools.ts` da — production image'da `node dist/cli/telegramCheck.js` (audit S9).
 */
import { runCheck } from '../src/cli/telegramTools.js';

process.exit(await runCheck());
