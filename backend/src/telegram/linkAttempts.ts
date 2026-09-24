/**
 * Bog'lash kodini izlashga qarshi himoya (brute-force).
 *
 * Kod 16 ta o'n oltilik belgi (64 bit) — uni tasodifan topish amalda imkonsiz. Lekin
 * urinishlar cheklanmasa, bot behuda yuk ostida qoladi va jurnal axlat bilan to'ladi.
 * Shuning uchun **ketma-ket noto'g'ri** urinishlar sanaladi: chat chegaradan oshsa,
 * belgilangan vaqtga bloklanadi.
 *
 * Muvaffaqiyatli bog'lanishda hisoblagich nolga tushadi — to'g'ri kodni kiritgan odam
 * oldingi xatolari uchun jazolanmasin.
 *
 * Nega xotirada: hisoblagich qisqa muddatli va CRM bitta jarayonda ishlaydi. Qayta
 * ishga tushirishda tozalanishi ham muammo emas — 64 bitli kodni qayta izlash baribir
 * imkonsiz. Bir necha nusxada ishlatilsa, shu faylni Redis'ga o'tkazish kifoya.
 */

/** Shuncha ketma-ket xatodan keyin chat bloklanadi */
const MAX_FAILED = 5;
/** Blok davomiyligi */
const LOCK_MS = 15 * 60_000;
/** Eskirgan yozuvlar shu oraliqda tozalanadi */
const CLEANUP_EVERY_MS = 60 * 60_000;

interface Attempts {
  failed: number;
  lockedUntil: number;
  updatedAt: number;
}

const attempts = new Map<string, Attempts>();
let lastCleanup = 0;

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  for (const [chatId, entry] of attempts) {
    if (now - entry.updatedAt > LOCK_MS && entry.lockedUntil <= now) attempts.delete(chatId);
  }
}

/** `false` — chat hozir bloklangan */
export function allowLinkAttempt(chatId: string, now: number = Date.now()): boolean {
  cleanup(now);
  const entry = attempts.get(chatId);
  return !entry || entry.lockedUntil <= now;
}

/** Noto'g'ri kod kiritildi */
export function registerFailedLinkAttempt(chatId: string, now: number = Date.now()): void {
  const entry = attempts.get(chatId) ?? { failed: 0, lockedUntil: 0, updatedAt: now };
  entry.failed += 1;
  entry.updatedAt = now;
  if (entry.failed >= MAX_FAILED) {
    entry.lockedUntil = now + LOCK_MS;
    entry.failed = 0;
  }
  attempts.set(chatId, entry);
}

/** Muvaffaqiyatli bog'lanish — hisoblagich tozalanadi */
export function resetLinkAttempts(chatId: string): void {
  attempts.delete(chatId);
}

/** Testlar uchun */
export function resetAllLinkAttempts(): void {
  attempts.clear();
  lastCleanup = 0;
}
