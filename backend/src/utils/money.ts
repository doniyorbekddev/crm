/**
 * Pul va son formati (foydalanuvchiga ko‘rinadigan matnlar uchun).
 *
 * `toLocaleString('uz-UZ')` ishlatilmaydi: u Node qaysi ICU ma’lumotlari bilan qurilganiga bog‘liq —
 * "uz-UZ" bo‘lmasa ingliz formatiga tushib, vergul qo‘yib yuboradi ("7,200,000"). Guruhlash uzilmas
 * probel bilan qilinadi va frontenddagi `formatMoney` bilan bir xil natija beradi.
 */

const GROUP_SEPARATOR = ' ';

/** 7200000 → "7 200 000" */
export function groupUz(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  // Math.round(-0.2) → -0: nol har doim ishorasiz
  return rounded > 0 && value < 0 ? `-${grouped}` : grouped;
}

/** 7200000 → "7 200 000 so‘m" */
export function moneyUz(value: number): string {
  return `${groupUz(value)} so‘m`;
}
