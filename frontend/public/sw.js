/**
 * Xizmat ishchisi (service worker).
 *
 * Maqsad — o'qituvchi va manager telefonda ilovani tez ochishi va tarmoq bir zumga uzilganda
 * ham "oq ekran" ko'rmasligi. Shuning uchun:
 *  - **API hech qachon keshlanmaydi:** moliya va davomat ma'lumoti eskirgan bo'lishi mumkin emas.
 *  - Sahifa ochilishi (navigation) — avval tarmoq, ishlamasa keshdagi qobiq.
 *  - Statik fayllar (JS, CSS, rasm) — keshdan beriladi va fonda yangilanadi. Vite fayl nomiga
 *    xesh qo'shadi, shuning uchun eski fayl yangisini bosib qolmaydi.
 */
const VERSION = 'crm-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SHELL_URL, '/favicon.svg', '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Boshqa manbalar va API — xizmat ishchisi umuman aralashmaydi
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Sahifa ochilishi: avval tarmoq, ishlamasa keshdagi qobiq
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Statik fayllar: keshdan ber, fonda yangila
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});

// Yangi versiya tayyor bo'lganda ilova "darhol o'tish" ni so'rashi mumkin
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});
