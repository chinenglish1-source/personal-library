const CACHE = 'library-shell-v29';
const BASE = new URL('./', self.location.href);
const SHELL = ['./', 'index.html', 'catalog.js?v=29', 'library.js?v=29', 'app.js?v=29', 'voice.js?v=29', 'study.css?v=29', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
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
    // Refresh the app shell at launch, with a bounded offline fallback.
    if (request.mode === 'navigate') {
      const fresh = fetch(request).then(async response => {
        if (!response.ok) throw Error('Navigation failed');
        await cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      const response = await Promise.race([fresh, new Promise(resolve => setTimeout(() => resolve(null), 1500))]);
      if (response) return response;
      const saved = await cache.match(request) || await cache.match(BASE.href);
      if (saved) return saved;
      return (await fresh) || Response.error();
    }
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
