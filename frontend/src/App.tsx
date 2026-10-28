import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { MotionEffects } from '@/components/motion/MotionEffects';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { useBrandingSync } from '@/hooks/useBranding';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/routes';

function AppShell() {
  const resolvedTheme = useApplyTheme();
  useSessionBootstrap();
  useBrandingSync();

  return (
    <>
      <MotionEffects />
      <RouterProvider router={router} />
      {/* Ranglar va radius — Aurora tokenlari (index.css), ichki yorug'lik va prujinali kirish shu klass orqali */}
      <Toaster theme={resolvedTheme} position="top-right" richColors closeButton toastOptions={{ className: 'font-sans', style: { borderRadius: 'var(--radius-card)' } }} />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
