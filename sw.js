const CACHE_VERSION = '22.04.2026-1335';
const CACHE_NAME = `cookbook-${CACHE_VERSION}`;

const FILES_TO_CACHE = [
  '/cookbook/',
  '/cookbook/index.html',
  '/cookbook/style.css',
  '/cookbook/script.js',
  '/cookbook/manifest.json',
  '/cookbook/receitas.png',
  '/cookbook/cozinheiro.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// Instalação - cache dos arquivos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

// Fetch - estratégia cache-first para assets, network-first para API
self.addEventListener('fetch', (event) => {
  // Ignora requisições para analytics e extensões
  if (event.request.url.includes('chrome-extension') || 
      event.request.url.includes('firebase')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retorna do cache
        if (response) {
          return response;
        }
        
        // Clone da requisição
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Verifica se é uma resposta válida
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone da resposta para cache
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
            
          return response;
        });
      })
  );
});
