/* Tadreebi Mobile App Service Worker — Scoped strictly to /mobile */
const CACHE_VERSION = 'tadribi-mobile-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const PRECACHE_URLS = [
  '/mobile',
  '/mobile-manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/mobile-icon.svg',
];

const OFFLINE_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>تدريبي — دون اتصال</title>
  <style>
    body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fff;color:#3a4650;font-family:"Noto Sans Arabic",system-ui,sans-serif;padding:24px;text-align:center}
    @media (prefers-color-scheme:dark){body{background:#10150d;color:#e3eadb}}
    .card{max-width:340px;padding:28px 22px;border-radius:18px;border:1px solid rgba(164,204,57,.35);background:rgba(164,204,57,.08)}
    h1{margin:0 0 8px;font-size:1.35rem;color:#55720f}
    @media (prefers-color-scheme:dark){h1{color:#a4cc39}}
    p{margin:0 0 18px;font-size:.9rem;line-height:1.7;opacity:.85}
    button{background:#a4cc39;color:#1c2a0e;border:1px solid #7c9e1c;border-radius:12px;padding:10px 22px;font:inherit;font-weight:700;cursor:pointer}
  </style>
</head>
<body>
  <div class="card">
    <h1>أنت غير متصل بالإنترنت</h1>
    <p>تأكد من اتصالك بالشبكة ثم أعد المحاولة لمواصلة الدراسة في تدريبي.</p>
    <button onclick="location.reload()">إعادة المحاولة</button>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('tadribi-mobile-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache authenticated API, webhooks, or auth mutations/queries
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/webhooks/'))
  ) {
    return;
  }

  // Never cache cross-origin API calls except Google Fonts assets
  const isGoogleFont =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isGoogleFont) {
    return;
  }

  // Navigation requests under /mobile: Network-first, falling back to cached /mobile shell or offline HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/mobile', copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match('/mobile')) || (await caches.match(request));
          return (
            cached ||
            new Response(OFFLINE_HTML, {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
          );
        })
    );
    return;
  }

  // Static assets, icons, manifests, bundled Vite chunks, fonts: Stale-while-revalidate / Cache-first
  if (
    isGoogleFont ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/pwa-') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/mobile-icon.svg' ||
    url.pathname === '/mobile-manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
