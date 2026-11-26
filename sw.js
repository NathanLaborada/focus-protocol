// Lets the web version open offline. Network first, so you get the newest version whenever you're online;
// the cached copy is only used when the network fails.
const CACHE = 'focus-protocol';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })), // ignoreSearch: ?speed=60 still matches
  );
});
