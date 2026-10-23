const CACHE = 'library-shell-v24';
const BASE = new URL('./', self.location.href);
const SHELL = ['./', 'index.html', 'catalog.js', 'library.js?v=23', 'app.js?v=23', 'voice.js?v=23', 'study.css?v=23', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(new URL(path, BASE).href, {cache:"reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('library-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Keep large PDFs out of automatic storage. Downloads remain a deliberate choice.
  if (url.pathname.startsWith(new URL('files/', BASE).pathname)) return;
  const isCover = url.pathname.startsWith(new URL('covers/', BASE).pathname);
  const isViewer = /\/vendor\/pdf(?:\.worker)?\.min\.js$/.test(url.pathname);
  const isShell = isViewer || request.mode === 'navigate' || SHELL.some(path => new URL(path, BASE).pathname === url.pathname);
  if (!isCover && !isShell) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isCover || isShell) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      if (!response.ok) { const cached = await cache.match(request); if (cached) return cached; }
      return response;
    } catch {
      const cached = await cache.match(request) || (request.mode === 'navigate' && await cache.match(BASE.href));
      return cached || Response.error();
    }
  })());
});
