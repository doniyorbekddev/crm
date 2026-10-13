/**
 * Profil rasmini yuklashdan oldin brauzerda tayyorlash: markazdan kvadrat qirqish, 256×256 gacha kichraytirish
 * va JPEG qilib qayta kodlash.
 *
 * Nega brauzerda: (1) telefon kamerasidagi 5–10 MB rasm tarmoqqa chiqmaydi — natija ~20–40 KB;
 * (2) qayta kodlash EXIF ma'lumotlarini (jumladan suratga olingan joy koordinatalari) olib tashlaydi;
 * (3) serverga rasm kutubxonasi kerak bo'lmaydi. Server baribir tur va hajmni o'zi tekshiradi.
 */
export const AVATAR_SIZE = 256;
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';
const SOURCE_MAX_BYTES = 15 * 1024 * 1024;

export class AvatarImageError extends Error {}

/** Kvadrat qirqim: manba to'rtburchagi (sx, sy, tomon) */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!AVATAR_ACCEPT.split(',').includes(file.type)) throw new AvatarImageError('Faqat JPG, PNG yoki WEBP rasm qabul qilinadi');
  if (file.size > SOURCE_MAX_BYTES) throw new AvatarImageError('Rasm juda katta (15 MB dan oshmasin)');

  let bitmap: ImageBitmap;
  try {
    // `from-image`: telefon rasmlaridagi burilish (EXIF orientation) hisobga olinadi
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AvatarImageError('Rasmni o‘qib bo‘lmadi — boshqa fayl tanlang');
  }
  try {
    const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height);
    if (side < 32) throw new AvatarImageError('Rasm juda kichik');
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new AvatarImageError('Rasmni qayta ishlab bo‘lmadi');
    // Shaffof PNG qora fon bilan chiqmasin
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) throw new AvatarImageError('Rasmni qayta ishlab bo‘lmadi');
    return blob;
  } finally {
    bitmap.close();
  }
}
