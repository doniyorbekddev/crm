import { BellRing, ChartNoAxesCombined, PhoneCall, Wallet } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { appEnv } from '@/lib/env';

const FEATURES = [
  { icon: PhoneCall, title: 'Leadlar va qo‘ng‘iroqlar', text: 'Har bir mijoz bilan bo‘lgan muloqot bir joyda' },
  { icon: BellRing, title: 'Follow-up eslatmalari', text: 'Bugungi va kechikkan aloqalarni hech qachon unutmang' },
  { icon: Wallet, title: 'To‘lov va qarzdorlik', text: 'Shartnoma, to‘lovlar va qoldiq avtomatik hisoblanadi' },
  { icon: ChartNoAxesCombined, title: 'Sotuv hisobotlari', text: 'Funnel, konversiya va managerlar reytingi' },
] as const;

export default function AuthLayout() {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden bg-brand-800 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">

        <BrandMark inverted className="relative" />

        <div className="relative max-w-md">
          <h2 className="text-display text-balance">
            O‘quv markaz sotuv bo‘limi uchun yagona ish joyi
          </h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-white/10 ring-1 ring-white/15 ring-inset">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-0.5 block text-body text-white/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-body text-white/60">
          © {new Date().getFullYear()} {appEnv.appName}
        </p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <BrandMark className="mb-10 lg:hidden" />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
