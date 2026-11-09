const CACHE_VERSION = '09.11.2026-1';
const CACHE_NAME = `cookbook-${CACHE_VERSION}`;
const BASE = self.registration.scope; // funciona em qualquer nome de pasta

const APP_SHELL = [
  '', 'index.html', 'style.css', 'script.js', 'manifest.json',
  'receitas.png', 'cozinheiro.png',
  'icons/icon-152.png', 'icons/icone-192.png', 'icons/icone-512.png'
].map(p => new URL(p, BASE).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => console.warn('Não guardou:', url)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (sempre a versão nova), mas espera no máximo 3 segundos.
// Sem internet ou com sinal fraco, usa o que está guardado.
const comTempo = (promessa, ms) =>
  Promise.race([promessa, new Promise((_, falha) => setTimeout(() => falha(new Error('lento')), ms))]);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const ehPagina = req.mode === 'navigate';
  // Abrir pelo "compartilhar" (?title=...&text=...) usa sempre o mesmo index.html
  const chave = ehPagina ? new URL('index.html', BASE).href : req.url;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const resp = await comTempo(fetch(ehPagina ? chave : req), 3000);
      if (resp && resp.status === 200) event.waitUntil(cache.put(chave, resp.clone()));
      return resp;
    } catch (e) {
      return (await cache.match(chave)) || Response.error();
    }
  })());
});
