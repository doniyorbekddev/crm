/**
 * So‘rov kaliti: forma bir marta ochilganda bitta yaratiladi. Ikki marta bosish yoki tarmoq qayta
 * urinishi serverda yangi yozuv yaratmaydi. `crypto.randomUUID` faqat HTTPS/localhost'da bor —
 * lokal tarmoqdagi oddiy HTTP manzil uchun zaxira yo‘l.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
