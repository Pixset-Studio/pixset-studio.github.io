/* PixTool service worker — v2.0.0 (2026-08-08) */
const CACHE = 'pixtool-2.0.0-17d365bd4a';
const PRECACHE = [
  "./",
  "./assets/app.css",
  "./assets/app.js",
  "./assets/favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./manifest.webmanifest",
  "./t/image-convert/",
  "./t/image-compress/",
  "./t/image-resize/",
  "./t/image-crop/",
  "./t/image-watermark/",
  "./t/image-bgremove/",
  "./t/image-exif/",
  "./t/image-favicon/",
  "./t/image-placeholder/",
  "./t/image-compare/",
  "./t/image-retro/",
  "./t/image-editor/",
  "./t/media-record/",
  "./t/media-frames/",
  "./t/media-gif/",
  "./t/media-audio/",
  "./t/data-json/",
  "./t/data-base64/",
  "./t/data-hash/",
  "./t/data-jwt/",
  "./t/data-uuid/",
  "./t/data-crypto/",
  "./t/text-tools/",
  "./t/text-diff/",
  "./t/text-regex/",
  "./t/data-datetime/",
  "./t/data-numbers/",
  "./t/data-url/",
  "./t/data-mock/",
  "./t/design-color/",
  "./t/design-palette/",
  "./t/design-gradient/",
  "./t/design-shadow/",
  "./t/design-bezier/",
  "./t/design-meta/",
  "./t/design-pattern/",
  "./t/design-units/",
  "./t/doc-pdf/",
  "./t/doc-pdf-images/",
  "./t/doc-pdf-text/",
  "./t/doc-markdown/",
  "./t/doc-table/",
  "./t/doc-convert/",
  "./t/util-qr/",
  "./t/util-password/",
  "./t/util-units/",
  "./t/util-percent/",
  "./t/util-random/",
  "./t/util-notes/"
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Разметка и код — сначала из сети (чтобы обновления доезжали сразу),
   библиотеки, картинки и прочее — сначала из кэша (они неизменны в рамках сборки). */
function isFresh(request){
  return request.mode === 'navigate' ||
         /\.(?:html|js|css|webmanifest)(?:$|\?)/.test(new URL(request.url).pathname) &&
         !/\/assets\/vendor\//.test(new URL(request.url).pathname);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;
  const origin = new URL(request.url).origin;

  // шрифты Google кладём в кэш, чтобы офлайн выглядел так же, как онлайн
  if (origin === 'https://fonts.googleapis.com' || origin === 'https://fonts.gstatic.com'){
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => cached))
    );
    return;
  }
  if (origin !== self.location.origin) return;

  if (isFresh(request)){
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200){
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then(c => c || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.status === 200){
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});

/* Догрузка тяжёлых модулей для полноценного офлайна — по кнопке в справке. */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PRECACHE_VENDOR'){
    event.waitUntil(
      caches.open(CACHE)
        .then(cache => cache.addAll(event.data.urls))
        .then(() => event.source && event.source.postMessage({ type: 'VENDOR_READY' }))
        .catch(() => event.source && event.source.postMessage({ type: 'VENDOR_FAILED' }))
    );
  }
});
