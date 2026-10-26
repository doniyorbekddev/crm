import { BellRing, ChartNoAxesCombined, PhoneCall, Wallet } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { LanguageSelect } from '@/components/LanguageSelect';
import { ThemeToggle } from '@/components/ThemeToggle';
import { appEnv } from '@/lib/env';

const FEATURES = [
  { icon: PhoneCall, title: 'Leadlar va qo‘ng‘iroqlar', text: 'Har bir mijoz bilan bo‘lgan muloqot bir joyda' },
  { icon: BellRing, title: 'Follow-up eslatmalari', text: 'Bugungi va kechikkan aloqalarni hech qachon unutmang' },
  { icon: Wallet, title: 'To‘lov va qarzdorlik', text: 'Shartnoma, to‘lovlar va qoldiq avtomatik hisoblanadi' },
  { icon: ChartNoAxesCombined, title: 'Sotuv hisobotlari', text: 'Funnel, konversiya va managerlar reytingi' },
] as const;

/**
 * Kirish sahifalari: chapda forma, o'ngda doim to'q "stage" panel (ikkala mavzuda ham) — aurora nurlari,
 * niqoblangan to'r va shishasimon karta. Panel faqat katta ekranda; telefonda forma birinchi o'rinda.
 */
export default function AuthLayout() {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="relative flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute top-4 right-4 flex items-center gap-2 sm:top-6 sm:right-6">
          <LanguageSelect />
          <ThemeToggle />
        </div>
        {/* Forma elementlari navbatma-navbat paydo bo'ladi (70ms) */}
        <div className="stagger-children w-full max-w-sm">
          <BrandMark className="mb-10" />
          <Outlet />
        </div>
      </main>

      <aside aria-label={appEnv.appName} className="relative isolate hidden overflow-hidden bg-stage p-10 text-stage-fg lg:flex lg:flex-col lg:justify-between xl:p-14">
        {/* Aurora: 3 ta sekin suzuvchi nur (18–26s) va markazdan so'nuvchi nozik to'r — bezak, o'qishga xalaqit bermaydi */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span className="aurora-orb -top-24 -left-16 size-112 animate-aurora-1 bg-(--app-stage-aurora-1)" />
          <span className="aurora-orb top-1/3 -right-24 size-104 animate-aurora-2 bg-(--app-stage-aurora-2)" />
          <span className="aurora-orb -bottom-32 left-1/4 size-96 animate-aurora-3 bg-(--app-stage-aurora-3)" />
          <div className="stage-grid absolute inset-0" />
        </div>

        <BrandMark inverted className="relative" />

        <div className="relative max-w-md">
          <h2 className="text-display text-balance text-gradient-stage">O‘quv markaz sotuv bo‘limi uchun yagona ish joyi</h2>
          <ul className="mt-8 space-y-5 rounded-card border border-stage-line bg-stage-glass p-6 shadow-stage-highlight backdrop-blur-md">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-stage-glass text-stage-accent ring-1 ring-stage-line ring-inset">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium text-stage-fg">{title}</span>
                  <span className="mt-0.5 block text-body text-stage-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-body text-stage-muted">
          © {new Date().getFullYear()} {appEnv.appName}
        </p>
      </aside>
    </div>
  );
}
