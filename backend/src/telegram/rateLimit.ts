/**
 * Chat darajasidagi chegara.
 *
 * HTTP darajasida `heavyLimiter` bor, lekin u **Telegram serverining** IP sini ko'radi —
 * ya'ni barcha foydalanuvchilar bitta chelakda. Bitta odam tugmani ketma-ket bosaversa,
 * qolganlar ham bloklanardi. Shuning uchun chegara chat bo'yicha hisoblanadi.
 *
 * Nega xotirada, bazada emas: CRM bitta jarayonda ishlaydi va har xabarga bitta yozuv
 * qo'shish ortiqcha yuk bo'lardi. Bir necha nusxada ishlatiladigan bo'lsa, shu faylni
 * Redis'ga o'tkazish kifoya — chaqiruv joyi o'zgarmaydi.
 */

/** Oyna davomiyligi */
const WINDOW_MS = 10_000;
/** Bitta chat shu oynada nechta update yubora oladi */
const MAX_IN_WINDOW = 20;
/** Eskirgan yozuvlar shu oraliqda tozalanadi */
const CLEANUP_EVERY_MS = 60_000;

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();
let lastCleanup = 0;

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  for (const [chatId, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(chatId);
  }
}

/**
 * `true` — o'tkazilsin, `false` — chegaradan oshdi.
 *
 * Chegaradan oshganda javob **yuborilmaydi**: aks holda flood qilayotgan odamga har
 * xabariga javob yozib, o'zimiz Telegram chegarasiga urilardik.
 */
export function allowChat(chatId: string, now: number = Date.now()): boolean {
  cleanup(now);
  const bucket = buckets.get(chatId);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(chatId, { windowStart: now, count: 1 });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= MAX_IN_WINDOW;
}

/** Testlar uchun: hisoblagichni tozalaydi */
export function resetRateLimits(): void {
  buckets.clear();
  lastCleanup = 0;
}
