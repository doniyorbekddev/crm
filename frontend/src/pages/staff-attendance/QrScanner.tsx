import { Camera, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';

/**
 * Ilova ichidagi QR skaner — brauzerning o'z `BarcodeDetector` API'si bilan (yangi kutubxona yo'q).
 * Qo'llab-quvvatlamaydigan brauzerda (masalan iOS Safari) telefonning oddiy kamerasi bilan skanerlash
 * tushuntiriladi: QR ichidagi havola shu sahifani token bilan ochadi — natija bir xil.
 */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function detectorClass(): BarcodeDetectorConstructor | null {
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return typeof candidate === 'function' && Boolean(navigator.mediaDevices?.getUserMedia) ? candidate : null;
}

/** QR qiymatidan token: "https://…/my-attendance?qr=TOKEN" yoki tokenning o'zi */
export function tokenFromQr(value: string): string | null {
  try {
    const url = new URL(value);
    const token = url.searchParams.get('qr');
    return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
  } catch {
    return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
  }
}

export function QrScanner({ open, onClose, onToken }: { open: boolean; onClose: () => void; onToken: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const Detector = detectorClass();

  useEffect(() => {
    if (!open || !Detector) return undefined;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Detector({ formats: ['qr_code'] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const token = codes.map((code) => tokenFromQr(code.rawValue)).find(Boolean);
            if (token) {
              onToken(token);
              return;
            }
            if (codes.length > 0) setProblem('Bu davomat QR kodi emas. Qabulxonadagi ekranni skanerlang');
          } catch {
            // Kadr hali tayyor emas — keyingisini kutamiz
          }
          timer = window.setTimeout(() => void tick(), 300);
        };
        void tick();
      } catch {
        setProblem('Kameraga ruxsat berilmadi. Brauzer sozlamasidan kameraga ruxsat bering yoki telefon kamerasi bilan skanerlang');
      }
    }
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, Detector, onToken]);

  return (
    <Modal open={open} onClose={onClose} title="QR kodni skanerlang" description="Qabulxonadagi ekrandagi QR kodni kameraga tuting">
      {Detector ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-card bg-black">
            <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline aria-label="Kamera" />
            <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-card border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {problem ? (
            <Alert tone="warning">{problem}</Alert>
          ) : (
            <p className="flex items-center gap-2 text-caption text-fg-muted">
              <Camera className="size-4" aria-hidden />
              QR kod ramkaga tushishi bilan avtomatik o‘qiladi
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-body text-fg-muted">
          <p className="flex items-start gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
            Bu brauzer ichidan skanerlay olmaydi. Telefonning oddiy kamerasini qabulxonadagi QR kodga qarating va chiqqan havolani oching — shu sahifa
            ochiladi va amalni tanlaysiz.
          </p>
          <p className="text-caption text-fg-subtle">Havola ochilganda CRM hisobingizga kirgan bo‘lishingiz kerak.</p>
        </div>
      )}
    </Modal>
  );
}
