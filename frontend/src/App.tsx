import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
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
      <RouterProvider router={router} />
      <Toaster theme={resolvedTheme} position="top-right" richColors closeButton />
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
