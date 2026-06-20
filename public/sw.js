const CACHE_NAME = "workout-tracker-v3"
const urlsToCache = ["/", "/workout", "/history", "/progress", "/prs"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache)
    }),
  )
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  // Network-first for page navigations: always try to load the freshest HTML
  // so a new deploy is picked up immediately. Fall back to the cached shell
  // only when the network is unavailable (offline). A cache-first strategy
  // here would pin the app to whatever HTML was cached at install time and
  // never surface new builds until CACHE_NAME changed.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    )
    return
  }

  // Cache-first for everything else. Next.js static assets are content-hashed,
  // so a stale match is always safe and new builds fetch fresh URLs.
  event.respondWith(
    caches.match(request).then((response) => {
      return response || fetch(request)
    }),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => self.clients.claim()),
  )
})
