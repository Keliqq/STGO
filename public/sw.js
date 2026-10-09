/**
 * Service worker: офлайн-режим для статики (PWA).
 * · навигация — network-first, при отсутствии сети отдаём index.html из кэша;
 * · статика (js/css/данные/манифест) — stale-while-revalidate: сразу из кэша, обновление фоном;
 *   имена чанков содержимое-зависимые, поэтому устаревший кэш безопасен.
 * Картинки Kabam (playshoptitans.com / stcentral-hub) не кэшируем — при отсутствии сети GameIcon покажет заглушку.
 */
const CACHE = 'st-app-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  if (new URL(req.url).origin !== self.location.origin) return
  event.respondWith(
    req.mode === 'navigate'
      ? fetch(req)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          })
          .catch(() => caches.match(req).then((r) => r || caches.match('./index.html') || caches.match('./')))
      : caches.match(req).then(
          (hit) => {
            const refresh = fetch(req)
              .then((res) => {
                if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()))
                return res
              })
              .catch(() => {})
            void refresh
            return hit || refresh
          },
        ),
  )
})
