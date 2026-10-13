import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { App } from './App';
import { initLanguage } from './i18n/language.store';
import { installGlobalErrorReporting } from './lib/errorReporter';
import { applyServiceWorkerUpdate, registerServiceWorker } from './lib/pwa';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('index.html ichida #root elementi topilmadi');
}

installGlobalErrorReporting();

// Saqlangan interfeys tili (o'zbekchadan boshqa bo'lsa) avval yuklanadi — sahifa to'g'ri tilda birinchi marta chiziladi.
// Standart tilda kutish yo'q.
void initLanguage().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

// Yangi versiya tayyor bo'lsa — bir marta taklif. Majburan yangilamaymiz: xodim
// o'sha payt forma to'ldirayotgan bo'lishi mumkin.
registerServiceWorker(() => {
  toast('Yangi versiya tayyor', {
    duration: Infinity,
    action: { label: 'Yangilash', onClick: applyServiceWorkerUpdate },
  });
});
