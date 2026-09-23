import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/**
 * QR kod — inline SVG. Rasm fayli yaratilmaydi: chop etishda ham, qorong'i mavzuda ham
 * toza chiqadi va serverga so'rov yubormaydi.
 */
export function QrCode({ value, size = 128, className }: { value: string; size?: number; className?: string }) {
  const path = useMemo(() => {
    // Type 0 — kerakli o'lchamni kutubxona o'zi tanlaydi; 'M' — o'rtacha xatolarga chidamlilik
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();

    const count = qr.getModuleCount();
    const parts: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) parts.push(`M${column} ${row}h1v1h-1z`);
      }
    }
    return { d: parts.join(''), count };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${path.count} ${path.count}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="QR kod"
      shapeRendering="crispEdges"
    >
      <rect width={path.count} height={path.count} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}
