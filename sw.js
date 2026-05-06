const CACHE_VERSION = '06.05.2026-0812';
const CACHE_NAME = `cookbook-${CACHE_VERSION}`;

const APP_SHELL = [
  '/cookbook/',
  '/cookbook/index.html',
  '/cookbook/style.css',
  '/cookbook/script.js',
  '/cookbook/manifest.json',
  '/cookbook/receitas.png',
  '/cookbook/cozinheiro.png',
  '/cookbook/icons/icone-192.png',
  '/cookbook/icons/icone-512.png',
];

const EXTERNAL_CACHE = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        [...APP_SHELL, ...EXTERNAL_CACHE].map(url =>
          cache.add(url).catch(err => console.warn('Cache falhou para:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('Removendo cache antigo:', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.hostname.includes('firebase')) return;
  if (url.hostname.includes('google-analytics')) return;

  const isAppShell = APP_SHELL.some(path => url.pathname === path || url.href === path);
  const isExternal = EXTERNAL_CACHE.some(u => event.request.url.startsWith(u));

  if (isExternal) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
