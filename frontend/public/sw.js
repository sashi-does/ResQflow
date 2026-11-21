/* RahatNet service worker: the app shell works offline; live data never comes from a cache.
   - /api and /ws are never touched (a stale road closure or stock level would be worse than none).
   - Hashed build files (/assets/*), icons, fonts and photos: cache-first.
   - Page navigations: network-first, falling back to the cached shell, so the app still opens with no signal
     and shows its own "connection lost, reconnecting" banner. */
const VERSION = 'v1'
const SHELL = `rahatnet-shell-${VERSION}`
const STATIC = `rahatnet-static-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rahatnet-') && k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isStatic = (url) =>
  url.origin === location.origin
    ? /^\/(assets|icons|images)\//.test(url.pathname) || url.pathname === '/favicon.svg'
    : url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com'

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === location.origin && (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws'))) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone()
              caches.open(STATIC).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
