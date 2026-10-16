const CACHE = 'library-shell-v2';
const BASE = new URL('./', self.location.href);
const SHELL = ['./', 'index.html', 'catalog.js', 'library.js', 'app.js', 'manifest.webmanifest', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new URL(path, BASE).href))).then(() => self.skipWaiting()));
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
  const isShell = request.mode === 'navigate' || SHELL.some(path => new URL(path, BASE).pathname === url.pathname);
  if (!isCover && !isShell) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isCover) {
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
