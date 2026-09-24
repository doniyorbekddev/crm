import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { App } from './App';
import { applyServiceWorkerUpdate, registerServiceWorker } from './lib/pwa';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('index.html ichida #root elementi topilmadi');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Yangi versiya tayyor bo'lsa — bir marta taklif. Majburan yangilamaymiz: xodim
// o'sha payt forma to'ldirayotgan bo'lishi mumkin.
registerServiceWorker(() => {
  toast('Yangi versiya tayyor', {
    duration: Infinity,
    action: { label: 'Yangilash', onClick: applyServiceWorkerUpdate },
  });
});
