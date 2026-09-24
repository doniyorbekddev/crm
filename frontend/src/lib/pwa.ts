/**
 * Xizmat ishchisini ro'yxatdan o'tkazish.
 *
 * Faqat production qurilishida ishlaydi: `dev` rejimida kesh o'zgarishlarni yashirib qo'yadi va
 * ishlab chiqishni chalkashtiradi. Yangi versiya chiqqanda foydalanuvchiga bir marta
 * "yangilash" taklifi ko'rsatiladi — sahifani o'zi majburan yangilamaydi, chunki xodim
 * o'sha payt forma to'ldirayotgan bo'lishi mumkin.
 */
export function registerServiceWorker(onUpdateReady: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // Eski versiya ochiq turganda yangisi "waiting" holatida kutadi
            if (installing.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady();
          });
        });
      })
      .catch(() => {
        // Ro'yxatdan o'tmasa ilova oddiy ishlayveradi — bu majburiy imkoniyat emas
      });
  });
}

/** Yangi versiyaga o'tish: kutayotgan ishchiga signal beriladi va sahifa qayta yuklanadi */
export function applyServiceWorkerUpdate(): void {
  void navigator.serviceWorker.getRegistration().then((registration) => {
    registration?.waiting?.postMessage('skip-waiting');
    window.location.reload();
  });
}
